import { BrowserWindow, screen } from 'electron'
import type { CoachBubblePayload, CoachPetState } from './types'
import { getCoachConfigForRenderer, loadCoachConfig, saveCoachConfig } from '../app/config'
import { shellUrl } from '../app/appProtocol'
import { registerCoachWebContents, unregisterCoachWebContents } from '../ipc/trustedSender'
import {
  DEFAULT_COACH_PIN_MODE,
  normalizeCoachPinMode,
  resolvePetPinDecision,
  type CoachPinMode,
  type PetPinDecision,
} from './petPinPolicy'

/**
 * Coach 桌宠透明悬浮窗口。
 *
 * 设计要点：
 * - transparent + frame:false + skipTaskbar + hasShadow:false + resizable:false
 * - 置顶策略三档可配（B5.5 / D30）：follow（默认，跟随最近活跃壳且壳失焦即解绑）、
 *   always（全局置顶，旧行为）、dock（停靠不置顶）。判定在 petPinPolicy.ts，
 *   本类只负责把决策落到窗口上并在模式/归属/焦点变化时重算
 * - 默认点击穿透（setIgnoreMouseEvents(true, { forward: true })），
 *   renderer hover 到交互区域时通过 IPC 临时关闭穿透，离开恢复
 * - 拖拽移动：renderer 监听 mousedown/mousemove/mouseup，通过 IPC 调用 startDrag/dragTo/endDrag，
 *   主进程用 setPosition 移动窗口（避免 renderer 内 setBounds 跨进程抖动）
 * - 与主窗口生命周期绑定：主窗口关闭时调用 destroy()
 * - 加载路由：dev `${devServerUrl}#/coach-pet`，prod `app://shell/index.html#/coach-pet`
 *
 * 阶段 1 只做视觉壳；阶段 2 会扩展主进程侧规则引擎、事件桥、ContestGuard，
 * 它们会通过 setPetState / showBubble 等方法驱动本窗口。
 */
export interface CoachPetWindowOptions {
  /** preload 路径，与主窗口保持一致（preload.mjs） */
  preloadPath: string
  /** dev server URL，存在时走 localhost loadURL，否则走 app://shell */
  devServerUrl?: string
  /** 渲染产物目录（由主进程 appProtocol handler 使用） */
  rendererDist: string
}

const PET_WINDOW_WIDTH = 400
const PET_WINDOW_HEIGHT = 640

/**
 * 壳失焦后延后多久复核再决定解绑 parent。见 handleFollowedWindowBlur。
 *
 * 下界要远大于一帧（16ms），才能盖住 setParentWindow 自己扰动出的瞬时失焦；
 * 上界要小到用户察觉不到桌宠"晚了一下才让开原生菜单"。120ms 同时满足两侧。
 */
const BLUR_DETACH_VERIFY_MS = 120

export class CoachPetWindow {
  private win: BrowserWindow | null = null
  private followedWindow: BrowserWindow | null = null
  private readonly options: CoachPetWindowOptions
  private currentState: CoachPetState = 'idle'
  private dragging = false
  private dragPollTimer: NodeJS.Timeout | null = null
  private lastCursorPos = { x: 0, y: 0 }
  private lastCursorMoveTime = 0
  private pinMode: CoachPinMode = DEFAULT_COACH_PIN_MODE
  /** 被跟随壳当前是否聚焦。原生菜单/模态弹出会让壳失焦，follow 模式据此解绑 parent */
  private followedWindowFocused = false
  /** 上次真正落到窗口上的决策与 parent，用于跳过无变化的重设 */
  private lastDecision: PetPinDecision | null = null
  private lastParent: BrowserWindow | null = null
  /** 待复核的失焦解绑。见 handleFollowedWindowBlur 的说明 */
  private pendingBlurTimer: NodeJS.Timeout | null = null
  /** 上次落到窗口上的穿透状态，用于跳过重复的命中测试重设 */
  private lastIgnoreMouseEvents: boolean | null = null
  /** 防抖计时器：防止 setIgnoreMouseEvents 被疯狂调用 */
  private ignoreMouseEventsDebounceTimer: NodeJS.Timeout | null = null
  /** 待应用的穿透状态（防抖期间的最新值） */
  private pendingIgnoreMouseEvents: boolean | null = null
  /** 正在应用置顶决策，期间屏蔽焦点事件处理，避免 setParentWindow 自己扰动出的焦点事件触发新决策 */
  private applyingPinDecision = false

  constructor(options: CoachPetWindowOptions) {
    this.options = options
  }

  /**
   * 创建并显示桌宠窗口。重复调用安全（已存在则 no-op）。
   */
  create(): void {
    if (this.win && !this.win.isDestroyed()) return

    const cfg = loadCoachConfig()
    // 重启后恢复用户选的置顶模式；非法值由 normalize 落回 follow
    this.pinMode = normalizeCoachPinMode(cfg.pinMode)
    const workArea = screen.getPrimaryDisplay().workArea
    const defaultX = workArea.x + workArea.width - PET_WINDOW_WIDTH - 24
    const defaultY = workArea.y + workArea.height - PET_WINDOW_HEIGHT - 24
    const rawPos = cfg.position ?? { x: defaultX, y: defaultY }
    // 若持久化位置在屏幕外（如之前拖拽 bug 导致 y=-1780），直接回退默认右下角
    const isOffscreen =
      rawPos.x < workArea.x ||
      rawPos.x > workArea.x + workArea.width - PET_WINDOW_WIDTH ||
      rawPos.y < workArea.y ||
      rawPos.y > workArea.y + workArea.height - PET_WINDOW_HEIGHT
    const pos = isOffscreen
      ? { x: defaultX, y: defaultY }
      : clampPosition(rawPos, workArea, PET_WINDOW_WIDTH, PET_WINDOW_HEIGHT)

    this.win = new BrowserWindow({
      width: PET_WINDOW_WIDTH,
      height: PET_WINDOW_HEIGHT,
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      transparent: true,
      frame: false,
      // 初值取 always 档的结论；其余模式在下面 applyPinDecision 里统一落地，
      // 不在构造选项和策略函数两处各写一份判定
      alwaysOnTop: this.pinMode === 'always',
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      show: false,
      webPreferences: {
        preload: this.options.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    this.applyPinDecision()
    registerCoachWebContents(this.win.webContents)

    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.win.webContents.on('will-navigate', (event, url) => {
      if (url !== this.win?.webContents.getURL()) {
        event.preventDefault()
      }
    })

    // 默认点击穿透；forward:true 让鼠标事件仍转发到下层窗口。
    // 走 setter 而非直接调，好让去重缓存从这里起就有正确的初值
    this.setIgnoreMouseEvents(true)

    // 应用透明度（窗口级，与渲染层 CSS 互补）
    this.win.setOpacity(clamp(cfg.opacity, 0.3, 1))

    if (this.options.devServerUrl) {
      void this.win.loadURL(`${this.options.devServerUrl}#/coach-pet`)
    } else {
      void this.win.loadURL(`${shellUrl('/index.html')}#/coach-pet`)
    }

    this.win.once('ready-to-show', () => {
      this.win?.show()
      // 推送初始状态给渲染层（避免渲染层在 IPC 就绪前错过状态）
      this.win?.webContents.send('coach:petStateChanged', this.currentState)
      // 推送初始配置
      this.win?.webContents.send('coach:configChanged', getCoachConfigForRenderer())
    })

    this.win.on('closed', () => {
      if (this.win) unregisterCoachWebContents(this.win.webContents)
      this.win = null
      this.dragging = false
      this.stopDragPoll()
      this.cancelPendingBlur()
      // 清理防抖计时器
      if (this.ignoreMouseEventsDebounceTimer !== null) {
        clearTimeout(this.ignoreMouseEventsDebounceTimer)
        this.ignoreMouseEventsDebounceTimer = null
      }
      // 缓存是"已经落到某个窗口上"的记录，窗口没了就必须作废，
      // 否则重新 create() 时 applyPinDecision 会误判无变化而跳过首次设定
      this.lastDecision = null
      this.lastParent = null
      this.lastIgnoreMouseEvents = null
    })

    // 兜底：窗口失焦（Alt+Tab 或点其他窗口）时强制结束拖拽
    this.win.on('blur', () => {
      if (this.dragging) {
        this.stopDrag()
      }
    })
  }

  /**
   * 销毁桌宠窗口。主窗口关闭时调用。
   */
  destroy(): void {
    this.setFollowedWindow(null)
    // setFollowedWindow(null) 已经撤了一次，但 destroy 也可能在没有壳的状态下被调用，
    // 定时器绝不能活过窗口
    this.cancelPendingBlur()
    if (this.win && !this.win.isDestroyed()) {
      this.win.close()
    }
    this.win = null
  }

  /**
   * 当前是否存活。
   */
  isAlive(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  getWin(): BrowserWindow | null {
    return this.win
  }

  followWindow(window: BrowserWindow | null): void {
    this.setFollowedWindow(window && !window.isDestroyed() ? window : null)
  }

  /**
   * 切换置顶模式。即时生效（就地重设窗口），持久化由调用方的
   * `saveCoachConfig` 负责——本方法不写盘，避免与 `coach:saveConfig` 重复落盘。
   */
  setPinMode(mode: CoachPinMode): void {
    const next = normalizeCoachPinMode(mode)
    if (next === this.pinMode) return
    this.pinMode = next
    this.applyPinDecision()
  }

  getPinMode(): CoachPinMode {
    return this.pinMode
  }

  /**
   * 切换桌宠状态，推送给渲染层。
   */
  setPetState(state: CoachPetState): void {
    this.currentState = state
    this.win?.webContents.send('coach:petStateChanged', state)
  }

  getPetState(): CoachPetState {
    return this.currentState
  }

  /**
   * 临时切换点击穿透。renderer hover 到交互区域时调用。
   * ignore=true 时鼠标事件穿透到下层窗口；ignore=false 时本窗口可接收事件。
   *
   * 去重：renderer 的 mouseenter/mouseleave 会成对连发（尤其在窗口 z 序变动导致
   * hover 状态被重算时），而重设命中测试会打断进行中的鼠标捕获——拖拽因此中断。
   * 值没变就不要碰这个 API。
   *
   * 防抖：在某些情况下（可能是 Electron 的 bug），setIgnoreMouseEvents 本身会
   * 触发窗口的鼠标事件重新计算，导致新的 mouseenter/mouseleave 循环。
   * 使用 16ms 防抖来打破这个循环。
   */
  setIgnoreMouseEvents(ignore: boolean): void {
    if (!this.win || this.win.isDestroyed()) return

    // 记录待应用的值
    this.pendingIgnoreMouseEvents = ignore

    // 如果已经有防抖计时器在运行，不做任何事（让计时器完成后应用最新值）
    if (this.ignoreMouseEventsDebounceTimer !== null) {
      return
    }

    // 立即应用（如果值确实变了）
    this.applyIgnoreMouseEvents(ignore)

    // 设置防抖计时器
    this.ignoreMouseEventsDebounceTimer = setTimeout(() => {
      this.ignoreMouseEventsDebounceTimer = null
      // 如果防抖期间有新值进来，且与当前值不同，应用它
      if (this.pendingIgnoreMouseEvents !== null && this.pendingIgnoreMouseEvents !== this.lastIgnoreMouseEvents) {
        this.applyIgnoreMouseEvents(this.pendingIgnoreMouseEvents)
      }
      this.pendingIgnoreMouseEvents = null
    }, 16) // 一帧的时间
  }

  /**
   * 实际应用穿透状态到窗口
   */
  private applyIgnoreMouseEvents(ignore: boolean): void {
    if (!this.win || this.win.isDestroyed()) return
    if (this.lastIgnoreMouseEvents === ignore) {
      return
    }
    this.win.setIgnoreMouseEvents(ignore, { forward: true })
    this.lastIgnoreMouseEvents = ignore
  }

  /**
   * 推送气泡到桌宠渲染层。
   */
  showBubble(payload: CoachBubblePayload): void {
    this.win?.webContents.send('coach:showBubble', payload)
  }

  /**
   * 关闭当前气泡。
   */
  dismissBubble(): void {
    this.win?.webContents.send('coach:dismissBubble')
  }

  /**
   * 推送配置变更到桌宠渲染层（如 scale/opacity 调整后）。
   */
  notifyConfigChanged(): void {
    this.win?.webContents.send('coach:configChanged', getCoachConfigForRenderer())
    // 同步窗口级透明度
    const cfg = loadCoachConfig()
    this.win?.setOpacity(clamp(cfg.opacity, 0.3, 1))
    // 置顶模式与透明度走同一条保存通道，这里一并即时生效
    this.setPinMode(normalizeCoachPinMode(cfg.pinMode))
  }

  /**
   * 重置位置到默认（屏幕右下角）。同时持久化。
   */
  resetPosition(): void {
    const workArea = screen.getPrimaryDisplay().workArea
    const x = Math.round(workArea.x + workArea.width - PET_WINDOW_WIDTH - 24)
    const y = Math.round(workArea.y + workArea.height - PET_WINDOW_HEIGHT - 24)
    this.win?.setPosition(x, y)
    // 用 getPosition 保存实际窗口位置，与拖拽逻辑同源
    if (this.win && !this.win.isDestroyed()) {
      const [px, py] = this.win.getPosition()
      saveCoachConfig({ position: { x: px, y: py } })
    }
  }

  // --- 拖拽支持（主进程增量轮询方案，彻底规避 renderer mouseup 丢失 + DPI 坐标系混合问题） ---

  /**
   * 开始拖拽。renderer mousedown 时调用一次。
   *
   * 增量移动方案：每次 pollDrag 计算鼠标 delta，用 win.getPosition() + delta + win.setPosition() 移动窗口。
   * 这样做的好处：
   * 1. 鼠标不动时 delta=0，窗口绝对不动（解决"长按下移/右移"）
   * 2. getPosition 和 setPosition 同源 API，坐标系一致，不混合 getCursorScreenPoint 和 getBounds 的坐标系
   * 3. 避免了 getBounds() 在 transparent 窗口上可能返回不准确位置的问题
   */
  startDrag(): void {
    if (!this.win || this.dragging) return
    this.dragging = true
    const cursor = screen.getCursorScreenPoint()
    this.lastCursorPos = { x: cursor.x, y: cursor.y }
    this.lastCursorMoveTime = Date.now()
    this.stopDragPoll()
    this.dragPollTimer = setInterval(() => this.pollDrag(), 16)
  }

  private pollDrag(): void {
    if (!this.win || !this.dragging) {
      this.stopDragPoll()
      return
    }
    const cursor = screen.getCursorScreenPoint()
    // 鼠标静止超过 500ms 判定为已松手（兜底 mouseup 丢失）
    if (cursor.x === this.lastCursorPos.x && cursor.y === this.lastCursorPos.y) {
      if (Date.now() - this.lastCursorMoveTime > 500) {
        this.stopDrag()
      }
      return
    }
    // 增量移动：用鼠标 delta 移动窗口，getPosition/setPosition 同源避免坐标系混合
    const dx = cursor.x - this.lastCursorPos.x
    const dy = cursor.y - this.lastCursorPos.y
    const [winX, winY] = this.win.getPosition()
    this.win.setPosition(winX + dx, winY + dy)
    this.lastCursorPos = { x: cursor.x, y: cursor.y }
    this.lastCursorMoveTime = Date.now()
  }

  private stopDragPoll(): void {
    if (this.dragPollTimer) {
      clearInterval(this.dragPollTimer)
      this.dragPollTimer = null
    }
  }

  /**
   * 结束拖拽。renderer mouseup 时调用；若 mouseup 丢失，由轮询静止超时兜底。
   */
  endDrag(): void {
    if (!this.dragging) return
    this.stopDrag()
  }

  private stopDrag(): void {
    this.dragging = false
    this.stopDragPoll()
    if (this.win && !this.win.isDestroyed()) {
      // 用 getPosition 与拖拽逻辑同源，避免 getBounds 在 transparent 窗口上的偏差
      const [x, y] = this.win.getPosition()
      saveCoachConfig({ position: { x, y } })
    }
  }

  private readonly handleFollowedWindowClose = (): void => {
    this.setFollowedWindow(null)
  }

  private readonly handleFollowedWindowFocus = (): void => {
    // 聚焦是安全方向（抬升桌宠），立即生效；同时撤销待复核的解绑——
    // 这一对就是把"我们自己扰动出来的失焦"吃掉的地方
    if (this.applyingPinDecision) return
    this.cancelPendingBlur()
    if (this.followedWindowFocused) return
    this.followedWindowFocused = true
    this.applyPinDecision()
  }

  private readonly handleFollowedWindowMinimize = (): void => {
    this.cancelPendingBlur()
    this.followedWindowFocused = false
    this.applyPinDecision()
    // Windows may hide an owned window during minimization; restore visibility
    // without changing the selected pin policy or stealing focus.
    if (this.win && !this.win.isDestroyed()) {
      this.win.showInactive()
    }
  }

  private readonly handleFollowedWindowRestore = (): void => {
    // 主窗口恢复时，如果是 follow 模式且有活跃窗口，直接重新绑定
    // 不等 focus 事件，因为 restore 和 focus 的顺序不确定
    if (this.pinMode === 'follow' && this.followedWindow && !this.followedWindow.isDestroyed()) {
      // 直接设置聚焦状态为 true，然后应用决策
      this.followedWindowFocused = true
      this.applyPinDecision()
    }
  }

  /**
   * 壳失焦不立即解绑，而是延后复核。
   *
   * 必须这样做的原因：`follow` 档的决策是 `activeShellFocused` 的纯函数，而落地
   * 决策要调 `setParentWindow()`——它在 Windows 上改的是 owner 关系，**本身会扰动
   * 焦点**。于是 "壳聚焦 → 绑 parent → 扰焦 → 壳失焦 → 解绑 parent → 扰焦 → 壳聚焦"
   * 首尾相接，桌宠在两个 z 序间持续振荡：表现为桌宠闪烁、壳的任务栏按钮反复闪、
   * 主窗口点不动（owner 反复重设会打断命中测试与鼠标捕获）。
   * 这不是"重复调用同一决策"，缓存挡不住——每次决策都在真的翻面。
   *
   * 判据是持续时间：我们自己扰动出的失焦在一两帧内就被随之而来的 focus 抵消；
   * 真的原生菜单/文件对话框会把焦点拿走至少几百毫秒。所以延后一个远大于一帧、
   * 又远小于人能察觉的窗口再复核 `isFocused()` 的事实，而不是相信这一次事件。
   */
  private readonly handleFollowedWindowBlur = (): void => {
    if (this.applyingPinDecision) return
    if (!this.followedWindowFocused) return
    this.cancelPendingBlur()
    this.pendingBlurTimer = setTimeout(() => {
      this.pendingBlurTimer = null
      const shell = this.followedWindow
      // 复核事实而非相信事件：期间焦点已经回来就什么都不做
      if (shell && !shell.isDestroyed() && shell.isFocused()) return
      this.followedWindowFocused = false
      this.applyPinDecision()
    }, BLUR_DETACH_VERIFY_MS)
  }

  private cancelPendingBlur(): void {
    if (this.pendingBlurTimer) {
      clearTimeout(this.pendingBlurTimer)
      this.pendingBlurTimer = null
    }
  }

  private setFollowedWindow(window: BrowserWindow | null): void {
    if (this.followedWindow === window) return
    // 换壳后旧壳的失焦复核已经没有意义，且它会读到新壳的焦点做出错误判定
    this.cancelPendingBlur()
    if (this.followedWindow) {
      this.followedWindow.off('close', this.handleFollowedWindowClose)
      this.followedWindow.off('focus', this.handleFollowedWindowFocus)
      this.followedWindow.off('blur', this.handleFollowedWindowBlur)
      this.followedWindow.off('minimize', this.handleFollowedWindowMinimize)
      this.followedWindow.off('restore', this.handleFollowedWindowRestore)
    }
    this.followedWindow = window
    if (window) {
      window.once('close', this.handleFollowedWindowClose)
      window.on('focus', this.handleFollowedWindowFocus)
      window.on('blur', this.handleFollowedWindowBlur)
      window.on('minimize', this.handleFollowedWindowMinimize)
      window.on('restore', this.handleFollowedWindowRestore)
      // 切壳时以壳的实际焦点为准：WindowManager 是在 focus 事件里更新"最近活跃"的，
      // 所以新壳通常已经聚焦，此时不能等下一次 focus 事件才认。
      this.followedWindowFocused = window.isFocused()
    } else {
      this.followedWindowFocused = false
    }
    this.applyPinDecision()
  }

  /**
   * 按当前模式与归属/焦点事实重设窗口。所有改置顶的路径都汇到这里，
   * 保证 create / 切壳 / 焦点变化 / 改模式四条入口用的是同一份判定。
   *
   * 结论无变化时不碰 Electron API：`setParentWindow` / `setAlwaysOnTop` 都有副作用
   * （前者扰焦、后者重排 z 序），无谓重设会被用户看见。这层只挡"结论相同"的重复
   * 调用；"结论反复翻面"的振荡由 handleFollowedWindowBlur 的延后复核挡。
   */
  private applyPinDecision(): void {
    if (!this.win || this.win.isDestroyed()) return
    const decision = this.resolveDecision()
    const parent = decision.attachToActiveShell
      && this.followedWindow
      && !this.followedWindow.isDestroyed()
      ? this.followedWindow
      : null

    const unchanged = this.lastDecision !== null
      && this.lastDecision.alwaysOnTop === decision.alwaysOnTop
      && this.lastDecision.level === decision.level
      && this.lastDecision.attachToActiveShell === decision.attachToActiveShell
      && this.lastParent === parent

    if (unchanged) return

    // 屏蔽期间的焦点事件，防止 setParentWindow 触发的焦点变化引发新决策
    this.applyingPinDecision = true
    this.win.setParentWindow(parent)
    this.win.setAlwaysOnTop(decision.alwaysOnTop, decision.level)
    this.lastDecision = decision
    this.lastParent = parent
    // 延后 50ms 恢复，确保 setParentWindow 触发的焦点事件在屏蔽期内
    setTimeout(() => {
      this.applyingPinDecision = false
    }, 50)
  }

  private resolveDecision(): PetPinDecision {
    return resolvePetPinDecision({
      mode: this.pinMode,
      hasActiveShell: !!this.followedWindow && !this.followedWindow.isDestroyed(),
      activeShellFocused: this.followedWindowFocused,
    })
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return max
  return Math.min(max, Math.max(min, value))
}

/**
 * 将窗口位置约束在屏幕工作区内，确保窗口完全可见。
 * 若持久化位置在屏幕外（如之前拖拽 bug 导致 y=-1780），回退到默认右下角。
 */
function clampPosition(
  pos: { x: number; y: number },
  workArea: Electron.Rectangle,
  width: number,
  height: number,
): { x: number; y: number } {
  // 窗口必须完全在 workArea 内
  const minX = workArea.x
  const maxX = workArea.x + workArea.width - width
  const minY = workArea.y
  const maxY = workArea.y + workArea.height - height
  // 若屏幕太小放不下，退回默认位置（由调用方计算）
  if (maxX < minX || maxY < minY) {
    return { x: workArea.x + workArea.width - width - 24, y: workArea.y + workArea.height - height - 24 }
  }
  return { x: Math.round(clamp(pos.x, minX, maxX)), y: Math.round(clamp(pos.y, minY, maxY)) }
}

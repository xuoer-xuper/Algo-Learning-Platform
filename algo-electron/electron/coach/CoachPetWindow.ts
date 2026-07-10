import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import type { CoachBubblePayload, CoachPetState } from './types'
import { loadCoachConfig, saveCoachConfig } from '../app/config'

/**
 * Coach 桌宠透明悬浮窗口。
 *
 * 设计要点：
 * - transparent + frame:false + alwaysOnTop + skipTaskbar + hasShadow:false + resizable:false
 * - 默认点击穿透（setIgnoreMouseEvents(true, { forward: true })），
 *   renderer hover 到交互区域时通过 IPC 临时关闭穿透，离开恢复
 * - 拖拽移动：renderer 监听 mousedown/mousemove/mouseup，通过 IPC 调用 startDrag/dragTo/endDrag，
 *   主进程用 setPosition 移动窗口（避免 renderer 内 setBounds 跨进程抖动）
 * - 与主窗口生命周期绑定：主窗口关闭时调用 destroy()
 * - 加载路由：dev `${devServerUrl}#/coach-pet`，prod `loadFile(index.html, { hash: 'coach-pet' })`
 *
 * 阶段 1 只做视觉壳；阶段 2 会扩展主进程侧规则引擎、事件桥、ContestGuard，
 * 它们会通过 setPetState / showBubble 等方法驱动本窗口。
 */
export interface CoachPetWindowOptions {
  /** preload 路径，与主窗口保持一致（preload.mjs） */
  preloadPath: string
  /** dev server URL，存在时走 loadURL，否则走 loadFile */
  devServerUrl?: string
  /** 渲染产物目录（dist），prod 时 loadFile 使用 */
  rendererDist: string
}

const PET_WINDOW_WIDTH = 320
const PET_WINDOW_HEIGHT = 360

export class CoachPetWindow {
  private win: BrowserWindow | null = null
  private readonly options: CoachPetWindowOptions
  private currentState: CoachPetState = 'idle'
  private dragging = false
  private dragOffset = { x: 0, y: 0 }
  private dragPollTimer: NodeJS.Timeout | null = null
  private lastCursorPos = { x: 0, y: 0 }
  private lastCursorMoveTime = 0

  constructor(options: CoachPetWindowOptions) {
    this.options = options
  }

  /**
   * 创建并显示桌宠窗口。重复调用安全（已存在则 no-op）。
   */
  create(): void {
    if (this.win && !this.win.isDestroyed()) return

    const cfg = loadCoachConfig()
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
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      show: false,
      webPreferences: {
        preload: this.options.preloadPath,
      },
    })

    // 默认点击穿透；forward:true 让鼠标事件仍转发到下层窗口
    this.win.setIgnoreMouseEvents(true, { forward: true })

    // 应用透明度（窗口级，与渲染层 CSS 互补）
    this.win.setOpacity(clamp(cfg.opacity, 0.3, 1))

    if (this.options.devServerUrl) {
      void this.win.loadURL(`${this.options.devServerUrl}#/coach-pet`)
    } else {
      void this.win.loadFile(path.join(this.options.rendererDist, 'index.html'), {
        hash: 'coach-pet',
      })
    }

    this.win.once('ready-to-show', () => {
      this.win?.show()
      // 推送初始状态给渲染层（避免渲染层在 IPC 就绪前错过状态）
      this.win?.webContents.send('coach:petStateChanged', this.currentState)
      // 推送初始配置
      this.win?.webContents.send('coach:configChanged', loadCoachConfig())
    })

    this.win.on('closed', () => {
      this.win = null
      this.dragging = false
      this.stopDragPoll()
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
   */
  setIgnoreMouseEvents(ignore: boolean): void {
    this.win?.setIgnoreMouseEvents(ignore, { forward: true })
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
    this.win?.webContents.send('coach:configChanged', loadCoachConfig())
    // 同步窗口级透明度
    const cfg = loadCoachConfig()
    this.win?.setOpacity(clamp(cfg.opacity, 0.3, 1))
  }

  /**
   * 重置位置到默认（屏幕右下角）。同时持久化。
   */
  resetPosition(): void {
    const workArea = screen.getPrimaryDisplay().workArea
    const x = Math.round(workArea.x + workArea.width - PET_WINDOW_WIDTH - 24)
    const y = Math.round(workArea.y + workArea.height - PET_WINDOW_HEIGHT - 24)
    this.win?.setBounds({ x, y, width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT })
    // 保存实际窗口位置，避免 DPI 缩放导致计算值与实际不符
    const actual = this.win?.getBounds()
    if (actual) {
      saveCoachConfig({ position: { x: actual.x, y: actual.y } })
    }
  }

  // --- 拖拽支持（主进程轮询方案，彻底规避 renderer mouseup 丢失） ---

  /**
   * 开始拖拽。renderer mousedown 时调用一次，传入屏幕坐标。
   * 主进程启动 16ms 间隔轮询，持续读取屏幕鼠标坐标移动窗口。
   * renderer 不再需要发送 mousemove/mouseup，彻底绕开事件丢失。
   */
  startDrag(screenX: number, screenY: number): void {
    if (!this.win || this.dragging) return
    this.dragging = true
    const bounds = this.win.getBounds()
    this.dragOffset = { x: screenX - bounds.x, y: screenY - bounds.y }
    this.lastCursorPos = { x: screenX, y: screenY }
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
    if (cursor.x !== this.lastCursorPos.x || cursor.y !== this.lastCursorPos.y) {
      this.lastCursorPos = { x: cursor.x, y: cursor.y }
      this.lastCursorMoveTime = Date.now()
    } else if (Date.now() - this.lastCursorMoveTime > 500) {
      this.stopDrag()
      return
    }
    const x = Math.round(cursor.x - this.dragOffset.x)
    const y = Math.round(cursor.y - this.dragOffset.y)
    this.win.setPosition(x, y)
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
      const bounds = this.win.getBounds()
      saveCoachConfig({ position: { x: bounds.x, y: bounds.y } })
    }
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

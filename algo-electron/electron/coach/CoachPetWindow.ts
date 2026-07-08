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
    const pos = cfg.position ?? { x: defaultX, y: defaultY }

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
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
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
    const x = workArea.x + workArea.width - PET_WINDOW_WIDTH - 24
    const y = workArea.y + workArea.height - PET_WINDOW_HEIGHT - 24
    this.win?.setPosition(Math.round(x), Math.round(y))
    saveCoachConfig({ position: { x, y } })
  }

  // --- 拖拽支持 ---

  /**
   * 开始拖拽。renderer mousedown 时调用，传入屏幕坐标。
   */
  startDrag(screenX: number, screenY: number): void {
    if (!this.win) return
    this.dragging = true
    const bounds = this.win.getBounds()
    this.dragOffset = { x: screenX - bounds.x, y: screenY - bounds.y }
  }

  /**
   * 拖拽中。renderer mousemove 时调用，setPosition 移动窗口。
   */
  dragTo(screenX: number, screenY: number): void {
    if (!this.win || !this.dragging) return
    const x = Math.round(screenX - this.dragOffset.x)
    const y = Math.round(screenY - this.dragOffset.y)
    this.win.setPosition(x, y)
  }

  /**
   * 结束拖拽。renderer mouseup 时调用，持久化最终位置。
   */
  endDrag(): void {
    if (!this.dragging) return
    this.dragging = false
    if (!this.win) return
    const bounds = this.win.getBounds()
    saveCoachConfig({ position: { x: bounds.x, y: bounds.y } })
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return max
  return Math.min(max, Math.max(min, value))
}

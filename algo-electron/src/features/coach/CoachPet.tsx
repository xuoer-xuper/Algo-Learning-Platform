import { useEffect, useRef, useState } from 'react'
import { CoachBubble } from './CoachBubble'
import { CoachChatPanel } from './CoachChatPanel'
import { PET_STATES, type PetState } from './petStates'
import './styles/pet.css'

/**
 * Coach 桌宠主组件。
 *
 * 在 #/coach-pet 路由下渲染。负责：
 * - SVG 几何体 + 粒子环 + 发光描边渲染
 * - 接收主进程状态推送（coach:petStateChanged）
 * - 接收主进程配置推送（coach:configChanged）
 * - hover 切换点击穿透（mouseenter → 关闭穿透，mouseleave → 恢复）
 * - 拖拽移动（mousedown → startDrag，mousemove → dragTo，mouseup → endDrag）
 * - 包含气泡与交互按钮（CoachBubble，条件渲染）
 *
 * 状态机：通过 data-pet-state 属性切换 CSS 变量，6 状态动画在 pet.css 定义。
 */
export function CoachPet() {
  const [state, setState] = useState<PetState>('idle')
  const [config, setConfig] = useState<CoachConfig | null>(null)
  const [bubble, setBubble] = useState<CoachBubblePayload | null>(null)
  const [chatPanelOpen, setChatPanelOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragStartedRef = useRef(false)

  useEffect(() => {
    // 拉取初始状态与配置
    void window.electronAPI.coachGetPetState().then(setState)
    void window.electronAPI.coachGetConfig().then(setConfig)

    // 订阅主进程推送
    const offState = window.electronAPI.onCoachPetStateChanged(setState)
    const offConfig = window.electronAPI.onCoachConfigChanged(setConfig)
    const offShowBubble = window.electronAPI.onCoachShowBubble((payload) => setBubble(payload))
    const offDismissBubble = window.electronAPI.onCoachDismissBubble(() => setBubble(null))

    return () => {
      offState()
      offConfig()
      offShowBubble()
      offDismissBubble()
    }
  }, [])

  const handleMouseEnter = () => {
    // 进入交互区域：临时关闭点击穿透
    void window.electronAPI.coachToggleIgnoreMouseEvents(false)
  }

  const handleMouseLeave = () => {
    // 离开交互区域：恢复穿透（拖拽中不恢复，由拖拽逻辑管理）
    if (!dragStartedRef.current) {
      void window.electronAPI.coachToggleIgnoreMouseEvents(true)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // 仅左键触发
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.screenX
    const startY = e.screenY
    dragStartedRef.current = true
    setDragging(true)
    // 拖拽期间关闭穿透
    void window.electronAPI.coachToggleIgnoreMouseEvents(false)
    // 主进程开始轮询移动窗口（坐标由主进程 getCursorScreenPoint 统一获取，避免 DPI 偏移）
    void window.electronAPI.coachStartDrag()

    const onUp = (ev: Event) => {
      dragStartedRef.current = false
      setDragging(false)
      void window.electronAPI.coachEndDrag()
      document.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onUp)
      // 区分 click 和 drag：移动 < 4px 视为点击
      const me = ev as MouseEvent
      const dx = Math.abs((me.screenX ?? 0) - startX)
      const dy = Math.abs((me.screenY ?? 0) - startY)
      if (dx < 4 && dy < 4) {
        // 点击桌宠 → 如果 LLM 启用则打开聊天面板
        void window.electronAPI.coachPetClick().then((result) => {
          if (result.shouldOpenChat) {
            setChatPanelOpen(true)
          }
        })
      }
      // 恢复穿透
      void window.electronAPI.coachToggleIgnoreMouseEvents(true)
    }
    document.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onUp)
  }

  const handleBubbleClose = () => {
    setBubble(null)
  }

  const stateConfig = PET_STATES[state]
  const scale = config?.scale ?? 1

  return (
    <div
      className="pet-root"
      data-pet-state={state}
      style={{ '--pet-scale': scale } as React.CSSProperties}
    >
      <div
        className={`pet-body${dragging ? ' dragging' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        role="img"
        aria-label={`Coach 桌宠 - ${stateConfig.description}`}
      >
        <div className="pet-aura" />
        <svg className="pet-svg" viewBox="-100 -100 200 200" aria-hidden="true">
          <g className="pet-svg-glow">
            {/* 外圈虚线圆（描边光晕辅助） */}
            <circle
              cx="0"
              cy="0"
              r="65"
              fill="none"
              stroke="var(--pet-primary)"
              strokeWidth="0.5"
              strokeOpacity="0.35"
              strokeDasharray="2 4"
            />

            {/* 粒子环：12 个等分粒子，逆时针旋转 */}
            <g className="pet-particle-ring">
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i / 12) * Math.PI * 2
                const radius = 52
                const cx = radius * Math.cos(angle)
                const cy = radius * Math.sin(angle)
                const r = i % 3 === 0 ? 2.5 : 1.5
                return (
                  <circle
                    key={i}
                    className="pet-particle"
                    cx={cx.toFixed(2)}
                    cy={cy.toFixed(2)}
                    r={r}
                  />
                )
              })}
            </g>

            {/* 外六边形描边 */}
            <polygon
              className="pet-inner-hex"
              points="0,-55 47.63,-27.5 47.63,27.5 0,55 -47.63,27.5 -47.63,-27.5"
            />

            {/* 主体菱形（核心几何体） */}
            <polygon
              className="pet-core-polygon"
              points="0,-40 40,0 0,40 -40,0"
            />

            {/* 内部小六边形 */}
            <polygon
              className="pet-inner-hex"
              points="0,-22 19.05,-11 19.05,11 0,22 -19.05,11 -19.05,-11"
            />

            {/* 中心光点（眼） */}
            <circle className="pet-eye" cx="0" cy="0" r="3.5" />
          </g>
        </svg>
      </div>

      {chatPanelOpen && (
        <CoachChatPanel onClose={() => setChatPanelOpen(false)} />
      )}
      {!chatPanelOpen && bubble && (
        <CoachBubble
          payload={bubble}
          onClose={handleBubbleClose}
        />
      )}
    </div>
  )
}

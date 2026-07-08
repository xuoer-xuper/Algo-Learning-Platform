import { useEffect, useRef, useState } from 'react'
import { CoachActions } from './CoachActions'

/**
 * Coach 气泡组件。
 *
 * 显示标题、消息、来源标记（本地/LLM）、可选等级（Socratic Ladder）。
 * - 自动消失：默认 12 秒后自动关闭（可通过 autoDismissMs 配置，0 表示不自动消失）
 * - 手动关闭：右上角 ✕ 按钮
 * - 3 个默认按钮：给一点提示 / 先不用 / 今天别提醒
 * - 点击按钮后向主进程发对应 IPC
 *
 * 气泡渲染在桌宠本体上方，hover 时也会触发 toggleIgnoreMouseEvents(false)，
 * 由父组件 CoachPet 的 mouseenter/mouseleave 统一管理（气泡在 pet-root 内，
 * pet-body 的 mouseenter 不会冒泡到气泡，所以气泡独立监听）。
 */
export interface CoachBubbleProps {
  payload: CoachBubblePayload
  /** 自动消失毫秒数，默认 12000，传 0 表示不自动消失 */
  autoDismissMs?: number
  onClose: () => void
}

const SOURCE_LABEL: Record<CoachHintSource, string> = {
  local: '本地',
  llm: 'LLM',
}

export function CoachBubble({ payload, autoDismissMs = 12000, onClose }: CoachBubbleProps) {
  const [closing, setClosing] = useState(false)
  const dismissTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (autoDismissMs <= 0) return
    dismissTimerRef.current = window.setTimeout(() => {
      handleClose('auto')
    }, autoDismissMs)
    return () => {
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.id, autoDismissMs])

  const handleClose = (reason: 'auto' | 'manual' | 'dismiss' | 'never_today') => {
    if (closing) return
    setClosing(true)
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current)
    // 给一个短暂退出动画（CSS 通过 closing 类触发，这里简化为直接关闭）
    onClose()
    // reason 仅用于调试，阶段 2 可改为埋点
    if (reason !== 'auto' && reason !== 'manual') {
      // dismiss / never_today 已在按钮 handler 中发送 IPC，这里不重复
    }
  }

  const handleTriggerHint = () => {
    void window.electronAPI.coachTriggerHint(payload.id)
    // 不立即关闭气泡：阶段 2 规则引擎会推送新等级气泡替换
    // 阶段 1 简化为关闭当前气泡（视觉演示）
    handleClose('dismiss')
  }

  const handleDismiss = () => {
    void window.electronAPI.coachDismissHint(payload.id)
    handleClose('dismiss')
  }

  const handleNeverToday = () => {
    void window.electronAPI.coachFeedback({ bubbleId: payload.id, type: 'never_today' })
    handleClose('never_today')
  }

  const handleManualClose = () => {
    handleClose('manual')
  }

  // 气泡区域也需要关闭点击穿透（与 pet-body 一致）
  const handleMouseEnter = () => {
    void window.electronAPI.coachToggleIgnoreMouseEvents(false)
  }
  const handleMouseLeave = () => {
    void window.electronAPI.coachToggleIgnoreMouseEvents(true)
  }

  return (
    <div
      className="coach-bubble"
      role="alert"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="coach-bubble-header">
        <span className="coach-bubble-title">{payload.title}</span>
        <span
          className="coach-bubble-source"
          data-source={payload.source}
          title={`来源：${SOURCE_LABEL[payload.source]}`}
        >
          {SOURCE_LABEL[payload.source]}
        </span>
        <button
          type="button"
          className="coach-bubble-close"
          onClick={handleManualClose}
          aria-label="关闭气泡"
        >
          ✕
        </button>
      </div>

      {typeof payload.level === 'number' && payload.level > 0 && (
        <span className="coach-bubble-level">L{payload.level}</span>
      )}

      <div className="coach-bubble-message">{payload.message}</div>

      <CoachActions
        bubbleId={payload.id}
        onTriggerHint={handleTriggerHint}
        onDismiss={handleDismiss}
        onNeverToday={handleNeverToday}
      />

      {autoDismissMs > 0 && (
        <div className="coach-bubble-progress" />
      )}
    </div>
  )
}

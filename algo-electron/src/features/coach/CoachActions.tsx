/**
 * Coach 气泡交互按钮。
 *
 * 3 个默认按钮（spec 阶段 1 要求）：
 * - 给一点提示 → coach:triggerHint（阶段 2 接 HintLadder 升级）
 * - 先不用 → coach:dismissHint（关闭气泡 + 切回 idle）
 * - 今天别提醒 → coach:feedback(never_today)（阶段 2 持久化屏蔽当天同类提示）
 *
 * 按钮样式与桌宠科技感一致：青蓝/紫冷色，描边发光，非萌系。
 */
import './styles/bubble.css'

export interface CoachActionsProps {
  /** 关联的气泡 id，用于反馈归因 */
  bubbleId?: string
  /** "给一点提示"点击 */
  onTriggerHint: () => void
  /** "先不用"点击 */
  onDismiss: () => void
  /** "今天别提醒"点击 */
  onNeverToday: () => void
}

export function CoachActions({ bubbleId, onTriggerHint, onDismiss, onNeverToday }: CoachActionsProps) {
  return (
    <div className="coach-actions" data-bubble-id={bubbleId ?? ''}>
      <button
        type="button"
        className="coach-action-btn coach-action-primary"
        onClick={onTriggerHint}
      >
        给一点提示
      </button>
      <button
        type="button"
        className="coach-action-btn coach-action-secondary"
        onClick={onDismiss}
      >
        先不用
      </button>
      <button
        type="button"
        className="coach-action-btn coach-action-tertiary"
        onClick={onNeverToday}
      >
        今天别提醒
      </button>
    </div>
  )
}

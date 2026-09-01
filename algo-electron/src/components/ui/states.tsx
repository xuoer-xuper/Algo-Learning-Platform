import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

/*
 * 异步区块的三态词汇（B5.2）。
 *
 * 起因是三个界面对同一处境给了三种答案，其中两种在说谎：
 *   - 首页：`stats === null` 时什么都不渲染 —— 唯一正确的，但会突然弹出
 *   - 题库侧栏：加载中显示"暂无记录"，把"还没读到"说成"你没有记录"
 *   - Dashboard：加载中显示 `stats?.totalProblems ?? 0`，把"还没读到"说成"0 道题"
 *
 * 所以这里的边界不是"抽个组件复用样式"，而是**让"还没读到"没法再被写成"空"**：
 * 数据状态用 `T[] | null` 表达（`null` = 未读到，`[]` = 读到了且为空），两个分支
 * 各有各的组件，想混淆得先把类型改掉。
 */

export interface EmptyProps {
  children: ReactNode
  /** 次要说明，比正文更淡一档 */
  hint?: ReactNode
  /**
   * 紧凑档：列表内、卡片分区内的空态。
   * 默认档是整块面板级空态（32px 内边距 / 13px），紧凑档是 16px/12px。
   */
  compact?: boolean
  /** 面板级空态可带一个图标；紧凑档不给图标（列表里放图标会压过真实内容） */
  icon?: IconName
  className?: string
}

/** 「读到了，确实没有」。不要用它表示「还没读到」——那是 Skeleton。 */
export function Empty({ children, hint, compact = false, icon, className }: EmptyProps) {
  return (
    <div
      className={['ui-empty', compact && 'ui-empty-compact', className].filter(Boolean).join(' ')}
      data-testid="empty-state"
    >
      {icon && !compact && <Icon name={icon} size={26} className="ui-empty-icon" />}
      <span className="ui-empty-message">{children}</span>
      {hint && <span className="ui-empty-hint">{hint}</span>}
    </div>
  )
}

export interface SkeletonProps {
  /** 骨架行数，默认 1。列表用行数近似真实条目数，避免加载完成时高度突变 */
  rows?: number
  /**
   * 行内档：占位一个数值/短文本，不改变所在行的高度。
   * 用在大数字卡片这类"文字换成骨架"的位置；块级档用于列表。
   */
  inline?: boolean
  className?: string
  /** 无障碍名称，读屏播报用；默认「加载中」 */
  label?: string
}

/*
 * 「还没读到」。
 *
 * 三个刻意的选择：
 * 1. `aria-busy` + `role="status"` + 一个视觉隐藏的文本：读屏用户得到的是"加载中"
 *    这一句，而不是若干个无意义的空盒子。
 * 2. 脉冲动画不做 `prefers-reduced-motion` 判断 —— index.css 有全局降级
 *    （animation-duration 0.01ms + iteration-count 1），到那边会自动变成静态条。
 * 3. 行数由调用方给：骨架的作用是占住真实内容的高度，行数猜错就会在加载完成时
 *    产生跳动，那正是骨架本该消除的东西。
 */
export function Skeleton({ rows = 1, inline = false, className, label = '加载中' }: SkeletonProps) {
  return (
    <div
      className={['ui-skeleton', inline && 'ui-skeleton-inline', className].filter(Boolean).join(' ')}
      role="status"
      aria-busy="true"
      data-testid="skeleton"
    >
      <span className="ui-visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="ui-skeleton-bar" aria-hidden="true" />
      ))}
    </div>
  )
}

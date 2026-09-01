import type { KeyboardEvent, ReactNode } from 'react'

export interface ListRowProps {
  /** 主操作。鼠标点击、Enter、Space 三条路径都走它 */
  onActivate: () => void
  children: ReactNode
  className?: string
  /** 读屏名称。行内文本已足够描述时可省略 */
  label?: string
  title?: string
}

/*
 * 可激活的列表行（B5.2）。
 *
 * 存在的理由是一个真实缺陷：题库侧栏和 Dashboard 列表的行都是 `<div onClick>`,
 * 键盘完全到不了 —— Tab 跳过整个列表，回车没有目标。B1 那轮无障碍收口漏了这两处。
 *
 * 为什么不是 `<button>`：`countBareControls` 守卫禁止裸原生控件，而 `ui/Button`
 * 的底座 `.ui-btn` 是"单行居中内联标签"（justify-content: center + nowrap +
 * 固定高度），套到多列带省略号的列表行上要再写四条声明去撤销它 —— HomePage 磁贴
 * 和设置页导航都记录过同一个结论。所以这里用 `role="button"` + `tabIndex` 自己
 * 补齐键盘语义，并把它收进 ui/ 一次写对，而不是让每个 feature 各写一遍再各漏一遍。
 *
 * 为什么它只包"主区域"而不是整行：侧栏行右侧还有两个 IconButton。把整行做成
 * role="button" 会让可交互元素嵌套在按钮里（ARIA 无效，读屏播报会打结）。所以
 * 调用方把它当作行内的一个 flex 子项用，图标按钮作为兄弟节点留在外面。
 */
export function ListRow({ onActivate, children, className, label, title }: ListRowProps) {
  // Space 必须在 keydown 阶段 preventDefault，否则会先滚动一屏再触发。
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onActivate()
  }

  return (
    <div
      className={['ui-list-row', className].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={title}
      onClick={onActivate}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  )
}

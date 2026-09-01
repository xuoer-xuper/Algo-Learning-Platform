// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Empty, ListRow, Skeleton } from '../../src/components/ui'

afterEach(cleanup)

/*
 * B5.2 的三个原语。
 *
 * 这里断言的是行为与无障碍语义，不是 class 字符串 —— 只有当 class 是别处的契约
 * （紧凑档、行内档由 CSS 提供，TSX 无从验证其效果）时才顺带断言一下类名在场。
 */

describe('Empty', () => {
  it('渲染正文与可选的次要说明', () => {
    render(<Empty hint="调整筛选条件">没有符合条件的题目</Empty>)
    expect(screen.getByText('没有符合条件的题目')).toBeTruthy()
    expect(screen.getByText('调整筛选条件')).toBeTruthy()
  })

  it('不传 hint 时不渲染空的说明节点', () => {
    const { container } = render(<Empty>暂无记录</Empty>)
    expect(container.querySelectorAll('.ui-empty-hint')).toHaveLength(0)
  })

  it('紧凑档加类名，默认档不加', () => {
    const { container: compact } = render(<Empty compact>a</Empty>)
    expect(compact.querySelector('.ui-empty-compact')).toBeTruthy()
    const { container: normal } = render(<Empty>b</Empty>)
    expect(normal.querySelector('.ui-empty-compact')).toBeNull()
  })

  it('不声明 aria-busy：空态是终态，不是加载态', () => {
    // 这条防的是把 Empty 当 Skeleton 用：读屏会一直播报"忙"。
    const { container } = render(<Empty>暂无记录</Empty>)
    expect(container.querySelector('[aria-busy]')).toBeNull()
  })
})

describe('Skeleton', () => {
  it('给读屏一个名字，而不是一堆空盒子', () => {
    render(<Skeleton rows={3} label="题库加载中" />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('题库加载中')).toBeTruthy()
  })

  it('骨架条按 rows 渲染，且对读屏隐藏', () => {
    const { container } = render(<Skeleton rows={4} />)
    const bars = container.querySelectorAll('.ui-skeleton-bar')
    expect(bars).toHaveLength(4)
    for (const bar of bars) {
      expect(bar.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('默认一行', () => {
    const { container } = render(<Skeleton />)
    expect(container.querySelectorAll('.ui-skeleton-bar')).toHaveLength(1)
  })

  it('行内档加类名：它承诺不改变所在行的高度', () => {
    const { container } = render(<Skeleton inline />)
    expect(container.querySelector('.ui-skeleton-inline')).toBeTruthy()
  })
})

describe('ListRow', () => {
  it('鼠标点击触发主操作', () => {
    const onActivate = vi.fn()
    render(<ListRow onActivate={onActivate}>行</ListRow>)
    fireEvent.click(screen.getByRole('button'))
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('键盘可达：Enter 与 Space 都触发', () => {
    // 这正是改造前缺的东西：裸 <div onClick> 连焦点都拿不到。
    const onActivate = vi.fn()
    render(<ListRow onActivate={onActivate}>行</ListRow>)
    const row = screen.getByRole('button')
    expect(row.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onActivate).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(row, { key: ' ' })
    expect(onActivate).toHaveBeenCalledTimes(2)
  })

  it('Space 阻止默认行为，否则会先滚一屏', () => {
    const onActivate = vi.fn()
    render(<ListRow onActivate={onActivate}>行</ListRow>)
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    fireEvent(screen.getByRole('button'), event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('其他按键不触发', () => {
    const onActivate = vi.fn()
    render(<ListRow onActivate={onActivate}>行</ListRow>)
    for (const key of ['Tab', 'Escape', 'a', 'ArrowDown']) {
      fireEvent.keyDown(screen.getByRole('button'), { key })
    }
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('不把可交互元素套进 role="button"：图标按钮是兄弟节点', () => {
    /*
     * 这条钉的是 ListRow 的设计边界。侧栏行右侧有两个 IconButton，如果把整行
     * 做成 role="button" 再把它们塞进去，ARIA 就非法了（按钮里嵌按钮）。
     * 正确用法是 ListRow 只包主区域，图标按钮留在它外面。
     */
    render(
      <div>
        <ListRow onActivate={() => {}}>主区域</ListRow>
        <button type="button">笔记</button>
      </div>,
    )
    const row = screen.getByRole('button', { name: '主区域' })
    expect(row.querySelector('button')).toBeNull()
  })

  it('可以给读屏单独的名字', () => {
    render(<ListRow onActivate={() => {}} label="打开 两数之和">行内容</ListRow>)
    expect(screen.getByRole('button', { name: '打开 两数之和' })).toBeTruthy()
  })
})

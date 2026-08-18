// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Dialog, DropdownMenu, NoticeBar, Toast } from '../../src/components/ui'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Dialog', () => {
  it('traps focus, closes on Escape, and restores the opener focus', async () => {
    const opener = document.createElement('button')
    opener.textContent = '打开'
    document.body.appendChild(opener)
    opener.focus()
    const onClose = vi.fn()

    render(
      <Dialog
        open
        title="设置"
        description="调整偏好"
        onClose={onClose}
        footer={<button type="button">保存</button>}
      >
        <input aria-label="名称" />
      </Dialog>,
    )

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' })))
    screen.getByRole('button', { name: '保存' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    cleanup()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('supports overlay dismissal without bubbling panel clicks', () => {
    const onClose = vi.fn()
    render(<Dialog open title="确认" onClose={onClose}>内容</Dialog>)
    fireEvent.mouseDown(screen.getByTestId('dialog-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.mouseDown(screen.getByTestId('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('DropdownMenu', () => {
  it('opens with the trigger, skips disabled items, and closes on Escape', async () => {
    const onSelect = vi.fn()
    render(
      <DropdownMenu
        label="更多操作"
        items={[
          { id: 'disabled', label: '不可用', disabled: true, onSelect },
          { id: 'run', label: '运行', onSelect },
        ]}
      />,
    )

    const trigger = screen.getByRole('button', { name: '更多操作' })
    fireEvent.click(trigger)
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '运行' })))
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('invokes an enabled item and closes after selection', async () => {
    const onSelect = vi.fn()
    render(
      <DropdownMenu
        label="操作"
        triggerText="操作"
        items={[{ id: 'save', label: '保存', onSelect }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '操作' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '保存' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('Toast and NoticeBar', () => {
  it('announces a toast and auto-dismisses it', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Toast open message="已保存" tone="success" duration={1000} onClose={onClose} />)
    expect(screen.getByRole('status').textContent).toContain('已保存')
    vi.advanceTimersByTime(1000)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps NoticeBar in normal document flow with actions and dismiss', () => {
    const onAction = vi.fn()
    const onDismiss = vi.fn()
    const { container } = render(
      <div data-testid="host">
        <NoticeBar tone="warning" title="提示" action={{ label: '重试', onClick: onAction }} onDismiss={onDismiss}>
          网络连接暂时不可用
        </NoticeBar>
      </div>,
    )
    const host = screen.getByTestId('host')
    const notice = screen.getByRole('alert')
    expect(host.contains(notice)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.ui-notice-bar')?.className).toContain('ui-notice-bar-warning')
  })
})

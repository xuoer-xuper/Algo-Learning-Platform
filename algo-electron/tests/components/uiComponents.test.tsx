// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Button, Card, ConfirmDialog, Icon, IconButton, Input, Select, Textarea } from '../../src/components/ui'

afterEach(cleanup)

describe('Icon', () => {
  it('按名称渲染 svg 并带 data-icon 标记', () => {
    const { container } = render(<Icon name="home" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('data-icon')).toBe('home')
    expect(svg?.getAttribute('width')).toBe('16')
  })

  it('尺寸与描边可配置', () => {
    const { container } = render(<Icon name="close" size={20} strokeWidth={2} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('height')).toBe('20')
    expect(svg?.getAttribute('stroke-width')).toBe('2')
  })
})

describe('Button', () => {
  it('默认 secondary/md 变体且 type=button', () => {
    render(<Button>保存</Button>)
    const btn = screen.getByRole('button', { name: '保存' })
    expect(btn.className).toContain('ui-btn-secondary')
    expect(btn.className).toContain('ui-btn-md')
    expect(btn.getAttribute('type')).toBe('button')
  })

  it('渲染 primary/danger 变体、尺寸与图标', () => {
    const { container } = render(
      <Button variant="danger" size="sm" icon="trash">
        删除
      </Button>,
    )
    const btn = screen.getByRole('button', { name: '删除' })
    expect(btn.className).toContain('ui-btn-danger')
    expect(btn.className).toContain('ui-btn-sm')
    expect(container.querySelector('svg[data-icon="trash"]')).toBeTruthy()
  })

  it('点击回调与 disabled', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        提交
      </Button>,
    )
    const btn = screen.getByRole('button', { name: '提交' })
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
    expect(btn).toHaveProperty('disabled', true)
  })
})

describe('IconButton', () => {
  it('title 同步 aria-label 并渲染图标', () => {
    const onClick = vi.fn()
    const { container } = render(<IconButton icon="settings" title="设置" onClick={onClick} />)
    const btn = screen.getByRole('button', { name: '设置' })
    expect(btn.getAttribute('title')).toBe('设置')
    expect(container.querySelector('svg[data-icon="settings"]')).toBeTruthy()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('Input / Select / Textarea / Card', () => {
  it('Input 变更回调与类名合并', () => {
    const onChange = vi.fn()
    render(<Input placeholder="域名" className="extra" onChange={onChange} />)
    const input = screen.getByPlaceholderText('域名')
    expect(input.className).toContain('ui-input')
    expect(input.className).toContain('extra')
    fireEvent.change(input, { target: { value: 'codeforces.com' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('Select 渲染选项并可切换', () => {
    const onChange = vi.fn()
    render(
      <Select aria-label="平台" onChange={onChange} defaultValue="cf">
        <option value="cf">Codeforces</option>
        <option value="lg">洛谷</option>
      </Select>,
    )
    const select = screen.getByLabelText('平台') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'lg' } })
    expect(onChange).toHaveBeenCalled()
    expect(select.value).toBe('lg')
  })

  it('Textarea 使用等宽样式类', () => {
    render(<Textarea placeholder="脚本" />)
    expect(screen.getByPlaceholderText('脚本').className).toContain('ui-textarea')
  })

  it('Card 默认带内边距，可关闭', () => {
    const { rerender } = render(<Card data-testid="card">内容</Card>)
    expect(screen.getByTestId('card').className).toContain('ui-card-pad')
    rerender(
      <Card data-testid="card" padded={false}>
        内容
      </Card>,
    )
    expect(screen.getByTestId('card').className).not.toContain('ui-card-pad')
  })
})

describe('ConfirmDialog', () => {
  it('open=false 不渲染', () => {
    render(
      <ConfirmDialog open={false} title="删除脚本？" onConfirm={() => {}} onCancel={() => {}} />,
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('渲染标题/描述/附加内容并触发确认', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        title="删除题目？"
        description="该操作不可撤销。"
        danger
        confirmText="删除"
        onConfirm={onConfirm}
        onCancel={() => {}}
      >
        <label>
          <input type="checkbox" /> 同时删除笔记
        </label>
      </ConfirmDialog>,
    )
    expect(screen.getByRole('alertdialog', { name: '删除题目？' })).toBeTruthy()
    expect(screen.getByText('该操作不可撤销。')).toBeTruthy()
    expect(screen.getByText('同时删除笔记')).toBeTruthy()
    fireEvent.click(screen.getByTestId('confirm-ok'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('取消键、遮罩点击与 Esc 都走 onCancel，面板点击不冒泡', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="确认？" onConfirm={() => {}} onCancel={onCancel} />)
    fireEvent.click(screen.getByTestId('confirm-cancel'))
    fireEvent.click(screen.getByTestId('confirm-overlay'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(3)
    onCancel.mockClear()
    fireEvent.click(screen.getByRole('alertdialog'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})

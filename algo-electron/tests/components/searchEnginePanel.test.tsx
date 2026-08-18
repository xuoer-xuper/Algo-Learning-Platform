// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SearchEnginePanel } from '../../src/features/settings/SearchEnginePanel'

const getSearchEngine = vi.fn<() => Promise<SearchEngineConfig>>()
const setSearchEngine = vi.fn<(search: SearchEngineConfig) => Promise<SearchEngineConfig>>()

beforeEach(() => {
  getSearchEngine.mockReset()
  setSearchEngine.mockReset()
  getSearchEngine.mockResolvedValue({ engine: 'bing', customTemplate: null })
  setSearchEngine.mockImplementation(async (search) => search)
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { getSearchEngine, setSearchEngine },
  })
})

afterEach(cleanup)

describe('SearchEnginePanel', () => {
  it('读取当前配置并展示四种搜索引擎', async () => {
    getSearchEngine.mockResolvedValue({ engine: 'google', customTemplate: null })
    render(<SearchEnginePanel />)

    const select = await screen.findByLabelText('搜索引擎') as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('google'))
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Bing',
      'Google',
      'Baidu',
      '自定义',
    ])
  })

  it('自定义模板错误在文档流内展示并阻止保存', async () => {
    render(<SearchEnginePanel />)
    const select = await screen.findByLabelText('搜索引擎')
    await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false))

    fireEvent.change(select, { target: { value: 'custom' } })
    const input = screen.getByLabelText('URL 模板')
    fireEvent.change(input, { target: { value: 'http://example.com/?q={query}' } })

    expect(screen.getByRole('alert').textContent).toContain('必须使用 HTTPS')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect((screen.getByRole('button', { name: '保存搜索设置' }) as HTMLButtonElement).disabled).toBe(true)
    expect(setSearchEngine).not.toHaveBeenCalled()
  })

  it('保存自定义模板并用主进程返回配置回填', async () => {
    setSearchEngine.mockResolvedValue({ engine: 'baidu', customTemplate: null })
    render(<SearchEnginePanel />)
    const select = await screen.findByLabelText('搜索引擎') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))

    fireEvent.change(select, { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('URL 模板'), {
      target: { value: 'https://search.example/?q={query}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存搜索设置' }))

    await waitFor(() => {
      expect(setSearchEngine).toHaveBeenCalledWith({
        engine: 'custom',
        customTemplate: 'https://search.example/?q={query}',
      })
      expect(select.value).toBe('baidu')
    })
    expect(screen.queryByLabelText('URL 模板')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('未通过主进程校验')
  })

  it('成功保存自定义模板并展示保存反馈', async () => {
    render(<SearchEnginePanel />)
    const select = await screen.findByLabelText('搜索引擎') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))

    fireEvent.change(select, { target: { value: 'custom' } })
    const input = screen.getByLabelText('URL 模板') as HTMLInputElement
    fireEvent.change(input, {
      target: { value: 'https://search.example/?q={query}' },
    })
    expect(input.getAttribute('aria-describedby')).toBe('custom-search-template-help')
    fireEvent.click(screen.getByRole('button', { name: '保存搜索设置' }))

    await waitFor(() => {
      expect(setSearchEngine).toHaveBeenCalledWith({
        engine: 'custom',
        customTemplate: 'https://search.example/?q={query}',
      })
      expect(screen.getByText('已保存')).not.toBeNull()
    })
  })

  it('保存失败时展示行内错误', async () => {
    setSearchEngine.mockRejectedValue(new Error('磁盘不可写'))
    render(<SearchEnginePanel />)
    const select = await screen.findByLabelText('搜索引擎')
    await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false))

    fireEvent.change(select, { target: { value: 'google' } })
    fireEvent.click(screen.getByRole('button', { name: '保存搜索设置' }))

    expect((await screen.findByRole('alert')).textContent).toContain('保存失败：磁盘不可写')
  })
})

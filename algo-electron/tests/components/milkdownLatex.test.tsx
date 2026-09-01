// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import katex from 'katex'
import { CrepeFeature } from '@milkdown/crepe'

/**
 * B5.6（决策 D14）：Crepe Latex 特性确实开着。
 *
 * 断言口径刻意不碰源码字符串（Q10 刚把三份源码字符串测试改成行为测试，别倒退）：
 * 这里替掉 `@milkdown/crepe` 的 `Crepe` 类，把组件**运行时真正传出去**的
 * features / featureConfigs 截下来断言。改回 `Latex: false` 或删掉 featureConfig
 * 这两种倒退都会让本文件红。
 *
 * 另有一条断言读的是真库不是本仓源码：KaTeX 真的能渲染。D14 的全部理由是
 * "那 1MB 字体要产生价值"，字体的消费者是 KaTeX 运行时，它得真在依赖里且能出 DOM。
 *
 * 顺带记一件排查结论：`defaultFeatures` 只在 crepe 的 .d.ts 里声明，
 * 运行时没从包入口导出（`import { defaultFeatures }` 拿到 undefined，但 tsc 不报）。
 * 所以"CodeMirror 默认开着"这个 latex 的硬前提无法从外部读到——
 * MilkdownEditor 因此改成显式写 `CodeMirror: true`，前提变成本仓可断言的东西。
 */

interface CapturedCrepeOptions {
  features?: Partial<Record<CrepeFeature, boolean>>
  featureConfigs?: Partial<Record<CrepeFeature, unknown>>
}

const captured: CapturedCrepeOptions[] = []

vi.mock('@milkdown/crepe', async () => {
  // 只替 Crepe 类，CrepeFeature 枚举与 defaultFeatures 用真值
  const actual = await vi.importActual<typeof import('@milkdown/crepe')>('@milkdown/crepe')
  return {
    ...actual,
    // 显式转出枚举：命名空间对象上的绑定不都能被展开带过来，
    // 漏了会以 "No export is defined on the mock" 报在用到它的那条用例上
    CrepeFeature: actual.CrepeFeature,
    Crepe: class {
      constructor(options: CapturedCrepeOptions) {
        captured.push(options)
      }
      on(): void { /* 本测试不关心 markdown 回调，那条链路由别处覆盖 */ }
      create(): Promise<void> { return Promise.resolve() }
      destroy(): Promise<void> { return Promise.resolve() }
    },
  }
})

vi.mock('../../src/features/problems/problemsApi', () => ({
  saveNoteImage: vi.fn(async () => 'assets/mock.png'),
}))

async function renderEditor(): Promise<CapturedCrepeOptions> {
  captured.length = 0
  const { MilkdownEditor } = await import('../../src/features/problems/MilkdownEditor')
  render(
    <MilkdownEditor noteId="note-1" initialValue="" onChange={() => {}} />,
  )
  expect(captured).toHaveLength(1)
  return captured[0]
}

afterEach(() => {
  cleanup()
})

describe('MilkdownEditor 的 Latex 特性', () => {
  it('把 Latex 特性作为开启项传给 Crepe', async () => {
    const options = await renderEditor()
    expect(options.features?.[CrepeFeature.Latex]).toBe(true)
  })

  it('给 Latex 配了中文确认文案与不抛异常的 KaTeX 选项', async () => {
    const options = await renderEditor()
    const latexConfig = options.featureConfigs?.[CrepeFeature.Latex] as {
      inlineEditConfirm?: string
      katexOptions?: { throwOnError?: boolean }
    } | undefined

    expect(latexConfig?.inlineEditConfirm).toBe('确认')
    // 写坏的公式必须渲染成提示而不是抛异常：题解是边写边存的，
    // 半个公式的中间态要能留在文档里
    expect(latexConfig?.katexOptions?.throwOnError).toBe(false)
  })

  it('显式开着 latex 硬依赖的 CodeMirror', async () => {
    const options = await renderEditor()
    // 关掉或漏掉都会让 crepe 在 loadFeature 阶段直接抛
    expect(options.features?.[CrepeFeature.CodeMirror]).toBe(true)
  })
})

describe('Latex 的外部前提', () => {
  it('KaTeX 运行时在依赖里且能把公式渲染成 DOM', () => {
    const html = katex.renderToString('O(n \\log n)', { throwOnError: false })
    expect(html).toContain('katex')
    // 渲染结果真的带上了公式内容，不是一个空壳
    const host = document.createElement('div')
    host.innerHTML = html
    expect(host.querySelector('.katex')).not.toBeNull()
    expect(host.textContent).toContain('log')
  })

  it('写坏的公式在 throwOnError:false 下不抛异常', () => {
    expect(() => katex.renderToString('\\frac{1}{', { throwOnError: false })).not.toThrow()
  })
})

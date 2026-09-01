import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')
const uiSource = readFileSync(new URL('../../src/components/ui/ui.css', import.meta.url), 'utf8')
const displaySource = readFileSync(new URL('../../src/shared/display.ts', import.meta.url), 'utf8')

describe('设计 token 治理', () => {
  it('提供四档间距、三档语义圆角和三档缓动 token', () => {
    for (const token of ['--spacing-1', '--spacing-2', '--spacing-3', '--spacing-4']) {
      expect(source).toContain(token)
    }
    for (const token of ['--radius-control', '--radius-surface', '--radius-overlay']) {
      expect(source).toContain(token)
    }
    for (const token of ['--ease-in', '--ease-out', '--ease-in-out']) {
      expect(source).toContain(token)
    }
    // 只数 @theme 块内的定义：B5.4 起 --shadow-* 在暗色块里有第二档，
    // 按整文件计数会把"翻了档"误判成"多定义了一份"。
    const themeBlock = source.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(themeBlock).not.toBe('')
    expect(themeBlock.match(/--shadow-(?:sm|md|lg):/g)).toHaveLength(3)
    expect(themeBlock.match(/--duration-(?:fast|base|slow):/g)).toHaveLength(3)
    expect(source.match(/^:root\s*\{/gm)).toHaveLength(1)
    for (const token of ['--accent:', '--bg-code:']) {
      expect(source).toContain(token)
    }
    for (const token of ['var(--radius-control)', 'var(--radius-surface)', 'var(--radius-overlay)']) {
      expect(uiSource).toContain(token)
    }
  })

  it('暗色主题同时覆盖语义 color token 与兼容别名', () => {
    const darkBlock = source.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    for (const token of [
      '--color-app', '--color-chrome', '--color-card', '--color-inset', '--color-hover',
      '--color-ink', '--color-ink-2', '--color-ink-3', '--color-line', '--color-line-soft',
      '--color-accent', '--color-accent-strong', '--color-accent-soft',
      '--color-ok', '--color-ok-soft', '--color-warn', '--color-warn-soft',
      '--color-danger', '--color-danger-soft',
    ]) {
      expect(darkBlock, `dark theme missing ${token}`).toContain(token)
    }
    for (const token of ['--bg', '--bg-surface', '--bg-card', '--bg-code', '--text', '--text-secondary', '--text-muted']) {
      expect(darkBlock, `dark theme missing alias ${token}`).toContain(token)
    }
  })

  /*
   * B5.4：色板之外还有三类"依赖底色"的值必须翻档。少任何一项都会在暗色下产生
   * 具体缺陷（加白叠加变白块、阴影消失、滚动条滑块看不见），而这些都是纯 CSS
   * 缺陷，没有测试会因此变红——所以在这里钉住。
   */
  it('暗色主题翻转叠加层、阴影与滚动条滑块', () => {
    const darkBlock = source.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    for (const token of [
      '--color-overlay-hover', '--color-overlay-hover-strong', '--color-scrim',
      '--color-scrollbar-thumb', '--color-scrollbar-thumb-hover',
      '--shadow-sm', '--shadow-md', '--shadow-lg',
    ]) {
      expect(darkBlock, `dark theme missing ${token}`).toContain(token)
    }
  })

  it('叠加层与滚动条由 token 供给，不再写死 rgba', () => {
    const tabStrip = readFileSync(new URL('../../src/components/TabStrip.css', import.meta.url), 'utf8')
    expect(tabStrip).toContain('var(--color-overlay-hover)')
    expect(tabStrip).toContain('var(--color-overlay-hover-strong)')
    expect(uiSource).toContain('var(--color-scrim)')
    expect(source).toContain('var(--color-scrollbar-thumb)')
  })

  it('状态和 verdict 颜色消费语义 token，品牌/图表色保留独立色板', () => {
    expect(displaySource).toContain("solved: 'var(--color-ok)'")
    expect(displaySource).toContain("WA: 'var(--color-danger)'")
    expect(displaySource).toContain('PLATFORM_COLORS')
    expect(displaySource).toContain('CHART_COLORS')
  })
})

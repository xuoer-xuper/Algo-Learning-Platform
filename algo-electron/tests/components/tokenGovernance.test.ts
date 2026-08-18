import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')

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
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

/**
 * 交互控件与颜色的治理。
 *
 * 与 cardGovernance 同一思路：既断言"用了 ui/ 的原语"，也断言"原有样式锚点还在"，
 * 否则下次有人图省事换回裸控件、或顺手把布局类删掉，只有肉眼能发现。
 * 数量守卫在 tests/architecture（棘轮），这里管的是具体接线对不对。
 */

describe('交互控件治理', () => {
  it('题库侧栏的按钮与筛选器走 ui/ 原语，且保留局部样式锚点', () => {
    const sidebar = readSource('../../src/features/problems/ProblemSidebar.tsx')

    expect(sidebar).not.toMatch(/<button\b/)
    expect(sidebar).not.toMatch(/<select\b/)
    // 图标按钮必须带 title：IconButton 会同时写 title 与 aria-label，
    // 改回裸 button 时读屏就取不到名字了。
    expect(sidebar.match(/<IconButton\b/g)).toHaveLength(3)
    expect(sidebar.match(/className="sidebar-item-(?:notes|detail)"/g)).toHaveLength(2)
    expect(sidebar).toContain('className="sidebar-collapse-btn"')
    // 小号是设计系统尺寸，不是局部 CSS 覆盖，两个筛选器都要显式声明。
    expect(sidebar.match(/<Select size="sm" className="sidebar-select"/g)).toHaveLength(2)
  })

  it('笔记头部的标题与类型选择走 Input/Select，几何仍由局部类给', () => {
    const pane = readSource('../../src/features/problems/NoteEditorPane.tsx')

    expect(pane).not.toMatch(/<input\b/)
    expect(pane).not.toMatch(/<select\b/)
    expect(pane).toContain('<Input\n              className="note-editor-title"')
    expect(pane).toContain('<Select\n              className="note-editor-type"')
  })

  it('脚本源码框走 Textarea —— .ui-input 的固定高度会吃掉 rows', () => {
    const editor = readSource('../../src/features/scripts/UserScriptEditor.tsx')

    // 曾经写成 className="ui-input mono"，而 .ui-input 是 height: 30px，
    // rows={12} 完全失效。Textarea 的 height: auto 才让 rows 生效。
    expect(editor).not.toMatch(/<textarea\b/)
    expect(editor).not.toContain('ui-input mono')
    expect(editor).toContain('<Textarea')
    expect(editor).toContain('rows={12}')
  })

  it('崩溃兜底屏走 token 与 Button，不留 Tailwind 调色板', () => {
    const boundary = readSource('../../src/components/ErrorBoundary.tsx')

    // 这里曾是全项目唯一一处 Tailwind 工具类，且颜色写死在 red-50/600/900。
    expect(boundary).not.toMatch(/\bbg-red-\d+\b/)
    expect(boundary).not.toMatch(/\btext-(?:red|white)\b/)
    expect(boundary).not.toMatch(/<button\b/)
    expect(boundary).toContain('<Button')
    expect(boundary).toContain('className="crash-screen"')
  })

  it('首页卡片磁贴保持裸 button，但必须有 type="button"', () => {
    const home = readSource('../../src/features/home/HomePage.tsx')

    // 磁贴是长期例外（见 check-architecture.mjs 的白名单注释），
    // 唯一要求是显式 type，避免将来被放进 form 里变成提交按钮。
    // 只认作为 JSX 属性出现的那两处 —— 注释里也提到了这个串。
    expect(home.match(/<button\b/g)).toHaveLength(2)
    expect(home.match(/^\s+type="button"$/gm)).toHaveLength(2)
  })
})

describe('颜色治理', () => {
  it('笔记类型徽标用 CSS 修饰类，不在 TS 里存 hex', () => {
    const types = readSource('../../src/features/problems/notesTypes.ts')
    const list = readSource('../../src/features/problems/NoteList.tsx')
    const css = readSource('../../src/styles/notes.css')

    // 原先是 NOTE_TYPE_COLORS 三个 Catppuccin 深色值当浅卡片上的文字色，
    // 徽标对比度只有 1.2~1.9:1。现在文字恒为 --text-secondary，底色走 soft token。
    // 断言导出没了，而不是这个名字没出现 —— 注释里保留了它，用于记录为什么删。
    expect(types).not.toMatch(/export const NOTE_TYPE_COLORS/)
    expect(types).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(list).not.toContain('backgroundColor')
    for (const type of ['solution', 'review', 'summary']) {
      expect(css).toContain(`.note-item-type--${type}`)
    }
  })

  it('实心填充上的白字与系统惯例红都有 token 名', () => {
    const tokens = readSource('../../src/index.css')
    const ui = readSource('../../src/components/ui/ui.css')
    const shell = readSource('../../src/styles/app-shell.css')

    // --color-on-fill 不能用 --bg-card 代替：后者在深色主题下变 #1e222c，
    // 而压在 accent/danger 饱和底上的前景色两个主题都得是白。
    expect(tokens).toContain('--color-on-fill:')
    expect(tokens).toContain('--color-sys-close:')
    expect(ui.match(/var\(--color-on-fill\)/g)).toHaveLength(2)
    expect(shell).toContain('background-color: var(--color-sys-close)')
  })
})

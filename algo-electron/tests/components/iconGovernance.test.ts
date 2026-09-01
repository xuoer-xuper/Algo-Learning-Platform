import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const timelineSource = readSource('../../src/features/coach/SessionTimelineView.tsx')
const chatSource = readSource('../../src/features/coach/CoachChatPanel.tsx')
const bubbleSource = readSource('../../src/features/coach/CoachBubble.tsx')
const noteListSource = readSource('../../src/features/problems/NoteList.tsx')
const noteEditorSource = readSource('../../src/features/problems/NoteEditorPane.tsx')
const detailSource = readSource('../../src/features/problems/ProblemDetail.tsx')

describe('已治理图标入口', () => {
  it('关闭与删除按钮不回流到文本符号', () => {
    for (const source of [timelineSource, chatSource, bubbleSource, noteListSource]) {
      expect(source).not.toMatch(/[✕×✖]/u)
    }
  })

  it('时间轴各状态页统一使用关闭图标按钮', () => {
    expect(timelineSource.match(/<IconButton icon="close" title="关闭" className="settings-close"/g)).toHaveLength(4)
  })

  it('Coach 浮层保留原按钮尺寸并使用关闭图标', () => {
    for (const source of [chatSource, bubbleSource]) {
      expect(source).toContain('className="coach-bubble-close"')
      expect(source).toContain('<Icon name="close" size={12} />')
    }
  })

  it('笔记删除键使用固定尺寸的删除图标按钮', () => {
    expect(noteListSource).toMatch(/<IconButton\s+icon="trash"\s+size=\{12\}\s+danger\s+className="note-item-del"/)
  })

  it('时间轴、详情链接和笔记空态不回流到功能性 Unicode', () => {
    for (const source of [timelineSource, detailSource, noteEditorSource]) {
      expect(source).not.toMatch(/[➡⬆⚡💡★📝]/u)
    }
    expect(timelineSource.match(/icon: '(?:log-in|upload|bolt|lightbulb|star)'/g)).toHaveLength(5)
    expect(detailSource).toContain('<Icon name="external" size={12} />')
    // B5.2 起笔记空态的图标由 ui/Empty 的 icon 槽给，不再手搓 <Icon>；
    // 断言跟着换成 Empty 的调用形态，守的还是同一件事 —— 空态有真图标，不是字符。
    expect(noteEditorSource).toContain('<Empty icon="note"')
  })
})

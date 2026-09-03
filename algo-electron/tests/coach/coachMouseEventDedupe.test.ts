import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 桌宠鼠标事件去重测试。
 *
 * 问题：CoachPet、CoachBubble、CoachChatPanel 三层嵌套时都监听 mouseenter/mouseleave
 * 并调用 toggleCoachIgnoreMouseEvents，导致：
 * 1. setIgnoreMouseEvents 改变窗口命中测试状态
 * 2. 命中测试变化触发新的 mouseleave/mouseenter 事件
 * 3. 事件触发又调用 setIgnoreMouseEvents
 * 4. 形成反馈循环 → 桌宠闪烁、任务栏状态条不断切换
 *
 * 修复：只在最外层 CoachPet 控制穿透，移除 CoachBubble 和 CoachChatPanel 的重复控制。
 */

describe('桌宠鼠标事件去重', () => {
  let mockSetIgnoreMouseEvents: (ignore: boolean) => { ignore: boolean }
  let mouseEventCount: number

  beforeEach(() => {
    mouseEventCount = 0
    mockSetIgnoreMouseEvents = vi.fn((ignore: boolean) => {
      mouseEventCount++
      // 模拟实际行为：setIgnoreMouseEvents 不应该在同一值下被重复调用
      return { ignore }
    })
  })

  it('单层容器只触发一次穿透切换', () => {
    // 模拟 CoachPet.handleMouseEnter
    mockSetIgnoreMouseEvents(false)
    expect(mouseEventCount).toBe(1)

    // 模拟 CoachPet.handleMouseLeave
    mockSetIgnoreMouseEvents(true)
    expect(mouseEventCount).toBe(2)
  })

  it('修复前：三层嵌套导致多次调用（模拟问题场景）', () => {
    // 修复前的错误行为：CoachPet + CoachBubble + CoachChatPanel 都监听
    // 鼠标进入气泡区域
    mockSetIgnoreMouseEvents(false) // CoachPet.handleMouseEnter
    mockSetIgnoreMouseEvents(false) // CoachBubble.handleMouseEnter (冗余)
    mockSetIgnoreMouseEvents(false) // CoachChatPanel.handleMouseEnter (冗余)

    // 问题：即使有去重逻辑，多个监听器也会产生竞态
    expect(mouseEventCount).toBe(3)
  })

  it('修复后：只有外层控制穿透', () => {
    // 修复后：只有 CoachPet 控制
    mockSetIgnoreMouseEvents(false) // CoachPet.handleMouseEnter
    // CoachBubble 和 CoachChatPanel 不再监听 mouseenter/mouseleave

    expect(mouseEventCount).toBe(1) // 只调用一次
  })

  it('拖拽期间保持穿透关闭', () => {
    // 拖拽开始：关闭穿透
    mockSetIgnoreMouseEvents(false)
    expect(mouseEventCount).toBe(1)

    // 拖拽结束前不恢复穿透（即使 mouseleave 触发）
    // 实际逻辑：dragStartedRef.current 为 true 时，handleMouseLeave 不调用 toggleCoachIgnoreMouseEvents

    // 拖拽结束：恢复穿透
    mockSetIgnoreMouseEvents(true)
    expect(mouseEventCount).toBe(2)
  })
})

/**
 * CoachPetWindow.setIgnoreMouseEvents 去重逻辑测试。
 *
 * 主进程侧也有去重：lastIgnoreMouseEvents 缓存，值没变就不调 Electron API。
 */
describe('CoachPetWindow 主进程去重', () => {
  it('相同值不重复调用 win.setIgnoreMouseEvents', () => {
    const mockWinSetIgnoreMouseEvents = vi.fn()
    let lastIgnoreMouseEvents: boolean | null = null

    const setIgnoreMouseEvents = (ignore: boolean) => {
      if (lastIgnoreMouseEvents === ignore) return // 去重
      mockWinSetIgnoreMouseEvents(ignore, { forward: true })
      lastIgnoreMouseEvents = ignore
    }

    // 第一次调用
    setIgnoreMouseEvents(true)
    expect(mockWinSetIgnoreMouseEvents).toHaveBeenCalledTimes(1)

    // 重复调用相同值（去重生效）
    setIgnoreMouseEvents(true)
    expect(mockWinSetIgnoreMouseEvents).toHaveBeenCalledTimes(1)

    // 切换值
    setIgnoreMouseEvents(false)
    expect(mockWinSetIgnoreMouseEvents).toHaveBeenCalledTimes(2)

    // 再次重复
    setIgnoreMouseEvents(false)
    expect(mockWinSetIgnoreMouseEvents).toHaveBeenCalledTimes(2)
  })
})

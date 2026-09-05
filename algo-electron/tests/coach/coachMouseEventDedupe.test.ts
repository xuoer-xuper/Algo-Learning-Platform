// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoachPet } from '../../src/features/coach/CoachPet'

const api = vi.hoisted(() => ({
  toggle: vi.fn(),
  startDrag: vi.fn(),
  endDrag: vi.fn(),
  click: vi.fn(),
  showBubble: null as ((payload: CoachBubblePayload) => void) | null,
  dismissBubble: null as (() => void) | null,
}))

vi.mock('../../src/features/coach/coachDataApi', () => ({
  loadCoachPetState: async () => 'idle',
  loadCoachConfig: async () => ({ scale: 1 }),
  subscribeCoachPetState: () => () => {},
  subscribeCoachConfig: () => () => {},
  subscribeCoachShowBubble: (listener: (payload: CoachBubblePayload) => void) => {
    api.showBubble = listener
    return () => { api.showBubble = null }
  },
  subscribeCoachDismissBubble: (listener: () => void) => {
    api.dismissBubble = listener
    return () => { api.dismissBubble = null }
  },
  toggleCoachIgnoreMouseEvents: api.toggle,
  startCoachDrag: api.startDrag,
  endCoachDrag: api.endDrag,
  clickCoachPet: api.click,
  triggerCoachHint: vi.fn(),
  dismissCoachHint: vi.fn(),
  sendCoachFeedback: vi.fn(),
  dismissCoachDisclaimer: vi.fn(),
  sendCoachChatMessage: vi.fn(),
}))

const hint: CoachBubblePayload = {
  id: 'hint-1', title: 'Hint', message: 'Check the constraints.', source: 'local', level: 1,
}
let petBounds: DOMRect

function moveTo(clientX: number, clientY: number) {
  fireEvent.mouseMove(document, { clientX, clientY })
}

async function mountPet() {
  const result = render(React.createElement(CoachPet))
  await act(async () => {})
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  petBounds = new DOMRect(110, 436, 180, 180)
  api.click.mockResolvedValue({ triggered: true, level: 1, llmEnabled: true })
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('pet-body')) return petBounds
    if (this.classList.contains('coach-bubble')) return new DOMRect(30, 120, 340, 270)
    if (this.classList.contains('coach-chat-panel')) return new DOMRect(20, 40, 360, 550)
    if (this.classList.contains('pet-root')) return new DOMRect(0, 0, 400, 640)
    return new DOMRect()
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CoachPet native mouse capture', () => {
  it('keeps the transparent window empty area click-through and releases after leaving the pet', async () => {
    await mountPet()
    expect(api.toggle).toHaveBeenLastCalledWith(true)
    api.toggle.mockClear()

    moveTo(20, 20)
    expect(api.toggle).not.toHaveBeenCalled()
    moveTo(200, 530)
    expect(api.toggle).toHaveBeenLastCalledWith(false)
    moveTo(20, 20)
    expect(api.toggle.mock.calls).toEqual([[false], [true]])
  })

  it('ignores synthetic leave events and repeated movement at the same interactive position', async () => {
    await mountPet()
    moveTo(200, 530)
    api.toggle.mockClear()

    moveTo(210, 535)
    fireEvent.mouseLeave(document, { clientX: 210, clientY: 535 })
    moveTo(210, 535)
    expect(api.toggle).not.toHaveBeenCalled()

    fireEvent.mouseLeave(document, { clientX: 401, clientY: 535 })
    expect(api.toggle.mock.calls).toEqual([[true]])
  })

  it('only captures a visible bubble under the pointer and releases when it disappears', async () => {
    await mountPet()
    moveTo(20, 20)
    api.toggle.mockClear()
    act(() => api.showBubble?.(hint))
    expect(api.toggle).not.toHaveBeenCalled()

    moveTo(200, 200)
    expect(api.toggle).toHaveBeenLastCalledWith(false)
    api.toggle.mockClear()
    act(() => api.dismissBubble?.())
    expect(api.toggle.mock.calls).toEqual([[true]])
  })

  it('captures a newly shown bubble under a stationary pointer, then releases on close', async () => {
    await mountPet()
    moveTo(200, 200)
    api.toggle.mockClear()
    act(() => api.showBubble?.(hint))
    expect(api.toggle.mock.calls).toEqual([[false]])

    fireEvent.click(screen.getByRole('button', { name: '关闭气泡' }))
    expect(api.toggle).toHaveBeenLastCalledWith(true)
  })

  it('keeps capture during drag through empty space and releases at mouseup outside controls', async () => {
    await mountPet()
    const pet = screen.getByRole('img')
    fireEvent.mouseDown(pet, { button: 0, clientX: 200, clientY: 530, screenX: 200, screenY: 530 })
    expect(api.startDrag).toHaveBeenCalledOnce()
    expect(api.toggle).toHaveBeenLastCalledWith(false)
    api.toggle.mockClear()
    moveTo(20, 20)
    expect(api.toggle).not.toHaveBeenCalled()

    fireEvent.mouseUp(document, { clientX: 20, clientY: 20, screenX: 20, screenY: 20 })
    expect(api.endDrag).toHaveBeenCalledOnce()
    expect(api.click).not.toHaveBeenCalled()
    expect(api.toggle.mock.calls).toEqual([[true]])
  })

  it('keeps a clicked pet interactive and captures only the open chat panel bounds', async () => {
    await mountPet()
    const pointer = { button: 0, clientX: 200, clientY: 530, screenX: 200, screenY: 530 }
    fireEvent.mouseDown(screen.getByRole('img'), pointer)
    fireEvent.mouseUp(document, pointer)
    await waitFor(() => expect(api.click).toHaveBeenCalledOnce())
    expect(api.toggle).toHaveBeenLastCalledWith(false)
    act(() => api.showBubble?.(hint))
    fireEvent.click(await screen.findByRole('button', { name: '自由对话' }))
    await screen.findByRole('button', { name: '关闭对话' })

    moveTo(200, 60)
    expect(api.toggle).toHaveBeenLastCalledWith(false)
    moveTo(5, 60)
    expect(api.toggle).toHaveBeenLastCalledWith(true)
    moveTo(200, 60)
    expect(api.toggle).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: '关闭对话' }))
    expect(api.toggle).toHaveBeenLastCalledWith(true)
  })

  it('ends a drag on blur without clicking and cleans listeners on unmount', async () => {
    const { unmount } = await mountPet()
    fireEvent.mouseDown(screen.getByRole('img'), { button: 0, clientX: 200, clientY: 530 })
    fireEvent.blur(window)
    expect(api.endDrag).toHaveBeenCalledOnce()
    expect(api.click).not.toHaveBeenCalled()
    expect(api.toggle).toHaveBeenLastCalledWith(true)

    unmount()
    api.toggle.mockClear()
    moveTo(200, 530)
    expect(api.toggle).not.toHaveBeenCalled()
  })

  it('remeasures a stationary pointer after a scale transition completes', async () => {
    await mountPet()
    moveTo(100, 500)
    expect(api.toggle).toHaveBeenLastCalledWith(true)
    petBounds = new DOMRect(90, 416, 220, 220)
    fireEvent(screen.getByRole('img'), new Event('transitionend', { bubbles: true }))
    expect(api.toggle).toHaveBeenLastCalledWith(false)

    petBounds = new DOMRect(110, 436, 180, 180)
    fireEvent(screen.getByRole('img'), new Event('transitionend', { bubbles: true }))
    expect(api.toggle).toHaveBeenLastCalledWith(true)
  })
})

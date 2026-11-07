// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installNativeInputDiagnostics,
  readNativeInputDiagnostics,
  readNativeWindowDiagnostics,
  rethrowWithNativeInputDiagnostics,
} from './native-input-diagnostics'

const recorderKey = '__ALP_NATIVE_INPUT_DIAGNOSTICS__'
type FinishDrag = typeof window.api.tab.finishDrag
const input = { tabId: 'home', targetIndex: 7, screenX: 600, screenY: 20 }

function recorder() {
  const value = Reflect.get(window, recorderKey) as
    | {
        read: () => NonNullable<ReturnType<typeof readNativeInputDiagnostics>['recorder']>
        cleanup: () => void
      }
    | undefined
  if (!value) throw new Error('Diagnostic recorder missing')
  return value
}

function apiWith(finishDrag: FinishDrag) {
  const tab = { finishDrag }
  Reflect.set(window, 'api', { tab })
  return tab
}

beforeEach(() => {
  document.body.innerHTML =
    '<div class="tab-strip-tabs"><div class="tab-item" data-tab-id="home"><button class="tab-item-main">Tab</button></div></div>'
})

afterEach(() => {
  const current = Reflect.get(window, recorderKey) as { cleanup(): void } | undefined
  current?.cleanup()
  Reflect.deleteProperty(window, 'api')
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('native input recorder', () => {
  it('bounds recent events and observes pointer capture without layout or style reads', () => {
    apiWith(vi.fn<FinishDrag>().mockResolvedValue(true))
    const geometry = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => {
      throw new Error('hot-path geometry')
    })
    const styles = vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      throw new Error('hot-path styles')
    })
    const button = document.querySelector('button')
    if (!button) throw new Error('Missing test button')
    Reflect.set(button, 'hasPointerCapture', () => true)
    installNativeInputDiagnostics(3)
    const events = [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'gotpointercapture',
      'lostpointercapture',
      'dragstart',
      'dragend',
      'drop',
      'focus',
      'blur',
    ]
    for (const type of events)
      button.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 9, clientX: 500, buttons: 1 }),
      )
    const result = recorder().read()
    expect(result.events.map(({ type }) => type)).toEqual(['drop', 'focus', 'blur'])
    expect(result.dropped).toBe(events.length - 3)
    expect(result.events[0]).toMatchObject({
      tabId: 'home',
      pointerId: 9,
      captured: true,
      clientX: 500,
      buttons: 1,
    })
    expect(geometry).not.toHaveBeenCalled()
    expect(styles).not.toHaveBeenCalled()
  })

  it('preserves this, arguments, exact promise identity and resolved values', async () => {
    const promise = Promise.resolve(true)
    const original = vi.fn<FinishDrag>().mockReturnValue(promise)
    const tab = apiWith(original)
    installNativeInputDiagnostics()
    expect(tab.finishDrag(input)).toBe(promise)
    expect(original).toHaveBeenCalledExactlyOnceWith(input)
    expect(original.mock.contexts[0]).toBe(tab)
    await promise
    expect(recorder().read().events).toEqual([
      expect.objectContaining({ type: 'finishDrag:call', args: [input] }),
      expect.objectContaining({ type: 'finishDrag:result', value: true }),
    ])
  })

  it('preserves a synchronous return if a fixture replaces the async API', () => {
    const original = vi.fn(() => false)
    const tab = apiWith(original as unknown as FinishDrag)
    installNativeInputDiagnostics()
    expect(tab.finishDrag(input)).toBe(false)
    expect(original).toHaveBeenCalledOnce()
    expect(recorder().read().events[1]).toMatchObject({ type: 'finishDrag:result', value: false })
  })

  it('rethrows the identical synchronous API exception without a fallback call', () => {
    const error = new Error('original sync failure')
    const original = vi.fn<FinishDrag>(() => {
      throw error
    })
    const tab = apiWith(original)
    installNativeInputDiagnostics()
    let caught: unknown
    try {
      tab.finishDrag(input)
    } catch (failure) {
      caught = failure
    }
    expect(caught).toBe(error)
    expect(original).toHaveBeenCalledOnce()
    expect(recorder().read().events[1]).toMatchObject({
      type: 'finishDrag:throw',
      error: String(error),
    })
  })

  it('returns the same rejected promise and observes the original rejection', async () => {
    const error = new Error('original rejected operation')
    const promise = Promise.reject(error)
    const original = vi.fn<FinishDrag>().mockReturnValue(promise)
    const tab = apiWith(original)
    installNativeInputDiagnostics()
    const result = tab.finishDrag(input)
    expect(result).toBe(promise)
    await expect(result).rejects.toBe(error)
    expect(recorder().read().events[1]).toMatchObject({
      type: 'finishDrag:reject',
      error: String(error),
    })
  })

  it('isolates observer errors and cleans up listeners and the wrapper idempotently', async () => {
    const original = vi.fn<FinishDrag>().mockResolvedValue(true)
    const tab = apiWith(original)
    installNativeInputDiagnostics()
    const current = recorder()
    const focus = new Event('focus')
    const blur = new Event('blur')
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('observer failed')
    })
    await expect(tab.finishDrag(input)).resolves.toBe(true)
    window.dispatchEvent(focus)
    expect(current.read().observerErrors).toBe(3)
    current.cleanup()
    current.cleanup()
    expect(tab.finishDrag).toBe(original)
    window.dispatchEvent(blur)
    expect(current.read().observerErrors).toBe(3)
    expect(Reflect.get(window, recorderKey)).toBeUndefined()
  })

  it('does not overwrite a later fixture replacement during cleanup or duplicate on reinstall', async () => {
    const original = vi.fn<FinishDrag>().mockResolvedValue(true)
    const tab = apiWith(original)
    installNativeInputDiagnostics()
    installNativeInputDiagnostics()
    await tab.finishDrag(input)
    expect(original).toHaveBeenCalledOnce()
    expect(recorder().read().events).toHaveLength(2)
    const replacement = vi.fn<FinishDrag>().mockResolvedValue(false)
    tab.finishDrag = replacement
    recorder().cleanup()
    expect(tab.finishDrag).toBe(replacement)
  })

  it('retains event recording if the API is not ready or its method is read-only', () => {
    installNativeInputDiagnostics()
    expect(recorder().read().finishDragObserved).toBe(false)
    const tab = apiWith(vi.fn<FinishDrag>().mockResolvedValue(true))
    Object.defineProperty(tab, 'finishDrag', { writable: false })
    installNativeInputDiagnostics()
    window.dispatchEvent(new Event('focus'))
    expect(recorder().read()).toMatchObject({ finishDragObserved: false, observerErrors: 1 })
    expect(recorder().read().events).toHaveLength(1)
  })

  it('runs the renderer evaluator after serialization without module closures', async () => {
    const original = vi.fn<FinishDrag>().mockResolvedValue(true)
    const tab = apiWith(original)
    const install = new Function(
      `return (${installNativeInputDiagnostics.toString()})`,
    )() as typeof installNativeInputDiagnostics
    const read = new Function(
      `return (${readNativeInputDiagnostics.toString()})`,
    )() as typeof readNativeInputDiagnostics
    install(4)
    await tab.finishDrag(input)
    expect(read().recorder?.events).toHaveLength(2)
    expect(original).toHaveBeenCalledOnce()
  })

  it('captures renderer and native state read-only only when requested', () => {
    apiWith(vi.fn<FinishDrag>().mockResolvedValue(true))
    installNativeInputDiagnostics()
    const before = document.body.innerHTML
    const renderer = readNativeInputDiagnostics()
    expect(renderer.tabs).toMatchObject([{ id: 'home', dragging: false }])
    expect(document.body.innerHTML).toBe(before)
    const window = {
      isVisible: vi.fn(() => true),
      isFocused: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      getBounds: vi.fn(() => ({ x: 1, y: 2, width: 800, height: 600 })),
      getContentBounds: vi.fn(() => ({ x: 1, y: 2, width: 800, height: 600 })),
      webContents: { isLoading: vi.fn(() => true), isFocused: vi.fn(() => false) },
    }
    const bindings = {
      BrowserWindow: { getAllWindows: () => [window] },
      screen: { getCursorScreenPoint: () => ({ x: 1000, y: 900 }) },
    }
    const serializedNative = new Function(
      `return (${readNativeWindowDiagnostics.toString()})`,
    )() as typeof readNativeWindowDiagnostics
    const native = serializedNative(
      bindings as unknown as Parameters<typeof readNativeWindowDiagnostics>[0],
    )
    expect(native).toMatchObject({
      visible: true,
      focused: false,
      minimized: false,
      loading: true,
      webContentsFocused: false,
      cursor: { x: 1000, y: 900 },
    })
  })
})

describe('failure attachments', () => {
  it('keeps the primary error when a capture fails and attaches the other process independently', async () => {
    const original = new Error('drag order remained zero')
    const attach = vi.fn<(body: string) => Promise<void>>().mockResolvedValue()
    await expect(
      rethrowWithNativeInputDiagnostics(original, {
        renderer: async () => {
          throw new Error('renderer gone')
        },
        native: async () => ({ focused: false, visible: true }),
        attach,
      }),
    ).rejects.toBe(original)
    expect(JSON.parse(attach.mock.calls[0][0])).toEqual({
      renderer: { captureError: 'Error: renderer gone' },
      native: { data: { focused: false, visible: true } },
    })
  })

  it('does not replace the primary error when attachment itself rejects', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const original = new Error('native readiness failed')
    await expect(
      rethrowWithNativeInputDiagnostics(original, {
        renderer: async () => ({}),
        native: async () => ({}),
        attach: async () => {
          throw new Error('attachment unavailable')
        },
      }),
    ).rejects.toBe(original)
    expect(warning).toHaveBeenCalledOnce()
  })

  it('keeps the primary failure even when diagnostic logging also throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('logger unavailable')
    })
    const original = new Error('original order assertion')
    await expect(
      rethrowWithNativeInputDiagnostics(original, {
        renderer: async () => ({}),
        native: async () => ({}),
        attach: async () => {
          throw new Error('attachment unavailable')
        },
      }),
    ).rejects.toBe(original)
  })

  it('bounds a hung diagnostic read without changing the original assertion failure', async () => {
    vi.useFakeTimers()
    const original = new Error('original timeout')
    const attach = vi.fn<(body: string) => Promise<void>>().mockResolvedValue()
    const outcome = rethrowWithNativeInputDiagnostics(original, {
      renderer: () => new Promise(() => {}),
      native: async () => ({ visible: true }),
      attach,
    }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await outcome).toBe(original)
    expect(JSON.parse(attach.mock.calls[0][0]).renderer.captureError).toContain('timed out')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds a hung attachment and still returns the original assertion error', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const original = new Error('original drag failure')
    const outcome = rethrowWithNativeInputDiagnostics(original, {
      renderer: async () => ({}),
      native: async () => ({}),
      attach: () => new Promise(() => {}),
    }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await outcome).toBe(original)
    expect(vi.getTimerCount()).toBe(0)
  })
})

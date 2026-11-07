interface InputDiagnosticEntry {
  type: string
  at: number
  [key: string]: unknown
}

interface InputDiagnosticRecorder {
  read(): {
    events: InputDiagnosticEntry[]
    dropped: number
    observerErrors: number
    finishDragObserved: boolean
  }
  cleanup(): void
}

/** Self-contained because Playwright serializes this function into the renderer. */
export function installNativeInputDiagnostics(maxEvents = 256): void {
  const key = '__ALP_NATIVE_INPUT_DIAGNOSTICS__'
  const previous = Reflect.get(window, key) as InputDiagnosticRecorder | undefined
  previous?.cleanup()
  const limit = Math.max(1, Math.min(1024, Math.floor(maxEvents) || 256))
  const events: InputDiagnosticEntry[] = []
  let dropped = 0
  let observerErrors = 0
  let stopped = false
  const record = (type: string, details: () => Record<string, unknown>) => {
    if (stopped) return
    try {
      const entry = { type, at: Date.now(), ...details() }
      if (events.length === limit) {
        events.shift()
        dropped += 1
      }
      events.push(entry)
    } catch {
      // Diagnostics are observers; a failed read must never affect input or API behavior.
      observerErrors += 1
    }
  }
  const eventTypes = [
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
  const onEvent = (event: Event) =>
    record(event.type, () => {
      const pointer = event instanceof PointerEvent ? event : null
      const mouse = event instanceof MouseEvent ? event : null
      const target = event.target instanceof Element ? event.target : null
      return {
        trusted: event.isTrusted,
        target: target?.tagName ?? null,
        className: target?.getAttribute('class') ?? null,
        tabId: target?.closest('[data-tab-id]')?.getAttribute('data-tab-id') ?? null,
        pointerId: pointer?.pointerId,
        pointerType: pointer?.pointerType,
        button: mouse?.button,
        buttons: mouse?.buttons,
        clientX: mouse?.clientX,
        clientY: mouse?.clientY,
        screenX: mouse?.screenX,
        screenY: mouse?.screenY,
        captured:
          pointer && target ? (target.hasPointerCapture?.(pointer.pointerId) ?? false) : null,
      }
    })
  for (const type of eventTypes)
    window.addEventListener(type, onEvent, { capture: true, passive: true })

  const tab = window.api?.tab
  const original = tab?.finishDrag
  const observed: typeof original =
    original &&
    function (this: typeof tab, ...args) {
      record('finishDrag:call', () => ({ args: args.map((input) => ({ ...input })) }))
      let result: ReturnType<typeof original>
      try {
        result = original.apply(this, args)
      } catch (error) {
        record('finishDrag:throw', () => ({ error: String(error) }))
        throw error
      }
      try {
        if (result && typeof result.then === 'function') {
          void result.then(
            (value) => record('finishDrag:result', () => ({ value })),
            (error: unknown) => record('finishDrag:reject', () => ({ error: String(error) })),
          )
        } else record('finishDrag:result', () => ({ value: result }))
      } catch {
        observerErrors += 1
      }
      // Preserve the caller's promise/value and rejection; observing rejection marks it handled.
      return result
    }
  let finishDragObserved = false
  try {
    if (tab && observed) {
      tab.finishDrag = observed
      finishDragObserved = tab.finishDrag === observed
    }
  } catch {
    observerErrors += 1
  }

  const recorder: InputDiagnosticRecorder = {
    read: () => ({ events: [...events], dropped, observerErrors, finishDragObserved }),
    cleanup: () => {
      stopped = true
      for (const type of eventTypes) window.removeEventListener(type, onEvent, true)
      if (tab && original && tab.finishDrag === observed) tab.finishDrag = original
      if (Reflect.get(window, key) === recorder) Reflect.deleteProperty(window, key)
    },
  }
  Reflect.set(window, key, recorder)
}

/** Called only after a failed assertion; no layout reads occur in event listeners. */
export function readNativeInputDiagnostics() {
  const bounds = (element: Element | null) => {
    if (!element) return null
    const { x, y, width, height } = element.getBoundingClientRect()
    return { x, y, width, height }
  }
  const recorder = Reflect.get(window, '__ALP_NATIVE_INPUT_DIAGNOSTICS__') as
    InputDiagnosticRecorder | undefined
  const strip = document.querySelector('.tab-strip-tabs')
  return {
    recorder: recorder?.read() ?? null,
    readyState: document.readyState,
    focused: document.hasFocus(),
    activeElement: document.activeElement?.tagName,
    activeViewTransition: Boolean(Reflect.get(document, 'activeViewTransition')),
    scrollLeft: strip?.scrollLeft,
    scrollWidth: strip?.scrollWidth,
    clientWidth: strip?.clientWidth,
    stripBounds: bounds(strip),
    tabs: [...document.querySelectorAll('.tab-item')].map((element) => ({
      id: element.getAttribute('data-tab-id'),
      dragging: element.classList.contains('tab-item-dragging'),
      bounds: bounds(element),
    })),
  }
}

export function readNativeWindowDiagnostics({
  BrowserWindow,
  screen,
}: Pick<typeof import('electron'), 'BrowserWindow' | 'screen'>) {
  const window = BrowserWindow.getAllWindows()[0]
  return {
    at: Date.now(),
    cursor: screen.getCursorScreenPoint(),
    windowCount: BrowserWindow.getAllWindows().length,
    visible: window?.isVisible(),
    focused: window?.isFocused(),
    minimized: window?.isMinimized(),
    loading: window?.webContents.isLoading(),
    webContentsFocused: window?.webContents.isFocused(),
    bounds: window?.getBounds(),
    contentBounds: window?.getContentBounds(),
  }
}

/** Capture both processes independently and always rethrow the original failure. */
export async function rethrowWithNativeInputDiagnostics(
  error: unknown,
  sources: {
    renderer: () => Promise<unknown>
    native: () => Promise<unknown>
    attach: (body: string) => Promise<void>
  },
): Promise<never> {
  const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Diagnostic collection timed out')), 2000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  const capture = async (read: () => Promise<unknown>) => {
    try {
      return { data: await bounded(read) }
    } catch (error) {
      return { captureError: String(error) }
    }
  }
  try {
    const [renderer, native] = await Promise.all([
      capture(sources.renderer),
      capture(sources.native),
    ])
    await bounded(() => sources.attach(JSON.stringify({ renderer, native }, null, 2)))
  } catch (diagnosticError) {
    try {
      console.warn('Unable to attach native input diagnostics', diagnosticError)
    } catch {
      // Even a broken diagnostic logger must not replace the original assertion.
    }
  }
  throw error
}

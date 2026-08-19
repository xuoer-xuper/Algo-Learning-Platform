export interface WindowSessionRuntime {
  persistence: {
    dispose(): Promise<void>
  }
  removeChangeListener(): void
}

interface WindowSessionRuntimeEntry extends WindowSessionRuntime {
  disposePromise: Promise<void> | null
}

export class WindowSessionRegistry {
  private readonly entries = new Map<string, WindowSessionRuntimeEntry>()

  get size(): number {
    return this.entries.size
  }

  has(windowId: string): boolean {
    return this.entries.has(windowId)
  }

  register(windowId: string, runtime: WindowSessionRuntime): void {
    if (this.entries.has(windowId)) {
      throw new Error(`Window ${windowId} session persistence is already registered`)
    }
    this.entries.set(windowId, { ...runtime, disposePromise: null })
  }

  dispose(windowId: string): Promise<void> {
    const runtime = this.entries.get(windowId)
    if (!runtime) return Promise.resolve()
    if (runtime.disposePromise) return runtime.disposePromise

    const disposePromise = Promise.resolve()
      .then(() => {
        runtime.removeChangeListener()
        return runtime.persistence.dispose()
      })
      .finally(() => {
        if (this.entries.get(windowId) === runtime) this.entries.delete(windowId)
      })
    runtime.disposePromise = disposePromise
    return disposePromise
  }

  async disposeAll(): Promise<void> {
    await Promise.allSettled([...this.entries.keys()].map((windowId) => this.dispose(windowId)))
  }
}

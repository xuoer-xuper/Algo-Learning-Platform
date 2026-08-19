export class WindowCreationGate<T> {
  private inFlight: Promise<T | null> | null = null
  private enabled = false
  private stopped = false

  get isRunning(): boolean {
    return this.inFlight !== null
  }

  enable(): void {
    if (!this.stopped) this.enabled = true
  }

  stop(): void {
    this.stopped = true
  }

  run(create: (isCancelled: () => boolean) => Promise<T | null>): Promise<T | null> {
    if (!this.enabled || this.stopped) return Promise.resolve(null)
    if (this.inFlight) return this.inFlight

    let trackedPromise: Promise<T | null>
    trackedPromise = Promise.resolve()
      .then(() => create(() => this.stopped))
      .finally(() => {
        if (this.inFlight === trackedPromise) this.inFlight = null
      })
    this.inFlight = trackedPromise
    return trackedPromise
  }

  waitForIdle(): Promise<void> {
    const inFlight = this.inFlight
    return inFlight ? inFlight.then(() => undefined, () => undefined) : Promise.resolve()
  }
}

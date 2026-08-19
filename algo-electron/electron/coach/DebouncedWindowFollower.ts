export interface WindowFollowerTarget {
  id: string
}

export interface DebouncedWindowFollowerOptions<T extends WindowFollowerTarget> {
  delayMs: number
  onApply: (target: T | null) => void
  setTimeout?: (callback: () => void, delayMs: number) => NodeJS.Timeout
  clearTimeout?: (handle: NodeJS.Timeout) => void
}

/** Applies only the last window observed during a short focus-change burst. */
export class DebouncedWindowFollower<T extends WindowFollowerTarget> {
  private readonly delayMs: number
  private readonly onApply: (target: T | null) => void
  private readonly scheduleTimeout: (callback: () => void, delayMs: number) => NodeJS.Timeout
  private readonly cancelTimeout: (handle: NodeJS.Timeout) => void
  private pendingTarget: T | null = null
  private pendingHandle: NodeJS.Timeout | null = null

  constructor(options: DebouncedWindowFollowerOptions<T>) {
    this.delayMs = options.delayMs
    this.onApply = options.onApply
    this.scheduleTimeout = options.setTimeout ?? setTimeout
    this.cancelTimeout = options.clearTimeout ?? clearTimeout
  }

  applyNow(target: T | null): void {
    this.cancelPending()
    this.onApply(target)
  }

  request(target: T | null): void {
    this.cancelPending()
    this.pendingTarget = target
    this.pendingHandle = this.scheduleTimeout(() => {
      const settledTarget = this.pendingTarget
      this.pendingHandle = null
      this.pendingTarget = null
      this.onApply(settledTarget)
    }, this.delayMs)
  }

  stop(): void {
    this.cancelPending()
  }

  private cancelPending(): void {
    if (this.pendingHandle !== null) this.cancelTimeout(this.pendingHandle)
    this.pendingHandle = null
    this.pendingTarget = null
  }
}

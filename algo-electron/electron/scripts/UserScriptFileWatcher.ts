import fs from 'node:fs'
import path from 'node:path'

export interface UserScriptFileWatcherOptions {
  directory: string
  onChanged: () => void
  /**
   * Current runtime generation. The app writes into the watched directory during
   * import, install and update, and each of those already refreshes the runtime
   * explicitly. Comparing the generation captured when a change was observed
   * against the generation at debounce time lets the watcher skip its own echo,
   * which otherwise tore down every live GM port a second time ~150ms later.
   */
  getGeneration?: () => number
  debounceMs?: number
  watch?: typeof fs.watch
  mkdir?: (directory: string) => void
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

/**
 * Watches only the managed userscript directory. Source contents are never
 * read or logged here; a change simply invalidates the main-process cache.
 */
export class UserScriptFileWatcher {
  private readonly directory: string
  private readonly onChanged: () => void
  private readonly getGeneration: (() => number) | null
  private readonly debounceMs: number
  private readonly watch: typeof fs.watch
  private readonly mkdir: (directory: string) => void
  private readonly setTimeout: typeof setTimeout
  private readonly clearTimeout: typeof clearTimeout
  private watcher: fs.FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private observedGeneration: number | null = null

  constructor(options: UserScriptFileWatcherOptions) {
    this.directory = path.resolve(options.directory)
    this.onChanged = options.onChanged
    this.getGeneration = options.getGeneration ?? null
    this.debounceMs = options.debounceMs ?? 150
    this.watch = options.watch ?? fs.watch
    this.mkdir = options.mkdir ?? (directory => fs.mkdirSync(directory, { recursive: true }))
    this.setTimeout = options.setTimeout ?? setTimeout
    this.clearTimeout = options.clearTimeout ?? clearTimeout
  }

  start(): void {
    if (this.watcher) return
    this.mkdir(this.directory)
    try {
      this.watcher = this.watch(this.directory, { persistent: false }, (_event, filename) => {
        if (!isManagedScriptFile(filename)) return
        this.scheduleRefresh()
      })
      this.watcher.on('error', () => this.scheduleRefresh())
    }
    catch {
      // A transient directory/watch failure must not prevent startup. A later
      // explicit refresh still keeps the runtime fail-closed.
      this.watcher = null
    }
  }

  stop(): void {
    if (this.timer) {
      this.clearTimeout(this.timer)
      this.timer = null
    }
    this.observedGeneration = null
    this.watcher?.close()
    this.watcher = null
  }

  private scheduleRefresh(): void {
    if (this.timer) this.clearTimeout(this.timer)
    else this.observedGeneration = this.getGeneration?.() ?? null
    this.timer = this.setTimeout(() => {
      this.timer = null
      const observed = this.observedGeneration
      this.observedGeneration = null
      // An in-app write already refreshed the runtime while this debounce was
      // pending, so the change is accounted for.
      if (observed !== null && (this.getGeneration?.() ?? observed) !== observed) return
      this.onChanged()
    }, this.debounceMs)
  }
}

function isManagedScriptFile(filename: string | Buffer | null): boolean {
  if (filename === null) return true
  const name = typeof filename === 'string' ? filename : filename.toString('utf8')
  return name.length > 0 && path.basename(name) === name && /\.js$/i.test(name)
}

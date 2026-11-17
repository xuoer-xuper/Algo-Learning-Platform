export function loadWindowMaximized(): Promise<boolean> {
  return window.api.window.isMaximized()
}

export function subscribeWindowMaximized(callback: (maximized: boolean) => void): () => void {
  return window.api.window.onMaximized(callback)
}

export function minimizeAppWindow(): void {
  window.api.window.minimize()
}

export function toggleAppWindowMaximized(): void {
  window.api.window.maximize()
}

export function closeAppWindow(): void {
  window.api.window.close()
}

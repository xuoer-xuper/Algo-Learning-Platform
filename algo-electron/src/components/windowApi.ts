export function loadWindowMaximized(): Promise<boolean> {
  return window.electronAPI.isWindowMaximized()
}

export function subscribeWindowMaximized(callback: (maximized: boolean) => void): () => void {
  return window.electronAPI.onWindowMaximized(callback)
}

export function minimizeAppWindow(): void {
  window.electronAPI.minimizeWindow()
}

export function toggleAppWindowMaximized(): void {
  window.electronAPI.maximizeWindow()
}

export function closeAppWindow(): void {
  window.electronAPI.closeWindow()
}

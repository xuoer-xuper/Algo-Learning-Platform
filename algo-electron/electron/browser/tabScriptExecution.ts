import type { ManagedTab } from './tabManagerTypes'

export async function executeScriptAcrossFrames(
  tab: ManagedTab,
  topPageUrl: string,
  code: string,
): Promise<any> {
  const wrappedCode = `try { window.__ALGO_TOP_PAGE_URL = ${JSON.stringify(topPageUrl)}; } catch (_) {}\n${code}`
  const result = await tab.view.webContents.executeJavaScript(wrappedCode)
  const frames = tab.view.webContents.mainFrame?.framesInSubtree ?? []
  await Promise.all(frames.map(async (frame) => {
    try {
      if (frame.isDestroyed()) return
      if (frame === tab.view.webContents.mainFrame) return
      await frame.executeJavaScript(wrappedCode)
    } catch {
      // Some cross-origin subframes may disappear or deny execution between enumeration and injection.
    }
  }))
  return result
}

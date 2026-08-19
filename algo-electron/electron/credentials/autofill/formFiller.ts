export interface CredentialFormFillPayload {
  credentialId: string
  siteId: string
  username: string
  password: string
  pageUrl: string
  usernameSelectors: string[]
  passwordSelectors: string[]
}

export interface CredentialFormFillResult {
  usernameFilled: boolean
  passwordFilled: boolean
}

export function isCredentialFormFillPayload(value: unknown): value is CredentialFormFillPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.credentialId === 'string'
    && typeof record.siteId === 'string'
    && typeof record.username === 'string'
    && typeof record.password === 'string'
    && typeof record.pageUrl === 'string'
    && isSelectorList(record.usernameSelectors)
    && isSelectorList(record.passwordSelectors)
}

export async function fillCredentialFormWithRetry(
  documentLike: Pick<Document, 'querySelector'>,
  payload: CredentialFormFillPayload,
  options: { maxAttempts?: number; delayMs?: number } = {},
): Promise<CredentialFormFillResult> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 20, 40))
  const delayMs = Math.max(0, Math.min(options.delayMs ?? 250, 1_000))
  let result: CredentialFormFillResult = { usernameFilled: false, passwordFilled: false }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    result = fillCredentialForm(documentLike, payload)
    if (result.usernameFilled && result.passwordFilled) return result
    if (attempt + 1 < maxAttempts) await delay(delayMs)
  }
  return result
}

export function fillCredentialForm(
  documentLike: Pick<Document, 'querySelector'>,
  payload: CredentialFormFillPayload,
): CredentialFormFillResult {
  const usernameField = findFillableField(documentLike, payload.usernameSelectors)
  const passwordField = findFillableField(documentLike, payload.passwordSelectors)
  const usernameFilled = usernameField ? setFieldValue(usernameField, payload.username) : false
  const passwordFilled = passwordField ? setFieldValue(passwordField, payload.password) : false
  return { usernameFilled, passwordFilled }
}

function findFillableField(
  documentLike: Pick<Document, 'querySelector'>,
  selectors: readonly string[],
): HTMLInputElement | HTMLTextAreaElement | null {
  for (const selector of selectors) {
    try {
      const candidate = documentLike.querySelector(selector)
      if (isFillableField(candidate)) return candidate
    } catch {
      // A user supplied selector must never break the OJ page or preload.
    }
  }
  return null
}

function isFillableField(value: Element | null): value is HTMLInputElement | HTMLTextAreaElement {
  if (!value || !('value' in value)) return false
  const field = value as HTMLInputElement | HTMLTextAreaElement
  return !field.disabled && !field.readOnly && field.type !== 'hidden'
}

function setFieldValue(field: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')
    if (descriptor?.set) descriptor.set.call(field, value)
    else field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
    return field.value === value
  } catch {
    return false
  }
}

function isSelectorList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 16
    && value.every(selector => typeof selector === 'string' && selector.length > 0 && selector.length <= 512)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

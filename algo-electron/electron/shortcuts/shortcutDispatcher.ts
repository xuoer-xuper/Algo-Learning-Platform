export interface ShortcutInput {
  type: string
  key: string
  code?: string
  control?: boolean
  alt?: boolean
  meta?: boolean
  shift?: boolean
}

export type ShortcutCommand =
  | { type: 'new-tab' }
  | { type: 'close-tab' }
  | { type: 'reopen-closed-tab' }
  | { type: 'next-tab' }
  | { type: 'previous-tab' }
  | { type: 'switch-tab'; index: number }
  | { type: 'focus-address-bar' }
  | { type: 'reload' }
  | { type: 'zoom-in' }
  | { type: 'zoom-out' }
  | { type: 'reset-zoom' }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'toggle-devtools' }

export interface ShortcutActions {
  newTab: () => void
  closeTab: () => void
  reopenClosedTab: () => void
  nextTab: () => void
  previousTab: () => void
  switchTab: (index: number) => void
  focusAddressBar: () => void
  reload: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  back: () => void
  forward: () => void
  toggleDevTools: () => void
}

function keyMatches(input: ShortcutInput, ...values: string[]): boolean {
  const key = input.key.toLowerCase()
  const code = input.code?.toLowerCase()
  return values.some((value) => value === key || value === code)
}

function hasPrimaryModifier(input: ShortcutInput): boolean {
  return Boolean(input.control || input.meta)
}

/** Resolve browser shortcuts without touching Electron or renderer state. */
export function resolveShortcut(input: ShortcutInput): ShortcutCommand | null {
  if (input.type !== 'keyDown') return null

  if (!hasPrimaryModifier(input) && !input.alt) {
    if (keyMatches(input, 'f5')) return { type: 'reload' }
    if (keyMatches(input, 'f12')) return { type: 'toggle-devtools' }
  }

  if (input.alt && !hasPrimaryModifier(input)) {
    if (keyMatches(input, 'arrowleft', 'left')) return { type: 'back' }
    if (keyMatches(input, 'arrowright', 'right')) return { type: 'forward' }
  }

  if (!hasPrimaryModifier(input)) return null

  if (input.shift && keyMatches(input, 't', 'keyt')) return { type: 'reopen-closed-tab' }
  if (input.shift && keyMatches(input, 'i', 'keyi')) return { type: 'toggle-devtools' }
  if (keyMatches(input, 't', 'keyt')) return { type: 'new-tab' }
  if (keyMatches(input, 'w', 'keyw')) return { type: 'close-tab' }
  if (keyMatches(input, 'tab')) {
    return input.shift ? { type: 'previous-tab' } : { type: 'next-tab' }
  }
  if (keyMatches(input, 'l', 'keyl')) return { type: 'focus-address-bar' }
  if (keyMatches(input, 'r', 'keyr')) return { type: 'reload' }
  if (keyMatches(input, '0', 'digit0')) return { type: 'reset-zoom' }
  if (keyMatches(input, '+', '=', 'equal', 'numpadadd')) return { type: 'zoom-in' }
  if (keyMatches(input, '-', '_', 'minus', 'numpadsubtract')) return { type: 'zoom-out' }

  for (let index = 1; index <= 8; index += 1) {
    if (keyMatches(input, String(index), `digit${index}`, `numpad${index}`)) {
      return { type: 'switch-tab', index: index - 1 }
    }
  }

  return null
}

export function dispatchShortcut(command: ShortcutCommand, actions: ShortcutActions): void {
  switch (command.type) {
    case 'new-tab':
      actions.newTab()
      break
    case 'close-tab':
      actions.closeTab()
      break
    case 'reopen-closed-tab':
      actions.reopenClosedTab()
      break
    case 'next-tab':
      actions.nextTab()
      break
    case 'previous-tab':
      actions.previousTab()
      break
    case 'switch-tab':
      actions.switchTab(command.index)
      break
    case 'focus-address-bar':
      actions.focusAddressBar()
      break
    case 'reload':
      actions.reload()
      break
    case 'zoom-in':
      actions.zoomIn()
      break
    case 'zoom-out':
      actions.zoomOut()
      break
    case 'reset-zoom':
      actions.resetZoom()
      break
    case 'back':
      actions.back()
      break
    case 'forward':
      actions.forward()
      break
    case 'toggle-devtools':
      actions.toggleDevTools()
      break
  }
}

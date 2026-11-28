function hasWhitespaceOrControl(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return /\s/u.test(character) || codePoint < 32 || codePoint === 127
  })
}

export function isInternalPageId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    !hasWhitespaceOrControl(value)
  )
}

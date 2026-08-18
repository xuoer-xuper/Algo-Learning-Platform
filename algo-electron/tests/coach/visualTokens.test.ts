import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const coachPetSource = readSource('../../src/features/coach/CoachPet.tsx')
const stateSource = readSource('../../src/features/coach/petStates.ts')
const tokenSource = readSource('../../src/features/coach/styles/tokens.css')
const petCss = readSource('../../src/features/coach/styles/pet.css')
const bubbleCss = readSource('../../src/features/coach/styles/bubble.css')
const rawColor = /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/iu

describe('Coach 独立视觉 token', () => {
  it('在桌宠样式之前加载唯一 token 源', () => {
    expect(coachPetSource).toMatch(/import '.\/styles\/tokens\.css'\s+import '.\/styles\/pet\.css'/)
  })

  it('运行样式和状态配置不重复定义裸色', () => {
    for (const [name, source] of [
      ['pet.css', petCss],
      ['bubble.css', bubbleCss],
      ['petStates.ts', stateSource],
    ] as const) {
      expect(source, `${name} contains a raw color outside tokens.css`).not.toMatch(rawColor)
    }
  })

  it('六个状态均提供主色、辅色和光晕 token', () => {
    for (const state of ['idle', 'thinking', 'alert', 'celebrate', 'sleep', 'focus']) {
      for (const role of ['primary', 'accent', 'glow']) {
        const token = `--coach-pet-${state}-${role}`
        expect(tokenSource).toContain(token)
        expect(petCss).toContain(`var(${token})`)
      }
    }
  })
})

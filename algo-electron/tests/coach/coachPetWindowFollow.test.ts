import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import { CoachPetWindow } from '../../electron/coach/CoachPetWindow.ts'

test('Coach pet follows the latest shell parent and detaches before that shell closes', () => {
  resetElectronMock()
  const pet = new CoachPetWindow({
    preloadPath: 'C:\\mock-preload.cjs',
    rendererDist: 'C:\\mock-renderer',
  })
  pet.create()
  const petWindow = pet.getWin() as unknown as MockBrowserWindow
  const firstShell = new MockBrowserWindow()
  const secondShell = new MockBrowserWindow()

  pet.followWindow(firstShell as never)
  assert.strictEqual(petWindow.getParentWindow(), firstShell)
  assert.strictEqual(firstShell.listenerCount('close'), 1)

  pet.followWindow(secondShell as never)
  assert.strictEqual(petWindow.getParentWindow(), secondShell)
  assert.strictEqual(firstShell.listenerCount('close'), 0)
  assert.strictEqual(secondShell.listenerCount('close'), 1)

  secondShell.close()
  assert.strictEqual(petWindow.getParentWindow(), null)

  pet.destroy()
})

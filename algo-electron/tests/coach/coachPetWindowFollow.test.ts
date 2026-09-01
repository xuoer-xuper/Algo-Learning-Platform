import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import { CoachPetWindow } from '../../electron/coach/CoachPetWindow.ts'

/**
 * 桌宠归属与置顶策略在真实窗口对象上的落地（B5.5 / D30）。
 *
 * 策略判定本身在 `petPinPolicy.test.ts` 钉；本文件只管一件事：
 * CoachPetWindow 有没有把判定真的设到 BrowserWindow 上，以及四条入口
 * （create / 切壳 / 焦点变化 / 改模式）是否都会重算。
 *
 * 替身的默认配置路径（`C:\mock-user-data\config.json`）不存在，
 * 因此 `loadCoachConfig()` 返回默认值，`create()` 起点恒为 follow 档。
 */

function createPet(): { pet: CoachPetWindow; petWindow: MockBrowserWindow } {
  const pet = new CoachPetWindow({
    preloadPath: 'C:\\mock-preload.cjs',
    rendererDist: 'C:\\mock-renderer',
  })
  pet.create()
  return { pet, petWindow: pet.getWin() as unknown as MockBrowserWindow }
}

/** 新建一个已聚焦的壳替身：WindowManager 是在 focus 事件里认"最近活跃"的 */
function focusedShell(): MockBrowserWindow {
  const shell = new MockBrowserWindow()
  shell.focus()
  return shell
}

test('Coach pet follows the latest shell parent and detaches before that shell closes', () => {
  resetElectronMock()
  const { pet, petWindow } = createPet()
  const firstShell = focusedShell()
  const secondShell = focusedShell()

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

describe('桌宠置顶策略三模式', () => {
  test('默认起点是 follow：桌宠不置顶', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    assert.strictEqual(pet.getPinMode(), 'follow')
    assert.strictEqual(petWindow.isAlwaysOnTop(), false)
    pet.destroy()
  })

  test('follow：壳失焦即解绑 parent，重新聚焦即恢复，全程不置顶', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()

    pet.followWindow(shell as never)
    assert.strictEqual(petWindow.getParentWindow(), shell)

    // 弹原生右键菜单/文件对话框会把焦点从壳上拿走，桌宠必须退回普通 z 序
    shell.blur()
    assert.strictEqual(petWindow.getParentWindow(), null)
    assert.strictEqual(petWindow.isAlwaysOnTop(), false)

    shell.focus()
    assert.strictEqual(petWindow.getParentWindow(), shell)
    assert.strictEqual(petWindow.isAlwaysOnTop(), false)

    pet.destroy()
  })

  test('follow：绑定未聚焦的壳时不立即抬升，等它真正聚焦', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const background = new MockBrowserWindow()

    pet.followWindow(background as never)
    assert.strictEqual(petWindow.getParentWindow(), null)

    background.focus()
    assert.strictEqual(petWindow.getParentWindow(), background)

    pet.destroy()
  })

  test('always：切过去立刻全局置顶且解绑 parent，level 为 floating', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()
    pet.followWindow(shell as never)
    assert.strictEqual(petWindow.getParentWindow(), shell)

    pet.setPinMode('always')
    assert.strictEqual(petWindow.isAlwaysOnTop(), true)
    assert.strictEqual(petWindow.getAlwaysOnTopLevel(), 'floating')
    assert.strictEqual(petWindow.getParentWindow(), null)

    // 全局置顶不受壳焦点影响——失焦也仍然置顶
    shell.blur()
    assert.strictEqual(petWindow.isAlwaysOnTop(), true)

    pet.destroy()
  })

  test('dock：既不置顶也不绑 parent，壳聚焦也不抬升', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()
    pet.followWindow(shell as never)

    pet.setPinMode('dock')
    assert.strictEqual(petWindow.isAlwaysOnTop(), false)
    assert.strictEqual(petWindow.getParentWindow(), null)

    shell.blur()
    shell.focus()
    assert.strictEqual(petWindow.getParentWindow(), null)

    pet.destroy()
  })

  test('always 切回 follow 时撤销置顶并重新绑回聚焦中的壳', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()
    pet.followWindow(shell as never)

    pet.setPinMode('always')
    assert.strictEqual(petWindow.isAlwaysOnTop(), true)

    pet.setPinMode('follow')
    assert.strictEqual(petWindow.isAlwaysOnTop(), false)
    assert.strictEqual(petWindow.getAlwaysOnTopLevel(), 'normal')
    assert.strictEqual(petWindow.getParentWindow(), shell)

    pet.destroy()
  })

  test('非法模式被拒在 setPinMode，不改动窗口', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()
    pet.followWindow(shell as never)

    pet.setPinMode('pinned' as never)
    assert.strictEqual(pet.getPinMode(), 'follow')
    assert.strictEqual(petWindow.isAlwaysOnTop(), false)
    assert.strictEqual(petWindow.getParentWindow(), shell)

    pet.destroy()
  })

  test('切壳时解绑旧壳的焦点监听，旧壳后续 focus 不再影响桌宠', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const firstShell = focusedShell()
    const secondShell = focusedShell()

    pet.followWindow(firstShell as never)
    pet.followWindow(secondShell as never)
    assert.strictEqual(firstShell.listenerCount('focus'), 0)
    assert.strictEqual(firstShell.listenerCount('blur'), 0)
    assert.strictEqual(secondShell.listenerCount('focus'), 1)
    assert.strictEqual(secondShell.listenerCount('blur'), 1)

    // 旧壳再聚焦不该把 parent 抢回去
    firstShell.blur()
    firstShell.focus()
    assert.strictEqual(petWindow.getParentWindow(), secondShell)

    pet.destroy()
  })

  test('销毁后不再持有壳的任何监听', () => {
    resetElectronMock()
    const { pet } = createPet()
    const shell = focusedShell()
    pet.followWindow(shell as never)

    pet.destroy()
    assert.strictEqual(shell.listenerCount('close'), 0)
    assert.strictEqual(shell.listenerCount('focus'), 0)
    assert.strictEqual(shell.listenerCount('blur'), 0)
  })
})

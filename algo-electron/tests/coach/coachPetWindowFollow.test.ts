import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'
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
 *
 * 失焦解绑是**延后复核**的（`BLUR_DETACH_VERIFY_MS`），所以凡是断言"失焦后
 * 退回普通 z 序"的用例都必须先推进定时器。这不是测试的实现细节泄漏，而是
 * 被测行为本身：立即解绑会与 `setParentWindow` 的扰焦首尾相接形成振荡。
 */

/** 与 CoachPetWindow.BLUR_DETACH_VERIFY_MS 同步；推进量取其两倍留余量 */
const BLUR_VERIFY_ADVANCE_MS = 240

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

/** 让待复核的失焦解绑真正落地 */
function settleBlur(): void {
  vi.advanceTimersByTime(BLUR_VERIFY_ADVANCE_MS)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

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
  test('默认起点是 follow：无壳时桌宠置顶保持可见', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    assert.strictEqual(pet.getPinMode(), 'follow')
    // follow 模式下无活跃壳时开启置顶，防止桌宠沉底消失
    assert.strictEqual(petWindow.isAlwaysOnTop(), true)
    pet.destroy()
  })

  test('follow：壳持续失焦后解绑 parent 并临时置顶，重新聚焦即恢复绑定并撤销置顶', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()

    pet.followWindow(shell as never)
    // 推进 applyPinDecision 的 50ms 屏蔽期
    vi.advanceTimersByTime(50)
    assert.strictEqual(petWindow.getParentWindow(), shell)
    assert.strictEqual(petWindow.isAlwaysOnTop(), false)

    // 弹原生右键菜单/文件对话框会把焦点从壳上拿走，桌宠必须退回普通 z 序。
    // 解绑延后复核，所以要等过了复核窗口才成立
    shell.blur()
    settleBlur()
    // 再推进 applyPinDecision 的 50ms 屏蔽期
    vi.advanceTimersByTime(50)
    assert.strictEqual(petWindow.getParentWindow(), null)
    // 壳失焦时临时置顶，防止桌宠沉底被其他应用遮挡
    assert.strictEqual(petWindow.isAlwaysOnTop(), true)

    shell.focus()
    // 再推进 applyPinDecision 的 50ms 屏蔽期
    vi.advanceTimersByTime(50)
    assert.strictEqual(petWindow.getParentWindow(), shell)
    // 壳重新聚焦后撤销置顶，通过父子关系自然浮在壳上
    assert.strictEqual(petWindow.isAlwaysOnTop(), false)

    pet.destroy()
  })

  test('follow：瞬时失焦立刻复焦不解绑——setParentWindow 自己扰出的焦点抖动被吃掉', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()

    pet.followWindow(shell as never)
    assert.strictEqual(petWindow.getParentWindow(), shell)
    const settledCount = petWindow.parentWindowSetCount

    // 真机上 setParentWindow 改 owner 会扰动焦点，壳因此收到一对 blur/focus。
    // 若立即解绑，这一对就会与解绑再次扰焦首尾相接，桌宠在两个 z 序间持续振荡。
    shell.blur()
    shell.focus()
    settleBlur()

    assert.strictEqual(petWindow.getParentWindow(), shell)
    // 关键断言：全程一次都没再碰 setParentWindow
    assert.strictEqual(petWindow.parentWindowSetCount, settledCount)

    pet.destroy()
  })

  test('follow：反复抖动收敛，不会每次抖动都重设 owner', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()

    pet.followWindow(shell as never)
    const settledCount = petWindow.parentWindowSetCount

    for (let i = 0; i < 20; i += 1) {
      shell.blur()
      shell.focus()
      vi.advanceTimersByTime(16)
    }
    settleBlur()

    assert.strictEqual(petWindow.getParentWindow(), shell)
    assert.strictEqual(petWindow.parentWindowSetCount, settledCount)

    pet.destroy()
  })

  test('follow：重复的同结论重算不碰 Electron API', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()

    pet.followWindow(shell as never)
    const settledCount = petWindow.parentWindowSetCount

    // 同一个壳重复 follow，以及已聚焦的壳再收 focus，都不该重设
    pet.followWindow(shell as never)
    shell.focus()
    shell.focus()
    assert.strictEqual(petWindow.parentWindowSetCount, settledCount)

    pet.destroy()
  })

  test('follow：绑定未聚焦的壳时不立即绑定 parent，但开启置顶保持可见，等壳聚焦后才绑定并撤销置顶', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const background = new MockBrowserWindow()

    pet.followWindow(background as never)
    // 推进 applyPinDecision 的 50ms 屏蔽期
    vi.advanceTimersByTime(50)
    assert.strictEqual(petWindow.getParentWindow(), null)
    assert.strictEqual(petWindow.isAlwaysOnTop(), true)

    background.focus()
    // 再推进 applyPinDecision 的 50ms 屏蔽期
    vi.advanceTimersByTime(50)
    assert.strictEqual(petWindow.getParentWindow(), background)
    assert.strictEqual(petWindow.isAlwaysOnTop(), false)

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
    settleBlur()
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
    settleBlur()
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
    settleBlur()
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

  test('销毁时撤销待复核的失焦，定时器不活过窗口', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const shell = focusedShell()
    pet.followWindow(shell as never)

    shell.blur()
    pet.destroy()
    // 定时器若活着，回调会碰已销毁的窗口
    assert.doesNotThrow(() => settleBlur())
    assert.strictEqual(petWindow.isDestroyed(), true)
  })

  test('换壳撤销旧壳的失焦复核，不让它读新壳的焦点做判定', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    const firstShell = focusedShell()
    pet.followWindow(firstShell as never)

    // 旧壳失焦（复核在途）→ 立刻换到新壳
    firstShell.blur()
    const secondShell = focusedShell()
    pet.followWindow(secondShell as never)

    // 在途的旧复核不该把刚绑好的新壳解绑
    settleBlur()
    assert.strictEqual(petWindow.getParentWindow(), secondShell)

    pet.destroy()
  })
})

describe('桌宠点击穿透', () => {
  test('相同穿透状态不重设命中测试——重设会打断进行中的鼠标捕获', () => {
    resetElectronMock()
    const { pet, petWindow } = createPet()
    // create() 调用了 setIgnoreMouseEvents(true)，启动了 16ms 防抖计时器
    // 推进计时器让它完成
    vi.advanceTimersByTime(16)
    const afterCreate = petWindow.ignoreMouseEventsSetCount

    // 设 true：与当前值相同，CoachPetWindow 的 applyIgnoreMouseEvents 去重检查跳过
    // 但仍会启动 16ms 防抖计时器（虽然不会调用 Mock 的 setIgnoreMouseEvents）
    pet.setIgnoreMouseEvents(true)
    assert.strictEqual(petWindow.ignoreMouseEventsSetCount, afterCreate)
    // 推进防抖计时器
    vi.advanceTimersByTime(16)

    // 设 false：值变了 (true -> false)，立即调用 applyIgnoreMouseEvents
    // 去重检查通过，调用 win.setIgnoreMouseEvents，计数 +1
    pet.setIgnoreMouseEvents(false)
    assert.strictEqual(petWindow.ignoreMouseEventsSetCount, afterCreate + 1)

    // 再次设 false：防抖计时器还在运行中，直接返回，不调用 applyIgnoreMouseEvents
    pet.setIgnoreMouseEvents(false)
    assert.strictEqual(petWindow.ignoreMouseEventsSetCount, afterCreate + 1)

    // 推进 16ms 防抖计时器
    // pendingIgnoreMouseEvents (false) === lastIgnoreMouseEvents (false)
    // applyIgnoreMouseEvents 内部去重检查会跳过，不调用 win.setIgnoreMouseEvents
    vi.advanceTimersByTime(16)
    assert.strictEqual(petWindow.ignoreMouseEventsSetCount, afterCreate + 1)

    pet.destroy()
  })
})

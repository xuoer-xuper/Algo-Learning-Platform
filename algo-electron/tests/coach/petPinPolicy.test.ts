import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import {
  COACH_PIN_MODES,
  DEFAULT_COACH_PIN_MODE,
  normalizeCoachPinMode,
  resolvePetPinDecision,
  type CoachPinMode,
} from '../../electron/coach/petPinPolicy.ts'

/**
 * 桌宠置顶策略的纯逻辑（B5.5 / D30）。不碰 electron，直接在 node 环境跑。
 *
 * 这里钉住的是三档模式各自的承重结论，不是实现细节：
 * - follow 在壳聚焦时绑定为子窗口且不置顶（通过父子关系自然浮在壳上）
 * - follow 在壳失焦时解绑 parent 并临时置顶（原生菜单/模态弹出时不压住它们，同时防止桌宠沉底）
 * - follow 无活跃壳时不绑定但置顶（保持可见）
 * - always 是唯一会全局置顶的一档，且必须显式选择才能到达
 * - dock 既不置顶也不绑 parent
 */

const decide = (
  mode: CoachPinMode,
  hasActiveShell: boolean,
  activeShellFocused: boolean,
) => resolvePetPinDecision({ mode, hasActiveShell, activeShellFocused })

describe('resolvePetPinDecision', () => {
  test('follow 绑到聚焦中的活跃壳，且从不置顶', () => {
    const decision = decide('follow', true, true)
    assert.deepEqual(decision, {
      alwaysOnTop: false,
      level: 'normal',
      attachToActiveShell: true,
    })
  })

  test('follow 在壳失焦时解绑 parent 并临时置顶——原生菜单与原生模态就是靠解绑不被盖住，置顶防止桌宠沉底', () => {
    assert.strictEqual(decide('follow', true, false).attachToActiveShell, false)
    // 解绑后临时置顶，防止桌宠沉底被其他应用遮挡
    assert.strictEqual(decide('follow', true, false).alwaysOnTop, true)
  })

  test('follow 没有活跃壳时不绑 parent 但置顶保持可见', () => {
    assert.strictEqual(decide('follow', false, true).attachToActiveShell, false)
    assert.strictEqual(decide('follow', false, true).alwaysOnTop, true)
    assert.strictEqual(decide('follow', false, false).attachToActiveShell, false)
    assert.strictEqual(decide('follow', false, false).alwaysOnTop, true)
  })

  test('always 全局置顶且不依赖壳，level 为 floating', () => {
    for (const hasShell of [true, false]) {
      for (const focused of [true, false]) {
        assert.deepEqual(decide('always', hasShell, focused), {
          alwaysOnTop: true,
          level: 'floating',
          attachToActiveShell: false,
        })
      }
    }
  })

  test('dock 既不置顶也不绑 parent，与壳的存活/焦点无关', () => {
    for (const hasShell of [true, false]) {
      for (const focused of [true, false]) {
        assert.deepEqual(decide('dock', hasShell, focused), {
          alwaysOnTop: false,
          level: 'normal',
          attachToActiveShell: false,
        })
      }
    }
  })

  test('always 是三档里唯一会置顶的一档', () => {
    const topmost = COACH_PIN_MODES.filter((mode) => decide(mode, true, true).alwaysOnTop)
    assert.deepEqual(topmost, ['always'])
  })

  test('默认档是 follow，且默认档不置顶', () => {
    assert.strictEqual(DEFAULT_COACH_PIN_MODE, 'follow')
    assert.strictEqual(decide(DEFAULT_COACH_PIN_MODE, true, true).alwaysOnTop, false)
  })
})

describe('normalizeCoachPinMode', () => {
  test('三个合法值原样返回', () => {
    for (const mode of COACH_PIN_MODES) {
      assert.strictEqual(normalizeCoachPinMode(mode), mode)
    }
  })

  test('非法值一律落回 follow——手改 config.json 不能把桌宠推到置顶档', () => {
    for (const bad of [undefined, null, '', 'ALWAYS', 'pinned', 0, 1, true, {}, ['follow']]) {
      assert.strictEqual(normalizeCoachPinMode(bad), 'follow')
    }
  })
})

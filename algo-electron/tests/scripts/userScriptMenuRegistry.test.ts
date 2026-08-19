import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { UserScriptMenuRegistry } from '../../electron/scripts/UserScriptMenuRegistry'

test('isolates commands by webContents and active port lifecycle', () => {
  const registry = new UserScriptMenuRegistry()
  const invoke = vi.fn()
  assert.strictEqual(registry.register({
    portId: 'port-1', webContentsId: 10, scriptId: 'script-1', scriptName: 'Helper', commandId: 'menu-1', name: 'Refresh', invoke,
  }), true)
  registry.register({
    portId: 'port-2', webContentsId: 20, scriptId: 'script-2', scriptName: 'Other', commandId: 'menu-1', name: 'Open', invoke: vi.fn(),
  })

  const commands = registry.getForWebContents(10)
  assert.deepStrictEqual(commands.map(command => [command.scriptName, command.name]), [['Helper', 'Refresh']])
  commands[0].invoke()
  assert.strictEqual(invoke.mock.calls.length, 1)
  registry.clearPort('port-1')
  assert.deepStrictEqual(registry.getForWebContents(10), [])
  assert.strictEqual(registry.getForWebContents(20).length, 1)
})

test('updates duplicate command ids and caps registrations per port', () => {
  const registry = new UserScriptMenuRegistry()
  for (let index = 0; index < 32; index += 1) {
    assert.strictEqual(registry.register({
      portId: 'port-1', webContentsId: 10, scriptId: 'script-1', scriptName: 'Helper', commandId: `menu-${index}`, name: `Item ${index}`, invoke: vi.fn(),
    }), true)
  }
  assert.strictEqual(registry.register({
    portId: 'port-1', webContentsId: 10, scriptId: 'script-1', scriptName: 'Helper', commandId: 'overflow', name: 'Overflow', invoke: vi.fn(),
  }), false)
  assert.strictEqual(registry.register({
    portId: 'port-1', webContentsId: 10, scriptId: 'script-1', scriptName: 'Helper', commandId: 'menu-0', name: 'Updated', invoke: vi.fn(),
  }), true)
  assert.strictEqual(registry.getForWebContents(10)[0].name, 'Updated')
})

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { IpcPayloadError, parseIpcArgs } from '../../electron/ipc/ipcPayload'
import {
  deleteInput,
  getByIdInput,
  toggleInput,
  createInput,
  confirmImportInput,
} from '../../src/shared/types/ipc/sites'
import {
  getDailyActiveInput,
  getProblemVisitStatsInput,
  getUnreviewedInput,
  recomputeDailyInput,
} from '../../src/shared/types/ipc/stats'
import {
  saveConfigInput,
  saveLlmConfigInput,
  setPetStateInput,
  testLlmConnectionInput,
} from '../../src/shared/types/ipc/coach'
import {
  omniboxSuggestInput,
  setSidebarWidthInput,
  showShellContextMenuInput,
  tabCreateInput,
  tabOpenInternalInput,
} from '../../src/shared/types/ipc/browser'
import { autofillRespondInput, captureRespondInput } from '../../src/shared/types/ipc/credentials'
import { saveImageInput } from '../../src/shared/types/ipc/notes'
import { listRecentInput } from '../../src/shared/types/ipc/problem'
import { bindHandleInput } from '../../src/shared/types/ipc/rating'
import { saveInput as scriptSaveInput } from '../../src/shared/types/ipc/scripts'
import { updateOutputInput } from '../../src/shared/types/ipc/ai'
import { setSearchEngineInput } from '../../src/shared/types/ipc/config'

/**
 * 域 schema（`src/shared/types/ipc/`）与解析层（`electron/ipc/ipcPayload.ts`）的单元测试。
 *
 * 这一层的价值全在拒绝分支上，所以每类边界都成对写：一条证明合法值原样通过，
 * 一条证明非法值抛 `IpcPayloadError`。只写正向的话，把解析改成 `value => value`
 * 也能全绿。用例按旧组合子的等价关系组织（text/int/oneOf/arrayOf/object.strict/…），
 * schema 全部取自各域真实导出——测的不是拼出来的示例，而是注册处实际挂的东西。
 */

/** 断言 parseIpcArgs 抛的是载荷错误，并返回它——便于继续检查 path/expected。 */
function rejects(tuple: readonly unknown[], args: readonly unknown[]): IpcPayloadError {
  try {
    parseIpcArgs('test:ch', tuple as never, args)
  } catch (error) {
    assert.ok(error instanceof IpcPayloadError, `expected IpcPayloadError, got ${String(error)}`)
    return error
  }
  throw new assert.AssertionError({ message: 'expected the schema to reject this value' })
}

describe('标识符（旧 text()：非空、上限 200）', () => {
  test('接受非空、界内的字符串', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', getProblemVisitStatsInput, ['problem-1']), [
      'problem-1',
    ])
  })

  test('拒绝空串、超长和非字符串', () => {
    rejects(getProblemVisitStatsInput, [''])
    rejects(getProblemVisitStatsInput, ['a'.repeat(201)])
    rejects(getProblemVisitStatsInput, [42])
    rejects(getProblemVisitStatsInput, [null])
    rejects(getProblemVisitStatsInput, [undefined])
  })

  test('错误信息不含字符串内容本身', () => {
    // 载荷可能是笔记正文或搜索词，属于用户数据，不该进日志。
    const error = rejects(getProblemVisitStatsInput, ['a'.repeat(201) + 'secret-note-body'])
    assert.strictEqual(error.message.includes('secret'), false)
  })
})

describe('整数界（旧 int()：进 LIMIT 与日期偏移的数字）', () => {
  test('接受界内整数与 optional 的"没传"', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', getDailyActiveInput, [30]), [30])
    assert.deepStrictEqual(parseIpcArgs('ch', getDailyActiveInput, [1]), [1])
    assert.deepStrictEqual(parseIpcArgs('ch', getDailyActiveInput, [3650]), [3650])
    assert.deepStrictEqual(parseIpcArgs('ch', getDailyActiveInput, []), [undefined])
  })

  test('拒绝小数、越界、NaN、Infinity 和数字字符串', () => {
    rejects(getDailyActiveInput, [1.5])
    rejects(getDailyActiveInput, [0])
    rejects(getDailyActiveInput, [3651])
    rejects(getDailyActiveInput, [Number.NaN])
    rejects(getDailyActiveInput, [Number.POSITIVE_INFINITY])
    // 这条是本层存在的理由：`'30'` 过得去 `checkIpcPayload`，进 `localDateDaysAgo`
    // 也能算出正确日期，但 `'abc'` 会算出 'NaN-NaN-NaN' 绑进 SQL、查不到任何行。
    // 与其分辨哪些字符串恰好能用，不如一律拒绝。
    rejects(getDailyActiveInput, ['30'])
  })

  test('对象字段各自校验，错误路径带字段名', () => {
    const error = rejects(getUnreviewedInput, [{ days: 0, limit: 20 }])
    assert.strictEqual(error.path, 'arg0.days')
    assert.strictEqual(rejects(getUnreviewedInput, [{ days: 30, limit: 0 }]).path, 'arg0.limit')
    assert.deepStrictEqual(parseIpcArgs('ch', getUnreviewedInput, [{ days: 30, limit: 20 }]), [
      { days: 30, limit: 20 },
    ])
  })
})

describe('小数界（旧 decimal()：缩放、透明度、屏幕坐标）', () => {
  test('接受界内小数与端点，拒绝越界和 NaN', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', setSidebarWidthInput, [0]), [0])
    assert.deepStrictEqual(parseIpcArgs('ch', setSidebarWidthInput, [2000]), [2000])
    rejects(setSidebarWidthInput, [-1])
    rejects(setSidebarWidthInput, [2001])
    rejects(setSidebarWidthInput, [Number.NaN])
    rejects(setSidebarWidthInput, [1.5])
  })
})

describe('布尔（旧 bool：不接受 0/1 等价物）', () => {
  test('只接受真正的布尔值', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', toggleInput, [{ id: 'site-1', enabled: true }]), [
      { id: 'site-1', enabled: true },
    ])
    assert.deepStrictEqual(parseIpcArgs('ch', toggleInput, [{ id: 'site-1', enabled: false }]), [
      { id: 'site-1', enabled: false },
    ])
    for (const value of [0, 1, 'true', 'false', null, undefined, {}]) {
      rejects(toggleInput, [{ id: 'site-1', enabled: value }])
    }
  })
})

describe('字面量联合（旧 oneOf → z.enum）', () => {
  test('接受列出的字面量，拒绝其他', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', setPetStateInput, ['idle']), ['idle'])
    rejects(setPetStateInput, ['running'])
    rejects(setPetStateInput, ['Idle'])
    rejects(setPetStateInput, [0])
  })

  test('枚举复用 electron 侧的 as const 数组（主题、搜索引擎）', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', showShellContextMenuInput, ['omnibox']), ['omnibox'])
    rejects(showShellContextMenuInput, ['menu'])
  })
})

describe('optional 与 nullable 的区分', () => {
  test('optional 只放过 undefined，nullable 只放过 null', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', recomputeDailyInput, []), [undefined])
    rejects(recomputeDailyInput, [null])
    assert.deepStrictEqual(
      parseIpcArgs('ch', autofillRespondInput, [{ requestId: 'req-1', credentialId: null }]),
      [{ requestId: 'req-1', credentialId: null }],
    )
    rejects(autofillRespondInput, [{ requestId: 'req-1', credentialId: undefined }])
  })

  test('内层校验仍然生效', () => {
    rejects(recomputeDailyInput, ['2026-1-2'])
    rejects(recomputeDailyInput, ['not-a-date'])
    rejects(autofillRespondInput, [{ requestId: 'req-1', credentialId: '' }])
  })
})

describe('本地日期（旧 localDate：yyyy-mm-dd 正则）', () => {
  test('接受 yyyy-mm-dd，拒绝其他形状', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', recomputeDailyInput, ['2026-01-02']), ['2026-01-02'])
    rejects(recomputeDailyInput, ['2026-1-2'])
    rejects(recomputeDailyInput, ['2026-01-02T00:00:00Z'])
    rejects(recomputeDailyInput, [42])
  })
})

describe('非空白标识符（旧 pattern 的 /\\S/：纯空白要拒）', () => {
  test('接受含非空白字符的 id，拒绝纯空白', () => {
    assert.deepStrictEqual(
      parseIpcArgs('ch', scriptSaveInput, [
        { id: 'a b', data: { name: 'n', site_ids_json: '["s1"]' } },
      ]),
      [{ id: 'a b', data: { name: 'n', site_ids_json: '["s1"]' } }],
    )
    rejects(scriptSaveInput, [{ id: '   ', data: { name: 'n', site_ids_json: '["s1"]' } }])
    rejects(scriptSaveInput, [
      { id: 'a'.repeat(201), data: { name: 'n', site_ids_json: '["s1"]' } },
    ])
    rejects(scriptSaveInput, [{ id: 'a', data: { name: '  ', site_ids_json: '["s1"]' } }])
  })
})

describe('数组（旧 arrayOf：元素逐个校验、长度界）', () => {
  test('domains 有下限 1：空数组恒为假会把站点变成"显示已启用、永远匹配不上"', () => {
    const domains = ['example.com']
    const draft = {
      id: 'site-1',
      name: 'Example',
      domains,
      homeUrl: 'https://example.com',
      enabled: true,
    }
    assert.deepStrictEqual(parseIpcArgs('ch', createInput, [draft]), [draft])
    rejects(createInput, [{ ...draft, domains: [] }])
    rejects(createInput, [{ ...draft, domains: ['a'.repeat(254)] }])
    rejects(createInput, [{ ...draft, domains: 'example.com' }])
  })

  test('无下限的数组（patterns/selectors）空着就是"没有"', () => {
    const draft = {
      id: 'site-1',
      name: 'Example',
      domains: ['example.com'],
      homeUrl: 'https://example.com',
      enabled: true,
      problemUrlPatterns: [],
    }
    assert.deepStrictEqual(parseIpcArgs('ch', createInput, [draft]), [draft])
  })

  test('导入数组上限 50 条，overwriteIds 同界', () => {
    const entry = {
      id: 'site-1',
      name: 'Example',
      domains: ['example.com'],
      homeUrl: 'https://example.com',
      enabled: true,
      isBuiltin: false,
    }
    assert.deepStrictEqual(
      parseIpcArgs('ch', confirmImportInput, [{ sites: [entry], overwriteIds: [] }]),
      [{ sites: [entry], overwriteIds: [] }],
    )
    rejects(confirmImportInput, [
      { sites: Array.from({ length: 51 }, () => entry), overwriteIds: [] },
    ])
    rejects(confirmImportInput, [
      { sites: [entry], overwriteIds: Array.from({ length: 51 }, () => 'site-1') },
    ])
  })
})

describe('strict 对象（旧 object 默认拒绝多余字段）', () => {
  test('拒绝未声明的字段，字段名在错误信息里', () => {
    const draft = {
      id: 'site-1',
      name: 'Example',
      domains: ['example.com'],
      homeUrl: 'https://example.com',
      enabled: true,
      bogus: 1,
    }
    const error = rejects(createInput, [draft])
    assert.strictEqual(error.message.includes('bogus'), true)
  })

  test('isBuiltin 不在 create 形状里：渲染进程不能把自建站点标成内置站点', () => {
    const draft = {
      id: 'site-1',
      name: 'Example',
      domains: ['example.com'],
      homeUrl: 'https://example.com',
      enabled: true,
      isBuiltin: true,
    }
    rejects(createInput, [draft])
  })

  test('拒绝数组、null 和非对象', () => {
    for (const value of [null, [], 'x', 42]) rejects(createInput, [value])
  })

  test('缺省的 optional 字段不写进结果', () => {
    const [parsed] = parseIpcArgs('ch', createInput, [
      {
        id: 'site-1',
        name: 'Example',
        domains: ['example.com'],
        homeUrl: 'https://example.com',
        enabled: true,
      },
    ]) as [Record<string, unknown>]
    assert.strictEqual(Object.hasOwn(parsed, 'cookiePolicy'), false)
  })
})

describe('coach 白名单（写路径的唯一闸门）', () => {
  const sixFields = {
    enabled: true,
    sound: false,
    bubbleFrequency: 'low',
    scale: 1,
    opacity: 0.8,
    pinMode: 'follow',
  }

  test('coach:saveConfig 只收 CoachPanel 真会发的 6 个字段', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', saveConfigInput, [sixFields]), [sixFields])
  })

  test('第 7 个字段（position / llm）被拒：saveCoachConfig 是深合并，多余字段就是写路径', () => {
    rejects(saveConfigInput, [{ ...sixFields, position: { x: 1, y: 2 } }])
    rejects(saveConfigInput, [{ ...sixFields, llm: { encrypted_api_key: 'x' } }])
  })

  test('coach:saveLlmConfig 白名单 3 项；encrypted_api_key 不能从 renderer 进来', () => {
    const partial = { base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', enabled: true }
    assert.deepStrictEqual(parseIpcArgs('ch', saveLlmConfigInput, [partial]), [partial])
    rejects(saveLlmConfigInput, [{ encrypted_api_key: 'x' }])
    rejects(saveLlmConfigInput, [{ base_url: 'x'.repeat(4097) }])
    // 空串被拒是既有 fail-closed 行为：面板的 Base URL 输入框没有本地校验、onBlur 原样
    // 发送，清空后失焦就会发 ''——而主进程读路径 `base_url ?? DEFAULT` 不拦 ''，
    // 存进去会把空串带到 LLM 客户端。拒绝让面板显示"保存失败"，配置保持原值。
    rejects(saveLlmConfigInput, [{ base_url: '' }])
  })

  test('coach:testLlmConnection 允许空 api_key（用已保存的 Key 测）', () => {
    const config = { api_key: '', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
    assert.deepStrictEqual(parseIpcArgs('ch', testLlmConnectionInput, [config]), [config])
    rejects(testLlmConnectionInput, [{ ...config, base_url: '' }])
  })
})

describe('二进制（旧 binary：ArrayBuffer | Uint8Array 都收）', () => {
  test('接受 ArrayBuffer 与 Uint8Array，拒绝其他类型', () => {
    // 唯一产出方 MilkdownEditor 走 `file.arrayBuffer()`，preload 原样透传、
    // 结构化克隆把 ArrayBuffer 原样送达主进程——旧 binary() 正是按这两种类型判的。
    const buffer = new ArrayBuffer(8)
    const args = { noteId: 'note-1', fileName: '', mimeType: 'image/png', data: buffer }
    assert.deepStrictEqual(parseIpcArgs('ch', saveImageInput, [args]), [args])
    const view = new Uint8Array([1, 2, 3])
    const viewArgs = { noteId: 'note-1', fileName: '', mimeType: 'image/png', data: view }
    assert.deepStrictEqual(parseIpcArgs('ch', saveImageInput, [viewArgs]), [viewArgs])
    // 体积上限由 checkIpcPayload 的 16 MiB 兜住（见 src/shared/types/ipc/notes.ts 的说明）。
    rejects(saveImageInput, [{ ...args, data: 'not-binary' }])
    rejects(saveImageInput, [{ ...args, data: null }])
  })
})

describe('显式放行（旧 raw() → z.unknown()，棘轮封顶 4 处）', () => {
  test('原样通过；判别校验在 handler 里（isInternalPage 等）', () => {
    const page = { type: 'history' }
    assert.deepStrictEqual(parseIpcArgs('ch', tabOpenInternalInput, [page]), [page])
    assert.deepStrictEqual(parseIpcArgs('ch', tabOpenInternalInput, ['garbage']), ['garbage'])
  })
})

describe('自由文本与 URL 上限（4096 口径、允许空串）', () => {
  test('tab:create 的 url 可缺省、可空串，超长拒绝', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', tabCreateInput, []), [undefined])
    assert.deepStrictEqual(parseIpcArgs('ch', tabCreateInput, ['']), [''])
    assert.deepStrictEqual(parseIpcArgs('ch', tabCreateInput, ['https://example.com']), [
      'https://example.com',
    ])
    rejects(tabCreateInput, ['a'.repeat(4097)])
  })

  test('omniboxSuggest 允许空串（地址栏清空时前端会拉一次空建议）', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', omniboxSuggestInput, ['']), [''])
    rejects(omniboxSuggestInput, ['a'.repeat(257)])
  })
})

describe('按位置解析与实参个数（ipcPayload.parseIpcArgs）', () => {
  test('错误路径带参数序号与 channel', () => {
    const error = rejects(getUnreviewedInput, [{ days: 'abc', limit: 20 }])
    assert.strictEqual(error.path, 'arg0.days')
    assert.strictEqual(error.name, 'IpcPayloadError')
  })

  test('实参多于 schema 时拒绝', () => {
    // preload 侧调用点是逐个写死的，个数对不上只可能是两边改动没同步。
    const error = rejects(getProblemVisitStatsInput, ['id-1', 'extra'])
    assert.strictEqual(error.expected, 'at most 1 arguments')
  })

  test('单参数标识符元组（sites:getById）按位校验', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', getByIdInput, ['site-1']), ['site-1'])
  })
})

describe('FQDN 与 handle 的既有上限', () => {
  test('rating 平台收成闭集，handle 64', () => {
    assert.deepStrictEqual(
      parseIpcArgs('ch', bindHandleInput, [{ platform: 'codeforces', handle: 'user-1' }]),
      [{ platform: 'codeforces', handle: 'user-1' }],
    )
    rejects(bindHandleInput, [{ platform: 'leetcode', handle: 'user-1' }])
    rejects(bindHandleInput, [{ platform: 'codeforces', handle: '' }])
    rejects(bindHandleInput, [{ platform: 'codeforces', handle: 'a'.repeat(65) }])
  })

  test('搜索引擎形状：engine 闭集 + customTemplate 可空', () => {
    assert.deepStrictEqual(
      parseIpcArgs('ch', setSearchEngineInput, [{ engine: 'bing', customTemplate: null }]),
      [{ engine: 'bing', customTemplate: null }],
    )
    rejects(setSearchEngineInput, [{ engine: 'duckduckgo', customTemplate: null }])
    rejects(setSearchEngineInput, [{ engine: 'bing', customTemplate: undefined }])
  })
})

describe('ai:updateOutput（Partial + nullable 的组合）', () => {
  test('"没传"与"清空这一列"是两件事', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', updateOutputInput, [{ id: 'out-1', updates: {} }]), [
      { id: 'out-1', updates: {} },
    ])
    assert.deepStrictEqual(
      parseIpcArgs('ch', updateOutputInput, [{ id: 'out-1', updates: { title: null } }]),
      [{ id: 'out-1', updates: { title: null } }],
    )
    rejects(updateOutputInput, [{ id: 'out-1', updates: { title: '' } }])
    rejects(updateOutputInput, [{ id: 'out-1', updates: { content: null } }])
  })
})

describe('delete/get 类单参数 channel 共用标识符界', () => {
  test('拒绝空串与非字符串', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', deleteInput, ['site-1']), ['site-1'])
    rejects(deleteInput, [''])
    rejects(deleteInput, [42])
  })
})

/*
 * R3 把多参数 invoke 收成单对象后，这两条转换通道的形状断言不能只靠
 * register*Ipc 的接线测试兜底——schema 本体的接受/拒绝分支在这里成对钉住，
 * 与文件里其余通道同口径（对象形状原样通过 + 各界逐项拒绝 + strict 拒多余字段）。
 */
describe('R3 单对象通道（problem:listRecent / credentials:captureRespond）', () => {
  test('listRecent：对象原样通过，limit 界、platform/status 闭集、多余字段被拒', () => {
    const good = { limit: 200, platform: 'codeforces', status: 'solved' }
    assert.deepStrictEqual(parseIpcArgs('ch', listRecentInput, [good]), [good])
    // 三个字段都 optional：空对象与缺字段合法（"没传" = 不过滤）。
    assert.deepStrictEqual(parseIpcArgs('ch', listRecentInput, [{}]), [{}])
    rejects(listRecentInput, [{ limit: 0 }])
    rejects(listRecentInput, [{ limit: 1001 }])
    rejects(listRecentInput, [{ limit: 1.5 }])
    rejects(listRecentInput, [{ platform: 'leetcode' }])
    rejects(listRecentInput, [{ status: 'ac' }])
    // strict 对象拒绝未声明字段；zod 对多余键的 issue path 为空，字段名在 message 里
    // （ipcPayload.parseIpcArgs 把它放进 expected——与该文件头注的口径一致）。
    const extra = rejects(listRecentInput, [{ limit: 10, extra: 1 }])
    assert.strictEqual(extra.path, 'arg0')
    assert.ok(extra.expected.includes('extra'), `字段名应在错误信息里，实测 ${extra.expected}`)
  })

  test('captureRespond：action 闭集 + captureId 走 oneShotId 界', () => {
    assert.deepStrictEqual(
      parseIpcArgs('ch', captureRespondInput, [{ captureId: 'capture-1', action: 'update' }]),
      [{ captureId: 'capture-1', action: 'update' }],
    )
    rejects(captureRespondInput, [{ captureId: 'capture-1', action: 'nope' }])
    rejects(captureRespondInput, [{ captureId: 'capture-1', action: undefined }])
    // captureId 复用 oneShotId（128）界：空串与超长都要拒。
    rejects(captureRespondInput, [{ captureId: '', action: 'save' }])
    rejects(captureRespondInput, [{ captureId: 'a'.repeat(129), action: 'save' }])
  })
})

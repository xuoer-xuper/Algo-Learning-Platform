import { describe, expect, it } from 'vitest'
// @ts-expect-error 守卫判定是 runner 共用的 .mjs，无类型声明；此处只需运行时行为
import { collectRatchetFailures, coreSuiteRunsEverything, countBareControls, countBareHex, countBareSql, countUnschemadIpc, themeDirectiveHasTailwindImport } from './guards.mjs'

/**
 * 守卫的反向验证。
 *
 * check-architecture.mjs 全部 PASS 只说明"当前代码合规"，不说明守卫真的会响。
 * 这里用合成输入把新守卫的判定逻辑逐个推到失败侧：违规重新出现时必须被抓到，
 * 否则守卫是装饰。
 */

const describeCount = (count: number) => `${count} 处`
const HINT = '清理提示'

function ratchet(entries: Array<{ path: string, count: number }>, budgets: Record<string, number>) {
  return collectRatchetFailures({ entries, budgets, describe: describeCount, cleanupHint: HINT })
}

describe('countBareSql', () => {
  it('抓到 db 层之外构造的语句', () => {
    expect(countBareSql('db.prepare("SELECT 1")')).toBe(1)
    expect(countBareSql('getDb().prepare(`SELECT 1`)')).toBe(1)
    expect(countBareSql('this.database.exec("VACUUM")')).toBe(1)
    expect(countBareSql('db.prepare(A); db.exec(B); db.prepare(C)')).toBe(3)
  })

  it('容忍换行与空格，不靠固定写法', () => {
    expect(countBareSql('db\n  .prepare(\n    "SELECT 1",\n  )')).toBe(1)
    expect(countBareSql('db . exec ( "SELECT 1" )')).toBe(1)
  })

  it('不把同名的非 SQL 调用算进来', () => {
    // 这三处是实测存在的误报源：限定方法名会全部命中。
    expect(countBareSql('while ((match = regex.exec(pattern)) !== null) {}')).toBe(0)
    expect(countBareSql('const m = EXPLICIT_SCHEME_PATTERN.exec(value)')).toBe(0)
    expect(countBareSql('return installer.prepare(request, existing, installId)')).toBe(0)
  })
})

describe('countUnschemadIpc', () => {
  it('接收渲染进程参数却没声明 schema 的算欠账', () => {
    expect(countUnschemadIpc("ipcMain.handle('a:b', (_event, id: string) => {})")).toBe(1)
    expect(countUnschemadIpc("ipcMain.on('a:b', (event, x: unknown) => {})")).toBe(1)
    expect(countUnschemadIpc("coachPetIpcMain.handle('a:b', (_e, x) => {})")).toBe(1)
    expect(countUnschemadIpc("ipcMain.handle('a:b', async (_event, id: string) => {})")).toBe(1)
    // 多参数仍然只算这一处注册，不按参数个数累加。
    expect(countUnschemadIpc("ipcMain.handle('a:b', (_e, a, b, c) => {})")).toBe(1)
  })

  it('声明了 schema 元组的不算', () => {
    expect(countUnschemadIpc("ipcMain.handle('a:b', [text()], (_event, id) => {})")).toBe(0)
    expect(countUnschemadIpc("ipcMain.handle('a:b', [daysRange(), rowLimit()], (_e, d, l) => {})")).toBe(0)
    expect(countUnschemadIpc("ipcMain.handle(\n  'a:b',\n  [text()],\n  (_event, id) => {},\n)")).toBe(0)
  })

  it('零参 handler 不算欠账', () => {
    // 没有参数就没有形状可校验，要求它声明 schema 只会逼出一堆空数组。
    expect(countUnschemadIpc("ipcMain.handle('a:b', () => {})")).toBe(0)
    expect(countUnschemadIpc("ipcMain.handle('a:b', (_event) => {})")).toBe(0)
    expect(countUnschemadIpc("ipcMain.handle('a:b', async () => {})")).toBe(0)
  })

  it('不误伤同名的其他调用', () => {
    expect(countUnschemadIpc("emitter.handle('a:b', (_e, x) => {})")).toBe(0)
    expect(countUnschemadIpc("registry.on('a:b', (_e, x) => {})")).toBe(0)
  })

  it('多处注册各自计数', () => {
    const source = [
      "ipcMain.handle('a:1', (_e, x) => {})",
      "ipcMain.handle('a:2', [text()], (_e, x) => {})",
      "ipcMain.handle('a:3', () => {})",
      "ipcMain.on('a:4', (_e, y) => {})",
    ].join('\n')
    expect(countUnschemadIpc(source)).toBe(2)
  })
})

describe('countBareControls', () => {
  it('抓到裸按钮与裸表单控件', () => {
    expect(countBareControls('<button type="button">x</button>')).toBe(1)
    expect(countBareControls('<select><option /></select>')).toBe(1)
    expect(countBareControls('<textarea />')).toBe(1)
    expect(countBareControls('<input type="text" />')).toBe(1)
    expect(countBareControls('<input />')).toBe(1)
  })

  it('不把自定义组件误判为原生控件', () => {
    // ui/ 组件名以大写开头，且 Button/Input 前缀会被 (?=[\s/>]) 之前的标签名边界排除。
    expect(countBareControls('<Button variant="primary">x</Button>')).toBe(0)
    expect(countBareControls('<Input value={v} />')).toBe(0)
    expect(countBareControls('<Select /><Textarea />')).toBe(0)
    expect(countBareControls('<ButtonGroup />')).toBe(0)
  })

  it('按类型豁免 checkbox/radio/range，含属性换行的写法', () => {
    expect(countBareControls('<input type="checkbox" />')).toBe(0)
    expect(countBareControls('<input\n  type="range"\n  min={0}\n/>')).toBe(0)
    expect(countBareControls("<input type='radio' />")).toBe(0)
  })

  it('豁免只看本标签的 type，不误读后面元素的属性', () => {
    // 前一个 input 无 type，后一个是 checkbox：必须计 1 而不是 0。
    expect(countBareControls('<input value={a} />\n<input type="checkbox" />')).toBe(1)
  })
})

describe('countBareHex', () => {
  it('抓到 CSS 与 TS 里的裸 hex', () => {
    expect(countBareHex('color: #fff;')).toBe(1)
    expect(countBareHex('background-color: #e81123;')).toBe(1)
    expect(countBareHex("solution: '#a6e3a1',")).toBe(1)
    expect(countBareHex('#fff #ffff #ffffff #ffffffff')).toBe(4)
  })

  it('不把 token 引用算成裸 hex', () => {
    expect(countBareHex('color: var(--color-on-fill);')).toBe(0)
    expect(countBareHex('background: rgb(15 23 42 / 0.92);')).toBe(0)
  })

  it('不把 HTML 数字实体当颜色', () => {
    // electron/coach/problemFacts/ConstraintParser.ts 里的实测误报源。
    expect(countBareHex("text.replace(/&#8804;/g, '≤')")).toBe(0)
    expect(countBareHex("'&#183;'")).toBe(0)
  })

  it('只认 CSS 合法长度，超长串不算', () => {
    // 5 位和 7 位不是合法颜色；若按 {3,8} 贪婪匹配会把 7 位切成 6 位算一处。
    expect(countBareHex('#12345')).toBe(0)
    expect(countBareHex('#1234567')).toBe(0)
    expect(countBareHex('#123456789')).toBe(0)
  })
})

describe('collectRatchetFailures', () => {
  it('白名单外出现命中即失败', () => {
    const failures = ratchet([{ path: 'a.ts', count: 1 }], {})
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('a.ts')
    expect(failures[0]).toContain(HINT)
  })

  it('白名单内超出预算即失败', () => {
    const failures = ratchet([{ path: 'a.ts', count: 3 }], { 'a.ts': 2 })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('白名单只减不增')
  })

  it('只有恰好等于预算才放行', () => {
    expect(ratchet([{ path: 'a.ts', count: 2 }], { 'a.ts': 2 })).toEqual([])
  })

  it('低于预算也要报，逼着把数字改小', () => {
    // 这条原先断言的是"低于预算放行"。改判的理由：那样棘轮只在完全清零时才提醒，
    // 部分清理完全看不见——某文件从 23 处清到 5 处、预算仍写 23，守卫照样 PASS，
    // 于是那 18 处欠账可以悄悄加回来。实测确认过：把一条预算从 2 上调到 3，守卫不响。
    const failures = ratchet([{ path: 'a.ts', count: 1 }], { 'a.ts': 2 })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('请把预算降到 1')
  })

  it('已清理的陈旧条目必须报出来', () => {
    // 少了这条，白名单会一直挂着还完的欠账，下次往那个文件加违规时守卫不会响。
    const failures = ratchet([{ path: 'a.ts', count: 0 }], { 'a.ts': 2 })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('请从白名单删除')
  })

  it('一次报全部问题，不在第一条就短路', () => {
    const failures = ratchet(
      [{ path: 'new.ts', count: 1 }, { path: 'over.ts', count: 5 }],
      { 'over.ts': 2, 'stale.ts': 1 },
    )
    expect(failures).toHaveLength(3)
  })
})

describe('coreSuiteRunsEverything', () => {
  it('无参 runVitest() 视为跑全套', () => {
    expect(coreSuiteRunsEverything('function runCoreSuite() {\n  runLint()\n  runVitest()\n}')).toBe(true)
    expect(coreSuiteRunsEverything('function runCoreSuite() {\n  runVitest( )\n}')).toBe(true)
  })

  it('传文件名单就不算', () => {
    // 这正是漏掉 47 个文件的那种写法：名单式调用必须被判为不合格。
    expect(coreSuiteRunsEverything("function runCoreSuite() {\n  runVitest(['tests/app'])\n}")).toBe(false)
    expect(coreSuiteRunsEverything('function runCoreSuite() {\n  runVitest(coreVitestFiles)\n}')).toBe(false)
  })

  it('只看 runCoreSuite 自己的函数体', () => {
    // 别的 suite 传名单是正常的（db/coach 都是聚焦套件），不能让它们把判定带偏。
    const source = [
      "function runCoreSuite() {\n  runVitest(['tests/app'])\n}",
      'function runAllSuite() {\n  runVitest()\n}',
    ].join('\n\n')
    expect(coreSuiteRunsEverything(source)).toBe(false)
  })

  it('找不到 runCoreSuite 时判为不合格，而不是默认放行', () => {
    expect(coreSuiteRunsEverything('function runAllSuite() {\n  runVitest()\n}')).toBe(false)
  })
})

describe('themeDirectiveHasTailwindImport', () => {
  it('两者同时在场才算合规', () => {
    const source = '@import "tailwindcss";\n\n@theme {\n  --color-app: #eef1f6;\n}\n'
    expect(themeDirectiveHasTailwindImport(source)).toEqual({ ok: true, reason: 'ok' })
    // 单引号与两者都不在场（纯手写 token 的 CSS）同样合规
    expect(themeDirectiveHasTailwindImport("@import 'tailwindcss';\n@theme {\n}\n").ok).toBe(true)
    expect(themeDirectiveHasTailwindImport(':root {\n  --color-app: #eef1f6;\n}\n').ok).toBe(true)
  })

  it('有 @theme 没 import 必须报', () => {
    // 这正是那次错误判断会产生的文件状态：以为工具类没人用就把依赖删了，
    // 结果 @theme 整块被浏览器忽略，44 个 token 全变未定义。
    const result = themeDirectiveHasTailwindImport('@theme {\n  --color-app: #eef1f6;\n}\n')
    expect(result).toEqual({ ok: false, reason: 'missing-import' })
  })

  it('注释掉 import 不算在场', () => {
    // 实测时就是这么注掉的，产物立刻从 12841 字节掉到 3686。
    const source = '/* @import "tailwindcss"; */\n@theme {\n  --color-app: #eef1f6;\n}\n'
    expect(themeDirectiveHasTailwindImport(source).ok).toBe(false)
  })

  it('有 import 没 @theme 也报：token 源被搬走了', () => {
    const result = themeDirectiveHasTailwindImport('@import "tailwindcss";\n.foo { color: red; }\n')
    expect(result).toEqual({ ok: false, reason: 'missing-theme' })
  })
})

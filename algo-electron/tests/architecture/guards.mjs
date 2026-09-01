/**
 * 架构守卫的纯判定逻辑。
 *
 * 与 check-architecture.mjs 分开，是为了让守卫本身可被单元测试反向验证：
 * 守卫的价值全在"违规重新出现时会失败"，而这一点没法靠守卫自己通过来证明。
 * 这里只做文本判定与棘轮比对，不碰文件系统；遍历与读文件留在 runner 里。
 */

/**
 * 裸 SQL 的判定口径是"在 db 层之外构造语句"，即对 db / database / getDb() 调
 * prepare 或 exec。不按 SQL 关键字计数：关键字会命中注释和文档字符串，也漏掉
 * 动态拼表名的写法；而 regex.exec()、installer.prepare() 这类同名调用必须排除，
 * 所以限定接收者而不是限定方法名。
 */
const BARE_SQL_PATTERN = /\b(?:db|database|getDb\(\))\s*\.\s*(?:prepare|exec)\s*\(/g

export function countBareSql(text) {
  return (text.match(BARE_SQL_PATTERN) ?? []).length
}

/**
 * checkbox / radio / range 在 src/components/ui/fields.tsx 里还没有对应组件，
 * 先按类型豁免。补齐组件后删掉这个豁免，届时会有 6 处需要改。
 */
const EXEMPT_INPUT_TYPES = /type\s*=\s*["'](?:checkbox|radio|range)["']/

export function countBareControls(text) {
  let count = 0
  for (const match of text.matchAll(/<(button|input|select|textarea)(?=[\s/>])/g)) {
    if (match[1] === 'input') {
      // 属性常换行，往后取一段找 type；截到标签结束避免读进下一个元素。
      const rest = text.slice(match.index, match.index + 400)
      const tagEnd = rest.indexOf('>')
      if (EXEMPT_INPUT_TYPES.test(tagEnd === -1 ? rest : rest.slice(0, tagEnd))) continue
    }
    count++
  }
  return count
}

/**
 * 裸 hex 颜色。三处口径都是被实测误报逼出来的：
 *   - 长度只认 CSS 合法的 3/4/6/8 位，且从长到短排列，否则 7 位串会被
 *     当成"6 位 + 1 个字符"算成一处；
 *   - 尾部 (?![0-9a-fA-F]) 挡住超长串；
 *   - 头部 (?<!&) 排除 HTML 数字实体 —— &#8804; 的 8804 正好是 4 位十六进制，
 *     后面跟分号也过得了尾部检查，只有前缀能区分。
 *
 * token 定义文件不在这里豁免 —— 判定只回答"这段文本里有几处裸 hex"，
 * 哪些文件允许有由 runner 决定（定义 token 不是欠账，不进棘轮预算）。
 */
const BARE_HEX_PATTERN = /(?<!&)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g

export function countBareHex(text) {
  return (text.match(BARE_HEX_PATTERN) ?? []).length
}

/**
 * 裸 rgb()/rgba() 字面量。
 *
 * 与裸 hex 同一条规则的另一半，B5.4 补上：hex 被守住之后，剩下的漏洞就是
 * rgba —— 它同样是写死的颜色，而且更危险，因为半透明值天生依赖底色。暗色模式
 * 落地时实测到四处：标签悬停的加白 55%、新建标签键的加白 70%、对话框遮罩的
 * ink 50%、滚动条滑块的 ink-2 28%。前两个压在暗色标签带上会变成近白色块，
 * 后两个在暗面几乎看不见。它们没被旧守卫拦住，因为旧守卫只看 `#`。
 *
 * `var(--x)` 里套 rgb 不算 —— token 定义文件本来就豁免；这里只判文本里有几处
 * 字面量，哪些文件允许由 runner 决定，口径与 countBareHex 一致。
 */
const BARE_RGB_PATTERN = /\brgba?\(\s*[\d.]/g

export function countBareRgb(text) {
  return (text.match(BARE_RGB_PATTERN) ?? []).length
}

/**
 * core 门是否跑整个 Vitest 套件。
 *
 * 判定的是"`runCoreSuite()` 里调 `runVitest()` 时没传参数"。传了文件名单就意味着门只看
 * 名单里的目录——这曾经真的发生过：15 项手工名单覆盖 103/150 个文件，新增目录没人补进去，
 * 那些目录的改动一直没被验过而命令照样报绿。
 */
export function coreSuiteRunsEverything(verifySource) {
  const body = verifySource.match(/function runCoreSuite\(\) \{([\s\S]*?)\n\}/)
  if (!body) return false
  return /\brunVitest\(\s*\)/.test(body[1])
}

/**
 * `@theme` 与 `@import "tailwindcss"` 必须同时在场。
 *
 * `@theme { … }` 是 Tailwind v4 的指令，不是标准 CSS：44 个设计 token 全写在里面，靠插件
 * 编译成 `:root` 上的自定义属性，全项目 111 个 `var(--…)` 消费它们。少了 import，浏览器
 * 会直接忽略整个 `@theme` 块，token 全部变成未定义，配色退回默认值——实测产物从 12841
 * 字节掉到 3686，`--color-app` 出现 0 次。
 *
 * 这条守卫是被一次错误判断逼出来的：工具类确实零消费者（最后一处在 `ErrorBoundary` 里，
 * Q4 已移除），很容易由此推出"Tailwind 没人用了、可以删依赖"。前半句对，后半句错——
 * 它现在的身份是 token 编译器与 CSS 重置来源，不是工具类框架。
 *
 * 反向也判：留着 import 而 `@theme` 没了，说明 token 源被搬走或删了，同样要报。
 */
export function themeDirectiveHasTailwindImport(cssSource) {
  const hasTheme = /^\s*@theme\b/m.test(cssSource)
  // 注释掉的 import 不算在场：注掉它正是删除的第一步，也是实测时用过的手法。
  const hasImport = /^\s*@import\s+["']tailwindcss["']/m.test(cssSource)
  if (hasTheme !== hasImport) {
    return hasTheme
      ? { ok: false, reason: 'missing-import' }
      : { ok: false, reason: 'missing-theme' }
  }
  return { ok: true, reason: 'ok' }
}

/**
 * 棘轮白名单比对：只减不增。
 *
 * `entries` 是 `[{ path, count }]`，count 为 0 的条目视为已清理。
 * 三类失败：白名单外出现命中、白名单内超出预算、白名单留着已清理的陈旧条目。
 * 第三类不是洁癖 —— 少了它，白名单会一直挂着已经还完的欠账，
 * 下次有人往那个文件加违规时守卫不会响。
 */
/**
 * 未声明 schema 的 IPC 注册数。
 *
 * 判定口径是"第二个实参不是数组字面量"。`ipcMain.handle(ch, [text()], fn)` 声明了
 * 渠道载荷形状，`ipcMain.handle(ch, fn)` 没有——后者只有 `checkShellSender`（谁能发）
 * 与 `checkIpcPayload`（结构/体积/成环）两道防线，参数形状仍是渲染进程说什么就是什么。
 *
 * 零参 handler（`ipcMain.handle(ch, () => …)`）不算欠账：没有参数就没有形状可校验。
 * 所以要看 `(` 之后有没有第二个形参——`(_event, x)` 算，`()` 与 `(_event)` 不算。
 *
 * 不按"是否出现 typeof 检查"计数：手写检查散落在 handler 体内，跨行、跨嵌套，
 * 文本判定必然算错；而"有没有 schema 元组"是注册处一眼可见的单一事实。
 */
const IPC_REGISTRATION_PATTERN =
  /\b(?:ipcMain|coachPetIpcMain|ipcMainHandle)\s*\.?\s*(?:handle|on)\(\s*'[^']+'\s*,\s*(\[?)\s*(?:async\s*)?(?:\(([^)]*)\))?/g

export function countUnschemadIpc(text) {
  let count = 0
  for (const match of text.matchAll(IPC_REGISTRATION_PATTERN)) {
    const hasSchemaTuple = match[1] === '['
    if (hasSchemaTuple) continue
    const params = (match[2] ?? '').split(',').map(part => part.trim()).filter(Boolean)
    // 只有形参多于 event 的才算欠账。
    if (params.length > 1) count += 1
  }
  return count
}

/**
 * `raw()` 的用量。
 *
 * `raw()` 的语义是"这个参数由 handler 自己校验"，存在的意义是让"没校验"和
 * "在别处校验"在代码里可区分。但它同时也是一个逃逸口：写上去就能让
 * `countUnschemadIpc` 闭嘴。所以它自己也得上棘轮，否则迁移可以靠 `raw()` 刷完。
 *
 * 只数调用，不数 import 与注释里的提及——`from './payloadSchema'` 那行里的 `raw`
 * 后面跟的是 `,` 或 `}`，不是 `(`。
 */
export function countRawIpcSchemas(text) {
  return text.match(/\braw\(\s*['"`]/g)?.length ?? 0
}

export function collectRatchetFailures({ entries, budgets, describe, cleanupHint }) {
  const failures = []
  const seen = new Set()

  for (const { path: filePath, count } of entries) {
    if (count === 0) continue
    seen.add(filePath)

    const budget = budgets[filePath]
    if (budget === undefined) {
      failures.push(`${filePath}: ${describe(count)}。${cleanupHint}`)
    } else if (count > budget) {
      failures.push(`${filePath}: ${describe(count)}，白名单预算为 ${budget}。白名单只减不增，不要上调预算`)
    } else if (count < budget) {
      // 第四类：预算高于实际。
      //
      // 少了这一条，棘轮只在"完全清零"时才会提醒删条目，而部分清理是看不见的：
      // 某文件从 23 处清到 5 处、预算仍留着 23，守卫照样 PASS——于是那 18 处欠账
      // 又可以悄悄加回来。实测确认过这个漏洞：把某条预算从 2 上调到 3，守卫不响。
      //
      // 代价是每次清理都要在同一个提交里把数字改小。这正是想要的效果——
      // 清了多少必须记下来，而不是攒着当缓冲。
      failures.push(`${filePath}: 实际只有 ${count} 处，白名单预算仍写着 ${budget}。请把预算降到 ${count}`)
    }
  }

  for (const filePath of Object.keys(budgets)) {
    if (!seen.has(filePath)) failures.push(`${filePath}: 已无命中，请从白名单删除该条目`)
  }

  return failures
}

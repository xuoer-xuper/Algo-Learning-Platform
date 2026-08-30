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
 * 棘轮白名单比对：只减不增。
 *
 * `entries` 是 `[{ path, count }]`，count 为 0 的条目视为已清理。
 * 三类失败：白名单外出现命中、白名单内超出预算、白名单留着已清理的陈旧条目。
 * 第三类不是洁癖 —— 少了它，白名单会一直挂着已经还完的欠账，
 * 下次有人往那个文件加违规时守卫不会响。
 */
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
    }
  }

  for (const filePath of Object.keys(budgets)) {
    if (!seen.has(filePath)) failures.push(`${filePath}: 已无命中，请从白名单删除该条目`)
  }

  return failures
}

export const PLATFORM_NAMES: Record<string, string> = {
  codeforces: 'Codeforces',
  acwing: 'AcWing',
  nowcoder: '牛客',
  vjudge: 'VJudge',
  pta: 'PTA',
  luogu: '洛谷',
  'leetcode-cn': 'LeetCode',
}

export const PLATFORM_LABELS: Record<string, string> = {
  codeforces: 'CF',
  acwing: 'AcW',
  nowcoder: 'NC',
  vjudge: 'VJ',
  pta: 'PTA',
  luogu: 'LG',
  'leetcode-cn': 'LC',
}

export const PLATFORM_URLS: Record<string, string> = {
  codeforces: 'https://codeforces.com',
  acwing: 'https://www.acwing.com',
  nowcoder: 'https://ac.nowcoder.com',
  vjudge: 'https://vjudge.net',
  pta: 'https://pintia.cn',
  luogu: 'https://www.luogu.com.cn',
  'leetcode-cn': 'https://leetcode.cn/problemset/',
}

/**
 * 平台身份色：仅用于「带文字标签的」圆点/芯片（侧栏、列表、图例）。
 * 白面对比度均 ≥3:1；7 个品牌近似色互相的全对 CVD 区分不可能全部达标，
 * 因此规则是：平台色永远与 PLATFORM_LABELS 文字成对出现，禁止单独承义，
 * 也禁止直接作为图表系列色（图表一律用 CHART_COLORS，见下）。
 */
export const PLATFORM_COLORS: Record<string, string> = {
  codeforces: '#2b7cd3',
  acwing: '#0e9db8',
  nowcoder: '#e05d00',
  vjudge: '#128a52',
  pta: '#8a3ffc',
  luogu: '#44489f',
  'leetcode-cn': '#b45309',
}

export const STATUS_LABELS: Record<string, string> = {
  solved: '已通过',
  attempted: '尝试中',
  visited: '已访问',
  unknown: '未知',
}

/** 状态色：语义 token 引用，永远与文字/图标成对出现。平台品牌色和图表色保留静态色板。 */
export const STATUS_COLORS: Record<string, string> = {
  solved: 'var(--color-ok)',
  attempted: 'var(--color-warn)',
  visited: 'var(--color-accent)',
  unknown: 'var(--color-ink-3)',
}

export const VERDICT_COLORS: Record<string, string> = {
  AC: 'var(--color-ok)',
  WA: 'var(--color-danger)',
  TLE: 'var(--color-warn)',
  MLE: 'var(--color-warn)',
  RE: 'var(--color-danger)',
  CE: 'var(--color-warn)',
  PE: 'var(--color-warn)',
  OLE: 'var(--color-warn)',
  SKIPPED: 'var(--color-ink-3)',
  TESTING: 'var(--color-accent)',
  UNKNOWN: 'var(--color-ink-3)',
}

/**
 * 图表分类色板：经 dataviz 校验器验证（白面，6 槽，相邻对 CVD ΔE≥8、
 * 常视力 ΔE≥15 全过；#1baf7a/#eda100/#e87ba4 三槽 <3:1 对比，
 * 使用处必须带直接标签或图例+工具提示补救）。
 * 按槽位固定分配、不循环取模生成新色；第 7 个系列起并入「其他」。
 */
export const CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']

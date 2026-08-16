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

/** 状态色：浅色面高对比档，永远与文字/图标成对出现 */
export const STATUS_COLORS: Record<string, string> = {
  solved: '#158445',
  attempted: '#b45309',
  visited: '#2f5fe0',
  unknown: '#8b94a6',
}

export const VERDICT_COLORS: Record<string, string> = {
  AC: '#158445',
  WA: '#c22f2f',
  TLE: '#b45309',
  MLE: '#b45309',
  RE: '#c22f2f',
  CE: '#946300',
  PE: '#946300',
  OLE: '#946300',
  SKIPPED: '#8b94a6',
  TESTING: '#2f5fe0',
  UNKNOWN: '#8b94a6',
}

/**
 * 图表分类色板：经 dataviz 校验器验证（白面，6 槽，相邻对 CVD ΔE≥8、
 * 常视力 ΔE≥15 全过；#1baf7a/#eda100/#e87ba4 三槽 <3:1 对比，
 * 使用处必须带直接标签或图例+工具提示补救）。
 * 按槽位固定分配、不循环取模生成新色；第 7 个系列起并入「其他」。
 */
export const CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']

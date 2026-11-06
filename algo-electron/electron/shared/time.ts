export {
  nowMillis,
  toLocalDay,
  formatForDisplay,
  localDayBounds,
  shiftLocalDay,
} from '../../src/shared/time'

// Frozen compatibility formatter for released migrations 001-029 only.
// 返回系统本地时间字符串，格式 YYYY-MM-DDTHH:mm:ss.SSS（无时区后缀）
// 注意：函数名沿用 nowBeijing，但实际返回的是系统本地时间，并非显式北京时间。
// 在东八区系统上等价于北京时间；非东八区系统需注意 local_day 与北京日期可能不一致。
export function nowBeijing(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${y}-${m}-${day}T${h}:${min}:${s}.${ms}`
}

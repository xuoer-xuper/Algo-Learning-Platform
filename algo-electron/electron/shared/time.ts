// 返回本地系统时间 ISO 字符串
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

// 返回本地日期 YYYY-MM-DD
export function todayBeijing(): string {
  return nowBeijing().slice(0, 10)
}

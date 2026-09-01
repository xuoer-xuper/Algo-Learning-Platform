import { useEffect, useState } from 'react'
import { Select } from '../../components/ui'
import { errorMessage } from '../../shared/errors'
import { loadThemePreference, saveThemePreference } from './settingsApi'

/*
 * 外观（B5.4，决策 D6）。
 *
 * 没有"保存"按钮：主题是即时反馈的设置，选完就该看到结果，多一步确认只是噪音。
 * 因此这里选完立刻写盘 + 立刻生效——生效路径不经本组件，主进程改
 * `nativeTheme.themeSource` 后 `src/theme.ts` 的 media query 监听会翻 `data-theme`。
 *
 * 失败要回滚下拉框：写盘失败时界面主题不会变（主进程先落盘再赋值），若下拉框
 * 停在新值就会和实际显示的主题对不上。
 */

const THEME_LABELS: Array<{ value: ThemePreference, label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

export function AppearancePanel() {
  const [theme, setTheme] = useState<ThemePreference>('system')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  useEffect(() => {
    void loadThemePreference()
      .then(setTheme)
      .catch((error: unknown) => setStatus(`读取失败：${errorMessage(error)}`))
      .finally(() => setLoading(false))
  }, [])

  const handleChange = async (next: ThemePreference) => {
    const previous = theme
    setTheme(next)
    setStatus('')
    try {
      setTheme(await saveThemePreference(next))
    } catch (error: unknown) {
      setTheme(previous)
      setStatus(`保存失败：${errorMessage(error)}`)
    }
  }

  return (
    <section className="settings-section" aria-labelledby="appearance-title">
      <h3 id="appearance-title" className="settings-section-title">外观</h3>

      <div className="settings-row">
        <label className="settings-label" htmlFor="theme-select">主题</label>
        <Select
          id="theme-select"
          className="settings-input settings-select"
          value={theme}
          disabled={loading}
          onChange={(event) => void handleChange(event.target.value as ThemePreference)}
        >
          {THEME_LABELS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      <div className="settings-row settings-hint-text">
        深色会同时应用到应用界面和内置浏览器的网页配色偏好，与 Chrome 的行为一致。
      </div>

      {status && (
        <div className="settings-row settings-error-text" role="alert" aria-live="polite">
          {status}
        </div>
      )}
    </section>
  )
}

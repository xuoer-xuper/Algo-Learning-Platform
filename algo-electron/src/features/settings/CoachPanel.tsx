import { useEffect, useState } from 'react'

/**
 * Coach 桌宠设置面板。
 *
 * 接入 SettingsPage.tsx 左栏。提供：
 * - 开关：启用 Coach / 声音
 * - 气泡频率：low / medium / high（阶段 2 规则引擎消费）
 * - 缩放：0.5 ~ 2.0
 * - 透明度：0.3 ~ 1.0
 * - 位置重置按钮
 * - 测试提示按钮（触发 coach:testHint，立即弹测试气泡 + alert 状态）
 *
 * 持久化通过 coach:getConfig / coach:saveConfig，沿用 electron/app/config.ts。
 * 阶段 1 暂不支持运行时启停桌宠窗口（需重启），仅持久化配置。
 */
export function CoachPanel() {
  const [config, setConfig] = useState<CoachConfig | null>(null)
  const [saved, setSaved] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  useEffect(() => {
    void window.electronAPI.coachGetConfig().then(setConfig)
  }, [])

  const updateConfig = (partial: Partial<CoachConfig>) => {
    if (!config) return
    const next = { ...config, ...partial }
    setConfig(next)
    void window.electronAPI.coachSaveConfig(partial).then(() => {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    })
  }

  const handleTestHint = () => {
    setTestMsg('触发中...')
    void window.electronAPI.coachTestHint().then((payload) => {
      setTestMsg(`已弹测试气泡：${payload.title}`)
      window.setTimeout(() => setTestMsg(''), 3000)
    })
  }

  const handleResetPosition = () => {
    void window.electronAPI.coachResetPosition().then(() => {
      setTestMsg('位置已重置')
      window.setTimeout(() => setTestMsg(''), 2000)
    })
  }

  if (!config) {
    return (
      <div className="settings-section">
        <h3 className="settings-section-title">Coach 桌宠</h3>
        <div className="settings-row">加载中...</div>
      </div>
    )
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">
        Coach 桌宠
        {saved && <span className="settings-saved-flag">已保存</span>}
      </h3>

      <div className="settings-row">
        <label className="settings-label">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => updateConfig({ enabled: e.target.checked })}
          />
          <span>启用 Coach（重启后生效）</span>
        </label>
      </div>

      <div className="settings-row">
        <label className="settings-label">
          <input
            type="checkbox"
            checked={config.sound}
            onChange={(e) => updateConfig({ sound: e.target.checked })}
          />
          <span>提示声音</span>
        </label>
      </div>

      <div className="settings-row">
        <label className="settings-label-row">
          <span>气泡频率</span>
          <select
            className="settings-input settings-select"
            value={config.bubbleFrequency}
            onChange={(e) =>
              updateConfig({ bubbleFrequency: e.target.value as CoachConfig['bubbleFrequency'] })
            }
          >
            <option value="low">低（少打扰）</option>
            <option value="medium">中（默认）</option>
            <option value="high">高（多提示）</option>
          </select>
        </label>
      </div>

      <div className="settings-row">
        <label className="settings-label-row">
          <span>缩放：{config.scale.toFixed(2)}x</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={config.scale}
            onChange={(e) => updateConfig({ scale: parseFloat(e.target.value) })}
          />
        </label>
      </div>

      <div className="settings-row">
        <label className="settings-label-row">
          <span>透明度：{Math.round(config.opacity * 100)}%</span>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={config.opacity}
            onChange={(e) => updateConfig({ opacity: parseFloat(e.target.value) })}
          />
        </label>
      </div>

      <div className="settings-row">
        <button className="settings-save-btn" onClick={handleResetPosition}>
          重置位置
        </button>
        <button
          className="settings-save-btn"
          onClick={handleTestHint}
          disabled={!config.enabled}
          title={config.enabled ? '弹一个测试气泡' : '需先启用 Coach'}
        >
          测试提示
        </button>
      </div>

      {testMsg && (
        <div className="settings-row settings-hint-text">{testMsg}</div>
      )}

      <div className="settings-row settings-hint-text">
        提示：缩放/透明度即时生效；启用开关需重启应用。
      </div>
    </div>
  )
}

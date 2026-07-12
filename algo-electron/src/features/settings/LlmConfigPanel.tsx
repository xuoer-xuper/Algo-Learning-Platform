import { useState, useEffect, useRef } from 'react'
import { loadLlmConfig, saveLlmApiKey, saveLlmConfig, testLlmConnection } from './settingsApi'

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_MODEL = 'doubao-seed-1-6-flash-250715'

const MODEL_OPTIONS = [
  { value: 'doubao-seed-1-6-flash-250715', label: 'Doubao Seed 1.6 Flash（推荐，性价比最高）' },
  { value: 'doubao-seed-1-6-250615', label: 'Doubao Seed 1.6（推理更强）' },
  { value: 'doubao-1-5-pro-32k-250115', label: 'Doubao 1.5 Pro 32K（短上下文）' },
  { value: 'doubao-seed-1-6-pro-250615', label: 'Doubao Seed 1.6 Pro（旗舰）' },
]

export function LlmConfigPanel() {
  const [status, setStatus] = useState<LlmConfigStatus | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [enabled, setEnabled] = useState(false)
  const [savedFlag, setSavedFlag] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<LlmConnectionTestResult | null>(null)
  const savedTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    void loadLlmConfig().then((s) => {
      if (!s) return
      setStatus(s)
      setBaseUrl(s.base_url || DEFAULT_BASE_URL)
      setModel(s.model || DEFAULT_MODEL)
      setEnabled(s.enabled)
    })
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
    }
  }, [])

  const flashSaved = () => {
    setSavedFlag(true)
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
    savedTimerRef.current = window.setTimeout(() => setSavedFlag(false), 1500)
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return
    await saveLlmApiKey(apiKeyInput.trim())
    setApiKeyInput('')
    const s = await loadLlmConfig()
    setStatus(s)
    flashSaved()
  }

  const handleSaveConfig = async (partial: { base_url?: string; model?: string; enabled?: boolean }) => {
    await saveLlmConfig(partial)
    const s = await loadLlmConfig()
    setStatus(s)
    flashSaved()
  }

  const handleToggleEnabled = async () => {
    const next = !enabled
    setEnabled(next)
    await handleSaveConfig({ enabled: next })
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const key = apiKeyInput.trim() || ''
      const result = await testLlmConnection({
        api_key: key,
        base_url: baseUrl,
        model,
      })
      setTestResult(result)
      if (result.success && key) {
        await saveLlmApiKey(key)
        setApiKeyInput('')
        const s = await loadLlmConfig()
        setStatus(s)
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">
        AI 大模型配置
        {savedFlag && <span className="settings-saved-flag">已保存</span>}
      </h3>

      <div className="settings-row">
        <div className="settings-label-row">
          <label className="settings-label">启用 LLM 提示</label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => void handleToggleEnabled()}
            disabled={!status?.has_key}
          />
        </div>
        <div className="settings-hint-text">
          {status?.has_key
            ? `当前 Key: ${status.key_masked}`
            : '未配置 API Key，请先填写并保存'}
        </div>
      </div>

      <div className="settings-row">
        <label className="settings-label">API Key</label>
        <input
          className="settings-input"
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder={status?.has_key ? `已配置（${status.key_masked}），输入新 Key 覆盖` : 'ark-xxxxxxxxxxxx'}
        />
        <button
          className="settings-save-btn"
          onClick={() => void handleSaveApiKey()}
          disabled={!apiKeyInput.trim()}
        >
          保存 Key
        </button>
      </div>

      <div className="settings-row">
        <label className="settings-label">模型</label>
        <select
          className="settings-select"
          value={model}
          onChange={(e) => {
            setModel(e.target.value)
            void handleSaveConfig({ model: e.target.value })
          }}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <label className="settings-label">Base URL</label>
        <input
          className="settings-input"
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          onBlur={() => void handleSaveConfig({ base_url: baseUrl })}
        />
      </div>

      <div className="settings-row">
        <button
          className="settings-save-btn"
          onClick={() => void handleTestConnection()}
          disabled={testing || (!apiKeyInput.trim() && !status?.has_key)}
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
        {testResult && (
          <span
            className="settings-hint-text"
            style={{ color: testResult.success ? '#22c55e' : '#ef4444' }}
          >
            {testResult.success && testResult.latency_ms != null
              ? `✓ ${testResult.message}（${testResult.latency_ms}ms）`
              : `✗ ${testResult.message}`}
          </span>
        )}
      </div>

      <div className="settings-hint-text">
        推荐使用火山引擎豆包大模型。新用户赠送 50 万 tokens 免费额度。
        <br />
        注册地址：<a href="https://console.volcengine.com/ark" target="_blank" rel="noopener noreferrer">火山方舟控制台</a>
      </div>
    </div>
  )
}

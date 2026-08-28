import { useState, useEffect, useRef } from 'react'
import { Button, Icon, Input } from '../../components/ui'
import { errorMessage } from '../../shared/errors'
import { loadLlmConfig, saveLlmApiKey, saveLlmConfig, testLlmConnection } from './settingsApi'

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_MODEL = 'doubao-seed-1-6-flash-250715'

export function LlmConfigPanel() {
  const [status, setStatus] = useState<LlmConfigStatus | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [enabled, setEnabled] = useState(false)
  const [savedFlag, setSavedFlag] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<LlmConnectionTestResult | null>(null)
  const [loadError, setLoadError] = useState('')
  const savedTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    void loadLlmConfig()
      .then((s) => {
        if (!s) return
        setStatus(s)
        setBaseUrl(s.base_url || DEFAULT_BASE_URL)
        setModel(s.model || DEFAULT_MODEL)
        setEnabled(s.enabled)
      })
      // 读失败时若不提示，面板会显示「未配置 API Key」，与真正没配置无法区分。
      .catch((error: unknown) => setLoadError(`读取失败：${errorMessage(error)}`))
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
    try {
      const saved = await saveLlmApiKey(apiKeyInput.trim())
      if (!saved) {
        setTestResult({
          success: false,
          message: '系统安全存储不可用，API Key 未保存',
        })
        return
      }
      setApiKeyInput('')
      setStatus(await loadLlmConfig())
      flashSaved()
    } catch (error: unknown) {
      setTestResult({ success: false, message: `保存失败：${errorMessage(error)}` })
    }
  }

  const handleSaveConfig = async (partial: { base_url?: string; model?: string; enabled?: boolean }) => {
    try {
      await saveLlmConfig(partial)
      setStatus(await loadLlmConfig())
      flashSaved()
    } catch (error: unknown) {
      setTestResult({ success: false, message: `保存失败：${errorMessage(error)}` })
    }
  }

  const handleToggleEnabled = async (checked: boolean) => {
    setEnabled(checked)
    await handleSaveConfig({ enabled: checked })
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
        const saved = await saveLlmApiKey(key)
        if (!saved) {
          setTestResult({
            success: false,
            message: '连接成功，但系统安全存储不可用，API Key 未保存',
          })
          return
        }
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
    <div className="settings-section llm-config-section">
      <h3 className="settings-section-title">
        AI 大模型配置
        {savedFlag && <span className="settings-saved-flag">已保存</span>}
      </h3>

      <div className="settings-row">
        <label className="settings-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => void handleToggleEnabled(e.target.checked)}
            disabled={!status?.has_key}
          />
          <span>启用 LLM 提示{!status?.has_key ? '（需先配置 API Key）' : ''}</span>
        </label>
      </div>

      {loadError && (
        <div className="settings-row settings-error-text" role="alert">{loadError}</div>
      )}

      <div className="settings-row settings-hint-text">
        {loadError
          ? '配置状态未知'
          : status?.has_key
            ? <>当前 Key: <span className="mono">{status.key_masked}</span></>
            : '未配置 API Key，请先填写并保存'}
      </div>

      <div className="settings-row">
        <label className="settings-label">API Key</label>
        <Input
          className="settings-input"
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder={status?.has_key ? `已配置（${status.key_masked}），输入新 Key 覆盖` : 'ark-xxxxxxxxxxxx'}
        />
        <Button
          variant="primary"
          onClick={() => void handleSaveApiKey()}
          disabled={!apiKeyInput.trim()}
        >
          保存 Key
        </Button>
      </div>

      <div className="settings-row">
        <label className="settings-label">模型 ID</label>
        <Input
          className="settings-input"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => void handleSaveConfig({ model })}
          placeholder="doubao-seed-1-6-flash-250715"
        />
      </div>

      <div className="settings-row">
        <label className="settings-label">Base URL</label>
        <Input
          className="settings-input"
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          onBlur={() => void handleSaveConfig({ base_url: baseUrl })}
        />
      </div>

      <div className="settings-row">
        <Button
          onClick={() => void handleTestConnection()}
          disabled={testing || (!apiKeyInput.trim() && !status?.has_key)}
        >
          {testing ? '测试中...' : '测试连接'}
        </Button>
        {testResult && (
          <span className={`settings-test-result ${testResult.success ? 'settings-test-ok' : 'settings-test-err'}`}>
            <Icon name={testResult.success ? 'check' : 'close'} size={12} />
            <span>
              {testResult.message}
              {testResult.success && testResult.latency_ms != null && (
                <span className="num">（{testResult.latency_ms}ms）</span>
              )}
            </span>
          </span>
        )}
      </div>

      <div className="settings-row settings-hint-text">
        推荐火山引擎豆包（新用户赠 50 万 tokens）：
        <a href="https://console.volcengine.com/ark" target="_blank" rel="noopener noreferrer">火山方舟控制台</a>
      </div>
    </div>
  )
}

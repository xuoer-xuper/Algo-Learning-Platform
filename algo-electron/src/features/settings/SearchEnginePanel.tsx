import { useEffect, useRef, useState } from 'react'
import { Button, Input, Select } from '../../components/ui'
import { loadSearchEngine, saveSearchEngine } from './settingsApi'

const QUERY_PLACEHOLDER = '{query}'
const MAX_CUSTOM_TEMPLATE_LENGTH = 2_048

function getCustomTemplateError(template: string): string | null {
  if (!template) return '请输入自定义搜索 URL 模板。'
  if (template.length > MAX_CUSTOM_TEMPLATE_LENGTH) return '模板不能超过 2048 个字符。'
  if (template.trim() !== template) return '模板首尾不能包含空格。'
  if ([...template].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159)
  })) {
    return '模板不能包含控制字符。'
  }

  const placeholderCount = template.split(QUERY_PLACEHOLDER).length - 1
  if (placeholderCount !== 1) return '模板必须且只能包含一个 {query} 占位符。'

  const withoutQuery = template.replace(QUERY_PLACEHOLDER, '')
  if (withoutQuery.includes('{') || withoutQuery.includes('}')) {
    return '模板不能包含 {query} 以外的占位符。'
  }

  let parsed: URL
  try {
    parsed = new URL(template.replace(QUERY_PLACEHOLDER, 'search-query'))
  } catch {
    return '请输入完整、有效的搜索 URL 模板。'
  }
  if (parsed.protocol !== 'https:') return '自定义搜索模板必须使用 HTTPS。'
  if (parsed.username || parsed.password) return '自定义搜索模板不能包含用户名或密码。'
  return null
}

export function SearchEnginePanel() {
  const [engine, setEngine] = useState<SearchEngineId>('bing')
  const [customTemplate, setCustomTemplate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<number | undefined>(undefined)

  const applyConfig = (config: SearchEngineConfig) => {
    setEngine(config.engine)
    setCustomTemplate(config.customTemplate ?? '')
  }

  useEffect(() => {
    void loadSearchEngine()
      .then((config) => {
        setEngine(config.engine)
        setCustomTemplate(config.customTemplate ?? '')
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setStatus(`读取失败：${message}`)
      })
      .finally(() => setLoading(false))

    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
    }
  }, [])

  const customTemplateError = engine === 'custom'
    ? getCustomTemplateError(customTemplate)
    : null

  const handleSave = async () => {
    if (customTemplateError) {
      setStatus(customTemplateError)
      return
    }

    setSaving(true)
    setSaved(false)
    setStatus('')
    const validRememberedTemplate = getCustomTemplateError(customTemplate) === null
      ? customTemplate
      : null
    const requested: SearchEngineConfig = {
      engine,
      customTemplate: engine === 'custom' ? customTemplate : validRememberedTemplate,
    }

    try {
      const savedConfig = await saveSearchEngine(requested)
      applyConfig(savedConfig)
      if (engine === 'custom' && savedConfig.engine !== 'custom') {
        setStatus('自定义搜索模板未通过主进程校验，已恢复为返回的搜索设置。')
        return
      }

      setSaved(true)
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 1500)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`保存失败：${message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-section" aria-labelledby="search-engine-title">
      <h3 id="search-engine-title" className="settings-section-title">
        地址栏搜索
        {saved && <span className="settings-saved-flag">已保存</span>}
      </h3>

      <div className="settings-row">
        <label className="settings-label" htmlFor="search-engine-select">搜索引擎</label>
        <Select
          id="search-engine-select"
          className="settings-input settings-select"
          value={engine}
          disabled={loading || saving}
          onChange={(event) => {
            setEngine(event.target.value as SearchEngineId)
            setStatus('')
            setSaved(false)
          }}
        >
          <option value="bing">Bing</option>
          <option value="google">Google</option>
          <option value="baidu">Baidu</option>
          <option value="custom">自定义</option>
        </Select>
      </div>

      {engine === 'custom' && (
        <>
          <div className="settings-row">
            <label className="settings-label" htmlFor="custom-search-template">URL 模板</label>
            <Input
              id="custom-search-template"
              className="settings-input"
              type="url"
              value={customTemplate}
              disabled={loading || saving}
              aria-invalid={Boolean(customTemplateError)}
              aria-describedby={customTemplateError
                ? 'custom-search-template-help custom-search-template-error'
                : 'custom-search-template-help'}
              placeholder="https://example.com/search?q={query}"
              onChange={(event) => {
                setCustomTemplate(event.target.value)
                setStatus('')
                setSaved(false)
              }}
            />
          </div>
          <div id="custom-search-template-help" className="settings-row settings-hint-text">
            使用 HTTPS，并用一个 {'{query}'} 占位符表示搜索内容。
          </div>
          {customTemplateError && (
            <div id="custom-search-template-error" className="settings-row settings-error-text" role="alert">
              {customTemplateError}
            </div>
          )}
        </>
      )}

      <div className="settings-row">
        <Button
          variant="primary"
          disabled={loading || saving || Boolean(customTemplateError)}
          onClick={() => void handleSave()}
        >
          {loading ? '读取中...' : saving ? '保存中...' : '保存搜索设置'}
        </Button>
      </div>

      {status && (
        <div className="settings-row settings-error-text" role="alert" aria-live="polite">
          {status}
        </div>
      )}
    </section>
  )
}

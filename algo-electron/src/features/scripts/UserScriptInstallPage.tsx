import { useEffect, useMemo, useState } from 'react'
import { Button, Icon, Skeleton } from '../../components/ui'
import {
  cancelRemoteUserScriptInstall,
  confirmRemoteUserScriptInstall,
  getRemoteUserScriptInstallPreview,
  getPendingUserScriptInstall,
} from '../../hooks/browserShellApi'

interface UserScriptInstallPageProps {
  installId: string
  onClose: () => void
}

export function UserScriptInstallPage({ installId, onClose }: UserScriptInstallPageProps) {
  const [request, setRequest] = useState<PendingUserScriptInstall | null | undefined>(undefined)
  const [preview, setPreview] = useState<UserScriptInstallPreview | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void getPendingUserScriptInstall(installId).then((value) => {
      if (!active) return
      setRequest(value)
      if (!value) {
        setPreview(null)
        return
      }
      return getRemoteUserScriptInstallPreview(installId).then((nextPreview) => {
        if (active) setPreview(nextPreview)
      })
    }).catch(() => {
      if (active) {
        setRequest(null)
        setPreview(null)
        setError('读取远程脚本失败，请稍后重试。')
      }
    })
    return () => { active = false }
  }, [installId])

  const sourceOrigin = useMemo(() => {
    if (!request) return ''
    try {
      return new URL(request.sourceUrl).origin
    } catch {
      return ''
    }
  }, [request])

  const finalOrigin = useMemo(() => {
    if (!preview) return ''
    try { return new URL(preview.finalUrl).origin }
    catch { return '' }
  }, [preview])

  const finish = async (action: UserScriptInstallAction) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await confirmRemoteUserScriptInstall(installId, action)
      if (!result) throw new Error('安装请求已过期或不可用。')
      if (result.status === 'stale') {
        setPreview(undefined)
        const nextPreview = await getRemoteUserScriptInstallPreview(installId)
        setPreview(nextPreview)
        setError('本地脚本状态已变化，安装信息已刷新，请重新确认。')
        setBusy(false)
        return
      }
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  const cancelAndClose = async () => {
    await cancelRemoteUserScriptInstall(installId).catch(() => false)
    onClose()
  }

  if (request === undefined) {
    return (
      <div className="modal-loading">
        <Skeleton rows={3} className="route-loading-skeleton" label="正在读取安装请求" />
      </div>
    )
  }

  const riskyOverwrite = preview?.action === 'update'
    && (preview.versionComparison === 'older' || preview.versionComparison === 'unknown')
  const installLabel = preview?.versionComparison === 'older'
    ? '仍然降级'
    : preview?.action === 'update'
      ? '确认更新'
      : '安装脚本'

  return (
    <section className="script-install-page" aria-labelledby="script-install-title">
      <header className="script-install-header">
        <Icon name="code" size={24} className="scripts-title-icon" />
        <div>
          <h1 id="script-install-title">安装用户脚本</h1>
          <p>{preview ? '已完成来源、metadata 与外部资源校验，确认后才会写入本地。' : '正在读取远程脚本并校验安装信息。'}</p>
        </div>
      </header>

      {request ? (
        <dl className="script-install-details">
          <div>
            <dt>文件名</dt>
            <dd>{request.sourceFileName}</dd>
          </div>
          {preview && <div><dt>脚本名称</dt><dd>{preview.name}</dd></div>}
          {preview && <div><dt>身份空间</dt><dd>{preview.namespace || '空 namespace'}</dd></div>}
          <div>
            <dt>来源</dt>
            <dd>{sourceOrigin}</dd>
          </div>
          <div>
            <dt>地址</dt>
            <dd className="script-install-url">{request.sourceUrl}</dd>
          </div>
          {preview && (
            <>
              {preview.finalUrl !== request.sourceUrl && (
                <div>
                  <dt>最终来源</dt>
                  <dd className="script-install-url">{finalOrigin} · {preview.finalUrl}</dd>
                </div>
              )}
              <div>
                <dt>版本变化</dt>
                <dd>{preview.installedVersion || '未安装'} → {preview.version || '未声明'}（{preview.versionComparison}）</dd>
              </div>
              <div><dt>匹配规则</dt><dd>{[...preview.matches, ...preview.includes].join(', ') || '未声明'}</dd></div>
              <div><dt>排除规则</dt><dd>{[...preview.excludeMatches, ...preview.excludes].join(', ') || '无'}</dd></div>
              <div><dt>授权 API</dt><dd>{preview.grants.length ? preview.grants.join(', ') : '无'}</dd></div>
              <div><dt>联网域</dt><dd>{preview.connects.length ? preview.connects.join(', ') : '无'}</dd></div>
              <div><dt>附加功能</dt><dd>{preview.antifeatures.length ? preview.antifeatures.join(', ') : '无'}</dd></div>
              <div><dt>更新地址</dt><dd className="script-install-url">{preview.updateURL || preview.downloadURL || preview.finalUrl}</dd></div>
              <div><dt>外部资源</dt><dd>{preview.requires} 个依赖，{preview.resources.length} 个资源</dd></div>
            </>
          )}
        </dl>
      ) : (
        <p className="scripts-error" role="alert">
          此安装请求已取消、过期或不可用。没有脚本被安装。
        </p>
      )}

      {error && <p className="scripts-error" role="alert">{error}</p>}
      <div className="script-install-actions">
        {preview && (
          <Button
            variant={riskyOverwrite ? 'secondary' : 'primary'}
            disabled={busy}
            onClick={() => void finish('install')}
          >
            {installLabel}
          </Button>
        )}
        {preview?.action === 'update' && <Button variant="secondary" disabled={busy} onClick={() => void finish('copy')}>另存为本地副本</Button>}
        <Button variant={preview && !riskyOverwrite ? 'ghost' : 'primary'} disabled={busy} onClick={() => void cancelAndClose()}>
          {request ? '取消并关闭' : '关闭标签'}
        </Button>
      </div>
    </section>
  )
}

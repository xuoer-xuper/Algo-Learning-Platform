import { useEffect, useMemo, useState } from 'react'
import { Button, Icon } from '../../components/ui'
import {
  cancelPendingUserScriptInstall,
  getPendingUserScriptInstall,
} from '../../hooks/browserShellApi'

interface UserScriptInstallPageProps {
  installId: string
  onClose: () => void
}

export function UserScriptInstallPage({ installId, onClose }: UserScriptInstallPageProps) {
  const [request, setRequest] = useState<PendingUserScriptInstall | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    void getPendingUserScriptInstall(installId).then((value) => {
      if (active) setRequest(value)
    }).catch(() => {
      if (active) setRequest(null)
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

  const cancelAndClose = async () => {
    await cancelPendingUserScriptInstall(installId).catch(() => false)
    onClose()
  }

  if (request === undefined) {
    return <div className="modal-loading" role="status">正在读取安装请求...</div>
  }

  return (
    <section className="script-install-page" aria-labelledby="script-install-title">
      <header className="script-install-header">
        <Icon name="code" size={24} className="scripts-title-icon" />
        <div>
          <h1 id="script-install-title">脚本安装尚未启用</h1>
          <p>当前阶段只拦截并核对安装来源，不会下载、解析或执行脚本。</p>
        </div>
      </header>

      {request ? (
        <dl className="script-install-details">
          <div>
            <dt>文件名</dt>
            <dd>{request.sourceFileName}</dd>
          </div>
          <div>
            <dt>来源</dt>
            <dd>{sourceOrigin}</dd>
          </div>
          <div>
            <dt>地址</dt>
            <dd className="script-install-url">{request.sourceUrl}</dd>
          </div>
        </dl>
      ) : (
        <p className="scripts-error" role="alert">
          此安装请求已取消、过期或不可用。没有脚本被安装。
        </p>
      )}

      <div className="script-install-boundary">
        完整的源码下载、metadata 校验、权限确认与安装流程将在 B6 实现。
      </div>
      <div className="script-install-actions">
        <Button variant="primary" onClick={() => void cancelAndClose()}>
          {request ? '取消并关闭' : '关闭标签'}
        </Button>
      </div>
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Button, ConfirmDialog, Empty, IconButton, Input, Skeleton } from '../../components/ui'
import {
  deleteSavedCredential,
  loadCookieSummaryForSite,
  loadCredentialSummaries,
  loadPrimaryCodeforcesAccount,
  loadSites,
  openCredentialLoginPage,
  renameCredential,
  syncCodeforcesRatingProfile,
} from './settingsApi'
import type { CodeforcesAccount } from './settingsTypes'
import type { SiteConfigView } from './siteManagementTypes'

interface CredentialsPageProps {
  onClose: () => void
}

interface CredentialSiteState {
  site: SiteConfigView
  credentials: CredentialSummary[]
  cookieSummary: CookieSafeSiteSummary | null
}

function loginUrlForSite(site: SiteConfigView): string {
  const homeUrl = site.homeUrl ?? `https://${site.domains[0] ?? ''}`
  const pattern = site.loginUrlPatterns?.find((value) => value.trim().length > 0)
  if (!pattern) return homeUrl
  const candidate = pattern.trim().replace(/\*.*$/u, '').replace(/\{[^}]+\}/gu, '') || '/'
  try {
    const url = /^https?:\/\//iu.test(candidate) ? new URL(candidate) : new URL(candidate, homeUrl)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : homeUrl
  } catch {
    return homeUrl
  }
}

function formatUsedAt(value: string | null): string {
  return value ? `最近使用 ${value.replace('T', ' ').slice(0, 16)}` : '尚未使用'
}

export function CredentialsPage({ onClose }: CredentialsPageProps) {
  const [siteStates, setSiteStates] = useState<CredentialSiteState[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<CredentialSummary | null>(null)
  const [ratingHandle, setRatingHandle] = useState('')
  const [ratingInfo, setRatingInfo] = useState<CodeforcesAccount | null>(null)
  const [ratingStatus, setRatingStatus] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const sites = await loadSites()
      const [credentials, cookieSummaries, account] = await Promise.all([
        loadCredentialSummaries(),
        Promise.all(sites.map(async (site) => {
          try { return [site.id, await loadCookieSummaryForSite(site.id)] as const }
          catch { return [site.id, null] as const }
        })),
        loadPrimaryCodeforcesAccount(),
      ])
      const cookieMap = new Map(cookieSummaries)
      setSiteStates(sites.map((site) => ({
        site,
        credentials: credentials.filter((credential) => credential.siteId === site.id),
        cookieSummary: cookieMap.get(site.id) ?? null,
      })))
      if (account) {
        setRatingHandle(account.handle)
        setRatingInfo(account)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '账户信息读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  const credentialCount = useMemo(
    () => siteStates.reduce((total, item) => total + item.credentials.length, 0),
    [siteStates],
  )

  const handleRename = async (credentialId: string) => {
    const name = editingName.trim()
    if (name.length > 128) {
      setStatus('账户名称不能超过 128 个字符')
      return
    }
    try {
      await renameCredential(credentialId, name)
      setEditingId(null)
      setEditingName('')
      await loadData()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '账户名称保存失败')
    }
  }

  const handleDelete = async (credentialId: string) => {
    try {
      await deleteSavedCredential(credentialId)
      await loadData()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '凭据删除失败')
    }
  }

  const handleRatingSync = async () => {
    if (!ratingHandle.trim()) {
      setRatingStatus('请输入 Codeforces Handle')
      return
    }
    setRatingStatus('同步中...')
    try {
      const { result, account } = await syncCodeforcesRatingProfile(ratingHandle.trim())
      if (!result.success) {
        setRatingStatus(`同步失败: ${result.error ?? '未知错误'}`)
        return
      }
      setRatingInfo(account)
      setRatingStatus(`已同步，最高 Rating ${result.peak ?? '-'}`)
    } catch (error) {
      setRatingStatus(error instanceof Error ? error.message : 'Rating 同步失败')
    }
  }

  return (
    <div className="settings-page credentials-page">
      <div className="settings-header">
        <div>
          <h2 className="settings-title">账户</h2>
          <div className="settings-hint-text">{credentialCount} 组已保存凭据，密码仅保存在系统安全存储中</div>
        </div>
        <IconButton icon="close" title="关闭" className="settings-close" onClick={onClose} />
      </div>

      <div className="settings-cols">
        <div className="settings-col">
          <div className="settings-section">
            <h3 className="settings-section-title">平台登录态</h3>
            {loading && <Skeleton rows={3} label="平台登录态读取中" />}
            {!loading && siteStates.length === 0 && <Empty compact>暂无站点配置</Empty>}
            <div className="site-list">
              {siteStates.map(({ site, credentials, cookieSummary }) => (
                <div key={site.id} className="site-item">
                  <div className="site-info">
                    <span className="site-name">{site.name}</span>
                    <span className="site-domains">
                      {cookieSummary?.has_cookies ? '已检测到持久登录态' : '未检测到登录 Cookie'} · {credentials.length} 组凭据
                    </span>
                  </div>
                  <div className="site-actions">
                    <Button size="sm" onClick={() => void openCredentialLoginPage(loginUrlForSite(site))}>打开登录页</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Rating 账户</h3>
            <div className="settings-row">
              <Input
                className="settings-input"
                value={ratingHandle}
                onChange={(event) => setRatingHandle(event.target.value)}
                placeholder="Codeforces Handle"
              />
              <Button variant="primary" onClick={() => void handleRatingSync()}>绑定并同步</Button>
            </div>
            {ratingStatus && <div className="sync-status">{ratingStatus}</div>}
            {ratingInfo && (
              <div className="sync-hint">{ratingInfo.handle} · 当前 {ratingInfo.current_rating ?? '-'} · 最高 {ratingInfo.peak_rating ?? '-'}</div>
            )}
          </div>
        </div>

        <div className="settings-col">
          <div className="settings-section">
            <h3 className="settings-section-title">保存的凭据</h3>
            {status && <div className="sync-status">{status}</div>}
            {credentialCount === 0 && !loading && <Empty compact>暂无保存的凭据</Empty>}
            <div className="site-list">
              {siteStates.flatMap(({ site, credentials }) => credentials.map((credential) => (
                <div key={credential.credentialId} className="site-item">
                  <div className="site-info">
                    <span className="site-name">{credential.displayName || credential.username}</span>
                    <span className="site-domains">{site.name} · {credential.username} · {formatUsedAt(credential.lastUsedAt)}</span>
                    {editingId === credential.credentialId && (
                      <div className="settings-row">
                        <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} placeholder="账户名称" />
                        <Button size="sm" variant="primary" onClick={() => void handleRename(credential.credentialId)}>保存</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>取消</Button>
                      </div>
                    )}
                  </div>
                  <div className="site-actions">
                    <IconButton
                      icon="edit"
                      title="重命名账户"
                      onClick={() => {
                        setEditingId(credential.credentialId)
                        setEditingName(credential.displayName ?? '')
                      }}
                    />
                    <IconButton icon="trash" title="删除凭据" danger onClick={() => setPendingDelete(credential)} />
                    <Button size="sm" onClick={() => void openCredentialLoginPage(loginUrlForSite(site))}>更新密码</Button>
                  </div>
                </div>
              )))}
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除凭据"
        description={pendingDelete ? `确定删除账户「${pendingDelete.displayName || pendingDelete.username}」保存的凭据？` : ''}
        danger
        confirmText="删除"
        onConfirm={() => {
          const credential = pendingDelete
          setPendingDelete(null)
          if (credential) void handleDelete(credential.credentialId)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

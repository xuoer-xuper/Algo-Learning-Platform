// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({
  loadSites: vi.fn(),
  loadCredentialSummaries: vi.fn(),
  loadPrimaryCodeforcesAccount: vi.fn(),
  renameCredential: vi.fn(),
  deleteSavedCredential: vi.fn(),
  openCredentialLoginPage: vi.fn(),
  syncCodeforcesRatingProfile: vi.fn(),
}))

vi.mock('../../src/features/settings/settingsApi', () => api)

import { CredentialsPage } from '../../src/features/settings/CredentialsPage'

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset())
  api.loadSites.mockResolvedValue([{
    id: 'codeforces', name: 'Codeforces', domains: ['codeforces.com'], homeUrl: 'https://codeforces.com', enabled: true,
    loginUrlPatterns: ['/enter'],
  }])
  api.loadCredentialSummaries.mockResolvedValue([{
    credentialId: 'credential-1', siteId: 'codeforces', username: 'alice', displayName: 'Primary', masked: '********',
    lastUsedAt: null, createdAt: 'now', updatedAt: 'now',
  }])
  api.loadPrimaryCodeforcesAccount.mockResolvedValue({ handle: 'alice', current_rating: 1400, peak_rating: 1500 })
  api.renameCredential.mockResolvedValue(null)
  api.deleteSavedCredential.mockResolvedValue(true)
  api.openCredentialLoginPage.mockResolvedValue('tab-1')
  api.syncCodeforcesRatingProfile.mockResolvedValue({ result: { success: true, peak: 1500 }, account: { handle: 'alice', current_rating: 1400, peak_rating: 1500 } })
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { getCookieSummaryForSite: vi.fn().mockResolvedValue({ has_cookies: true, domains: [] }) },
  })
})

afterEach(cleanup)

describe('CredentialsPage', () => {
  it('shows only masked account data and opens a new login tab for password updates', async () => {
    render(<CredentialsPage onClose={vi.fn()} />)

    expect(await screen.findByText('Primary')).not.toBeNull()
    expect(screen.getByText(/已检测到持久登录态/)).not.toBeNull()
    expect(document.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByText('secret')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '更新密码' }))
    expect(api.openCredentialLoginPage).toHaveBeenCalledWith('https://codeforces.com/enter')
  })

  it('renames inline and confirms destructive deletion through the shared dialog', async () => {
    render(<CredentialsPage onClose={vi.fn()} />)
    await screen.findByText('Primary')

    fireEvent.click(screen.getByRole('button', { name: '重命名账户' }))
    fireEvent.change(screen.getByPlaceholderText('账户名称'), { target: { value: '备用' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.renameCredential).toHaveBeenCalledWith('credential-1', '备用'))

    fireEvent.click(screen.getByRole('button', { name: '删除凭据' }))
    expect(screen.getByRole('alertdialog')).not.toBeNull()
    fireEvent.click(screen.getByTestId('confirm-ok'))
    await waitFor(() => expect(api.deleteSavedCredential).toHaveBeenCalledWith('credential-1'))
  })
})

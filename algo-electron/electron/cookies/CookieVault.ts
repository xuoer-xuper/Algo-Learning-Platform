import { session, Session } from 'electron'

export class CookieVault {
  private partition = 'persist:oj-main'

  private getSession(): Session {
    return session.fromPartition(this.partition)
  }

  async getCookiesByDomain(domain: string): Promise<Electron.Cookie[]> {
    return this.getSession().cookies.get({ domain })
  }

  async getCookiesForUrl(url: string): Promise<Electron.Cookie[]> {
    return this.getSession().cookies.get({ url })
  }

  async getCookieNamesByDomain(domain: string): Promise<string[]> {
    const cookies = await this.getCookiesByDomain(domain)
    return cookies.map((c) => c.name)
  }

  async hasSessionCookie(domain: string, sessionCookieNames: string[]): Promise<boolean> {
    const cookies = await this.getCookiesByDomain(domain)
    return sessionCookieNames.some((name) =>
      cookies.some((c) => c.name === name)
    )
  }
}

import { app } from 'electron'

export function configureChromiumCommandLine(): void {
  // Must run before app.whenReady(): avoids local proxy/firewall TLS failures on newer Chromium.
  app.commandLine.appendSwitch('disable-features', 'PostQuantumKyber,TLS13KeyExchangeMLKEM')

  // Cloudflare / Turnstile check navigator.webdriver very early during page startup.
  app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')

  // Do not add ignore-certificate-errors here. Global certificate bypass is detectable and unsafe.
}

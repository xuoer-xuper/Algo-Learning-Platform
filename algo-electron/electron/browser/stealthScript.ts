// Cloudflare Turnstile 检测修复脚本
// 通过 executeJavaScript 注入主世界，绕过 contextIsolation 隔离
// 每个页面加载完成后执行，修复自动化工具检测标志

export const STEALTH_SCRIPT = `
(function() {
  'use strict'
  // 1. navigator.webdriver —— 自动化工具标志
  // 在 C++ 层禁用 AutomationControlled 后应为 undefined/false，此处做兜底
  try {
    if (navigator.webdriver !== false) {
      Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true })
    }
  } catch (e) {}

  // 2. window.chrome —— 真正的 Chrome 有这个对象
  try {
    if (typeof window.chrome === 'undefined') {
      window.chrome = { runtime: {} }
    } else if (!window.chrome.runtime) {
      window.chrome.runtime = {}
    }
  } catch (e) {}

  // 3. navigator.plugins —— 自动化工具通常 plugins.length === 0
  try {
    if (navigator.plugins && navigator.plugins.length === 0) {
      const makePlugin = (name, desc, filename) => {
        const p = { name, description: desc, filename, length: 1 }
        try { Object.setPrototypeOf(p, Plugin.prototype) } catch (e) {}
        return p
      }
      const plugins = [
        makePlugin('Chrome PDF Plugin', 'Portable Document Format', 'internal-pdf-viewer'),
        makePlugin('Widevine Content Decryption Module', 'Widevine Content Decryption Module', 'widevinecdmadapter.dll'),
        makePlugin('Native Client module', '', 'internal-nacl-plugin'),
      ]
      Object.setPrototypeOf(plugins, PluginArray.prototype)
      Object.defineProperty(navigator, 'plugins', {
        get: () => plugins,
        configurable: true,
      })
    }
  } catch (e) {}

  // 4. navigator.languages —— 自动化工具可能缺失
  try {
    if (!navigator.languages || navigator.languages.length === 0) {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en'],
        configurable: true,
      })
    }
  } catch (e) {}

  // 5. hardwareConcurrency
  try {
    if (navigator.hardwareConcurrency < 2) {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 4,
        configurable: true,
      })
    }
  } catch (e) {}

  // 6. deviceMemory
  try {
    if (!navigator.deviceMemory) {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        configurable: true,
      })
    }
  } catch (e) {}

  // 7. Notification.permission —— Electron 默认 'default'，真实 Chrome 通常是 'default' 或 'denied'
  try {
    if (Notification.permission === 'default') {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'default',
        configurable: true,
      })
    }
  } catch (e) {}

  // 8. Permissions API —— 自动化工具行为异常
  try {
    const origQuery = navigator.permissions?.query
    if (origQuery && origQuery.toString().includes('[native code]')) {
      navigator.permissions.query = function(parameters) {
        if (parameters && parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, onchange: null })
        }
        return origQuery.call(this, parameters)
      }
    }
  } catch (e) {}

  // 9. WebGL vendor/renderer —— 自动化工具可能暴露真实信息
  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return 'Intel Inc.'
      if (parameter === 37446) return 'Intel Iris OpenGL Engine'
      return getParameter.call(this, parameter)
    }
  } catch (e) {}
})()
void 0
`
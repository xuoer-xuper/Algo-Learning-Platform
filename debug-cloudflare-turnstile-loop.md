# Debug: Cloudflare Turnstile 验证循环

## Status
[OPEN]

## Symptom
在 Electron 应用内访问 Cloudflare Turnstile 保护的页面：
- 点击验证框后可以交互
- 转圈后回到验证页面，无限循环
- 同一网络环境下，普通 Chrome 浏览器无需点击直接通过

## Environment
- OS: Windows
- Electron: 42.2.0 (Chrome 134)
- 浏览器视图：WebContentsView with contextIsolation=true, sandbox=true

## Hypotheses
1. `navigator.webdriver` 仍为 true：虽然设置了 `--disable-blink-features=AutomationControlled`，但可能未生效或页面加载时仍为 true
2. `navigator.userAgentData` / Client Hints 暴露 Electron：新版 Cloudflare 使用 Sec-CH-UA 和 navigator.userAgentData.brands 检测
3. `window.outerWidth/outerHeight` 或 `screen` 等硬件指纹异常：Electron 窗口尺寸与真实浏览器不同
4. 注入脚本执行时机太晚：Cloudflare 在 `did-finish-load` 前已经完成检测
5. Electron 渲染进程缺少某些 Chrome 组件（Widevine、Component Updater 等），导致 Turnstile 后端 token 验证失败

## Next Step
先添加运行时检测日志，验证上述假设。

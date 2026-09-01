import React from 'react'
import ReactDOM from 'react-dom/client'
import { RendererRoot } from './RendererRoot'
import { applyBrowserLayoutVariables } from './browserLayout'
import { installRendererErrorHandlers } from './rendererErrors'
import { DARK_COLOR_SCHEME_QUERY, installThemeAttribute } from './theme'
import './index.css'

const rootEl = document.getElementById('root')!
// 早于 React 挂载安装，否则首屏读取失败会落在监听器注册之前。
installRendererErrorHandlers(window)
applyBrowserLayoutVariables(window.electronAPI.browserLayout, document.documentElement.style)
// 同理早于挂载：晚一步就会闪一帧浅色。窗口存活期内都要跟随，故不退订。
installThemeAttribute(window.matchMedia(DARK_COLOR_SCHEME_QUERY), document.documentElement)

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <RendererRoot />
  </React.StrictMode>,
)

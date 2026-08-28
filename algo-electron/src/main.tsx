import React from 'react'
import ReactDOM from 'react-dom/client'
import { RendererRoot } from './RendererRoot'
import { applyBrowserLayoutVariables } from './browserLayout'
import { installRendererErrorHandlers } from './rendererErrors'
import './index.css'

const rootEl = document.getElementById('root')!
// 早于 React 挂载安装，否则首屏读取失败会落在监听器注册之前。
installRendererErrorHandlers(window)
applyBrowserLayoutVariables(window.electronAPI.browserLayout, document.documentElement.style)

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <RendererRoot />
  </React.StrictMode>,
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import { RendererRoot } from './RendererRoot'
import { applyBrowserLayoutVariables } from './browserLayout'
import './index.css'

const rootEl = document.getElementById('root')!
applyBrowserLayoutVariables(window.electronAPI.browserLayout, document.documentElement.style)

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <RendererRoot />
  </React.StrictMode>,
)

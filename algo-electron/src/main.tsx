import React from 'react'
import ReactDOM from 'react-dom/client'
import { RendererRoot } from './RendererRoot'
import './index.css'

const rootEl = document.getElementById('root')!

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <RendererRoot />
  </React.StrictMode>,
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { CoachPet } from './features/coach/CoachPet'
import './index.css'

const rootEl = document.getElementById('root')!
// 桌宠透明窗口通过 hash 路由 #/coach-pet 分流，复用同一份 renderer bundle
const isCoachPet = window.location.hash.startsWith('#/coach-pet')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {isCoachPet ? <CoachPet /> : <App />}
  </React.StrictMode>,
)

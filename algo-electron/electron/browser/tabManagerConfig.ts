import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROWSER_LAYOUT } from './browserLayout'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const MAX_TABS = 16
export const MAX_CLOSED_TABS = 16
export const TOOLBAR_HEIGHT = BROWSER_LAYOUT.toolbarHeight
export const TABBAR_HEIGHT = BROWSER_LAYOUT.tabBarHeight
export const OJ_PRELOAD_PATH = process.env.ALGO_ELECTRON_SMOKE === '1'
  && process.env.ALGO_ELECTRON_SMOKE_OJ_PRELOAD_PATH
  ? process.env.ALGO_ELECTRON_SMOKE_OJ_PRELOAD_PATH
  : path.join(__dirname, 'ojPreload.mjs')

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const MAX_TABS = 8
export const TOOLBAR_HEIGHT = 42
export const TABBAR_HEIGHT = 36
export const OJ_PRELOAD_PATH = process.env.ALGO_ELECTRON_SMOKE_OJ_PRELOAD_PATH || path.join(__dirname, 'ojPreload.mjs')

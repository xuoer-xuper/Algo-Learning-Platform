import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const USER_SCRIPT_BOOTSTRAP_PRELOAD_PATH = process.env.ALGO_ELECTRON_SMOKE_USERSCRIPT_PRELOAD_PATH
  || path.join(__dirname, 'userscriptBootstrapPreload.mjs')

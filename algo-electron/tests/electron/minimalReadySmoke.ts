import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
const file = path.join(process.cwd(), 'tmp', `minimal-ready-${process.pid}.log`)
fs.appendFileSync(file, 'before\n')
setTimeout(() => { fs.appendFileSync(file, 'timeout\n'); app.exit(2) }, 5000)
await app.whenReady()
fs.appendFileSync(file, 'ready\n')
app.exit(0)

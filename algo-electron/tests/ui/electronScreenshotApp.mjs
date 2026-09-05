import { app, BrowserWindow } from 'electron'

const htmlPath = process.env.ALP_SCREENSHOT_HARNESS_HTML
const width = Number(process.env.ALP_SCREENSHOT_WINDOW_WIDTH || 1024)
const height = Number(process.env.ALP_SCREENSHOT_WINDOW_HEIGHT || 720)

if (!htmlPath) {
  throw new Error('ALP_SCREENSHOT_HARNESS_HTML is required')
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    frame: false,
    show: false,
    transparent: process.env.ALP_SCREENSHOT_TRANSPARENT === 'true',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      sandbox: false,
    },
  })

  globalThis.__ALP_SCREENSHOT_WINDOW__ = win

  await win.loadFile(htmlPath)
  win.show()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})

app.on('window-all-closed', () => app.quit())

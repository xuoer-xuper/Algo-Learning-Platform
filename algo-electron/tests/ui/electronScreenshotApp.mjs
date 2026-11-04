import { app, BrowserWindow, screen } from 'electron'

const htmlPath = process.env.ALP_SCREENSHOT_HARNESS_HTML
const width = Number(process.env.ALP_SCREENSHOT_WINDOW_WIDTH || 1024)
const height = Number(process.env.ALP_SCREENSHOT_WINDOW_HEIGHT || 720)

if (!htmlPath) {
  throw new Error('ALP_SCREENSHOT_HARNESS_HTML is required')
}

app
  .whenReady()
  .then(async () => {
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

    if (process.env.ALP_SCREENSHOT_TRANSPARENT === 'true') {
      // CDP pointer input does not move the desktop cursor. Keep the latter out
      // of the native forwarding window instead of mixing two pointer sources.
      const cursor = screen.getCursorScreenPoint()
      const bounds = win.getBounds()
      const placements = screen.getAllDisplays().flatMap(({ workArea }) =>
        [workArea.x, workArea.x + workArea.width - bounds.width].flatMap((x) =>
          [workArea.y, workArea.y + workArea.height - bounds.height].map((y) => ({
            x,
            y,
            fits: bounds.width <= workArea.width && bounds.height <= workArea.height,
          })),
        ),
      )
      const placement = placements.find(
        ({ x, y, fits }) =>
          fits &&
          (cursor.x < x - 1 ||
            cursor.x > x + bounds.width ||
            cursor.y < y - 1 ||
            cursor.y > y + bounds.height),
      )
      if (!placement) throw new Error('No on-screen fixture position clear of the desktop cursor')
      win.setPosition(placement.x, placement.y)
    }

    globalThis.__ALP_SCREENSHOT_WINDOW__ = win
    globalThis.__ALP_SCREENSHOT_MOUSE_CAPTURE__ = { ignore: true, updates: 0 }

    await win.loadFile(htmlPath)
    win.show()
    win.focus()
    win.webContents.focus()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })

app.on('window-all-closed', () => app.quit())

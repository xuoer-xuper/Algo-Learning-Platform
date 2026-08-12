import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          define: {
            'process.env.ARK_DEMO_KEY': JSON.stringify(process.env.ARK_DEMO_KEY || ''),
          },
          build: {
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: [
        { input: 'electron/preload.ts' },
        { input: 'electron/browser/ojPreload.ts' },
      ],
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
})

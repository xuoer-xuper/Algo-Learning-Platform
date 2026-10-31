import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    // @shared 别名的渲染层运行时（三处接线之一，见 tsconfig.json 注释；vitest 侧在
    // vitest.config.ts 另配）。只作用于 renderer 构建/Dev server：main/preload 的子构建
    // 不继承这里的 resolve，主进程代码一律相对路径。
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
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
            rolldownOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: [
        { input: 'electron/preload.ts' },
        { input: 'electron/browser/ojPreload.ts' },
        { input: 'electron/scripts/userscriptBootstrapPreload.ts' },
      ],
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
})

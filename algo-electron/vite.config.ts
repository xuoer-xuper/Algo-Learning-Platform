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
              // 三个外部依赖都是主进程运行时才解析的包：better-sqlite3 带原生
              // 模块，electron-log 与 electron-store（经 conf）内部 require('electron')
              // ——打进 ESM 包会变成 "Dynamic require is not supported"。外置后由
              // Node 的 interop 在运行时加载（electron-builder 会把 dependencies
              // 里的包一起打包）。注意 string 条目按"说明符全等"匹配：logger 导入
              // 的是子路径 'electron-log/main'，写成 'electron-log' 永远配不上
              // （R2 构建实测被内联），子路径必须用正则或逐条列出。
              external: ['better-sqlite3', 'electron-store', /^electron-log(?:\/.+)?$/],
            },
          },
        },
      },
      preload: [
        // R3 起 shell preload 在 src/preload/index.ts（域分组 + typeof api）。
        // entryFileNames 钉住 `preload.mjs`：主进程 main.ts 按 __dirname/preload.mjs
        // 加载它，而插件默认按输入文件名（index.mjs）命名产物。
        {
          input: 'src/preload/index.ts',
          vite: {
            build: {
              rolldownOptions: {
                output: {
                  entryFileNames: 'preload.mjs',
                  chunkFileNames: 'preload.mjs',
                },
              },
            },
          },
        },
        { input: 'electron/browser/ojPreload.ts' },
        { input: 'electron/scripts/userscriptBootstrapPreload.ts' },
      ],
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
})

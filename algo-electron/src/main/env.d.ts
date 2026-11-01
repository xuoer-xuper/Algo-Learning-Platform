/*
 * 主进程的环境变量增强（自阶段 2 R2 起，原 `electron/electron-env.d.ts` 只剩这一段）。
 *
 * `APP_ROOT` / `VITE_PUBLIC` 由 vite-plugin-electron 注入，electron-vite 模板的
 * env.d.ts 约定保留这个 augmentation；`src/main/` 目录会在阶段 3 成为主进程的
 * 正式家（`main.ts` 等迁入后，本文件跟着变成 `src/main/env.d.ts` 的本位）。
 *
 * 跨进程域类型已收口到 `src/shared/types/*`；`Window.electronAPI` 的全局声明
 * 在定义它的 `electron/preload.ts`（阶段 2 R3 会以 `window.api: typeof api` 取代）。
 */

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
  }
}

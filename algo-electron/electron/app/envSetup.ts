import { app } from 'electron'

/*
 * Dev/prod 数据隔离（design §3、模板 backend/environment.md）。
 *
 * 为什么必须是独立模块：ESM 会把 import 提升到模块体之前求值，"在 main.ts 顶部
 * 就地 setPath"的副作用实际运行在所有 import 之后——而 config（electron-store）、
 * 日志、会话存储等模块初始化时就可能读 userData 路径。独立成模块并让它成为
 * main.ts 的第一个 import，这段副作用才严格先于其他模块执行。
 * 顺序由 tests/architecture/check-architecture.mjs 的 "main.ts wires envSetup as
 * its first import" 守卫强制。
 *
 * 优先级（显式 > 自动推导）：冒烟模式用 ALGO_ELECTRON_SMOKE_USER_DATA 指定一次性
 * 完整目录，main.ts 随后的 applyStartupSmokeUserDataPath 会原样覆写 userData；
 * 该变量存在时这里不加 -dev 后缀，避免后缀先落进 smoke 路径里。
 * 只影响开发者本机（!isPackaged）：打包版路径不变；开发首次启动是空库，属预期。
 */
if (!app.isPackaged && !process.env.ALGO_ELECTRON_SMOKE_USER_DATA) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

export {}

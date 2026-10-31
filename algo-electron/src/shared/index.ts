// 阶段 0 只建空导出占位：本文件是 @shared 别名（tsconfig paths / vite renderer
// resolve.alias / vitest alias 三处同步接线）的解析目标。跨进程共享内容在阶段 2 填充。
// 见 .trellis/tasks/09-17-phase-0-tooling-gates 的 prd.md R8 与 design.md §8。
export {}

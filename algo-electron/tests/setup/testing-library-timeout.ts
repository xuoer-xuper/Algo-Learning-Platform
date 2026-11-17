import { configure } from '@testing-library/dom'

// Testing Library 的 findBy*/waitFor 默认只轮询 1000ms，这个预算在本仓库的
// "覆盖率插桩（v8）+ pool: forks + fileParallelism" 组合下不够：
// tests/coach/coachMouseEventDedupe.test.ts 里等 "关闭对话" 按钮的那条断言，
// 单独跑 345ms 通过，全量跑要到 1157ms 才就绪，于是 pnpm test:all 长期因为超时变红——
// 同样的失败在换包管理器之前的 npm 依赖图上也能复现（基线上 2/2 失败）。
//
// 这里只放宽异步 UI 的轮询预算，不放松任何断言：真正的缺陷仍然会让断言在 5s 后失败，
// 只是不再让"机器负载"决定红的归属。
//
// 只对 jsdom 环境生效：node 环境的测试没有 DOM 可查，改了也没有意义。
if (typeof document !== 'undefined') {
  configure({ asyncUtilTimeout: 5000 })
}

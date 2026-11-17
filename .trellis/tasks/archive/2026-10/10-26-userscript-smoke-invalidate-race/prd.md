# 修复 userscript 运行时烟测的失效竞态

## Goal

userScriptRuntimeSmoke 的 /race 阶段在 advanceGeneration 后立即释放 hold.js,runtime:invalidate 消息与 DOMContentLoaded 存在事件循环竞态:v1-end 偶发泄漏到断言序列,导致 CI 间歇失败(本地 1/4 挂)。修复:给主世界运行时加 payload 门控的失效落地标记,烟测确定性等待标记后再释放 hold。诊断与实验证据见 `research/race-diagnosis.md`。

## Requirements

1. `userScriptMainWorldRuntime.ts`:`UserScriptMainWorldBuildInput` 与 `ExecutionPayload` 新增可选 `exposeInvalidationMarker?: boolean`;invalidate 处理器在该标记开启时向页面 globalThis 写入 `__algoUserScriptRuntimeInvalidated = <generation>`;标记关闭时不写任何页面全局(生产行为零变化)。
2. `userScriptCompiledCatalog.ts` 与 `userScriptRuntimeBridge.ts`:选项从桥接层透传到 runtime 构建(桥接 options 命名 `exposeInvalidationMarker`)。
3. `userScriptRuntimeSmoke.test.ts`:bridge 安装时开启标记;`advanceGeneration()` 后 `waitFor(executeJavaScript('globalThis.__algoUserScriptRuntimeInvalidated') === 1)` 再释放 hold;v2 reload 断言不受影响。
4. 单测补充(`tests/scripts/userScriptMainWorldRuntime.test.ts`):标记开启时 invalidate 写页面全局;默认关闭时不写。

## Acceptance Criteria

- [x] 根因修复:代际前进时保留 pending 记录;端口到达因代际不匹配被拒前,补发 runtime:invalidate(旧运行时保证收到失效通知)
- [x] `pnpm run typecheck`、`pnpm run lint` 全绿
- [x] `pnpm run test:unit` 全绿(1387/1387,新增 3 个用例)
- [x] `pnpm run test:electron` 连续 5 次全 PASS
- [x] 生产默认路径行为零变化(失效标记由 payload 门控,生产不传)
- [x] 不引入盲目 sleep;不改失效机制的异步投递模型

## Notes

- 明确不做:不改失效机制的异步投递模型(主进程→渲染进程的窗口期在产品层不可消除);不动 WebAuthn 守卫与握手协议。
- 变更边界:最小行为缺口是"失效落地在渲染进程侧不可观测";行为真正所在处是主世界 runtime 的 invalidate 处理器。

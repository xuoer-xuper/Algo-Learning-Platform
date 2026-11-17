# GitHub 同名 CI 检查集合独立复核

日期：2026-11-17（Asia/Shanghai）。基线 dev `e1171b27c884cd305fc85cb6622d33f0edbb1387`，
修复分支 `codex/release-ci-evidence`。只复核发行守卫、定向回归与同步说明；不修改产品代码、
版本、lockfile、打包输入或工作流。主会话负责合并及最终发行门。

## Findings (fixed)

实现者把 `checkAcceptedCi()` 的唯一数量假设改为“至少一个匹配，且每个匹配均为接受 SHA、
completed/success”。独立复核未发现需额外修改的局部问题。

真实保存的 GitHub 响应显示同一 dev SHA 下 push/PR 两套 suite（119105524838、119105466680）
各含两个成功的 required checks；`filter=latest` 不表示跨套件名称唯一。旧守卫因此误拒绝。
父会话的 `tmp/duplicate-ci-before.json` 明确用合成 merged PR 身份进入 source guard，
不是声称 PR 已合并。新逻辑保留分页、GitHub Actions 来源、名称、SHA、状态及结论全部约束。

## Findings (not fixed)

限定范围无遗留问题。这是检查集合解析纠正，不是忽略红色检查的豁免，也不是最终 master
验收或 publication 授权来源。

- 不选最大 ID、最新时间或任意一项绿色；同名匹配中任何失败、pending、错 SHA 均拒绝。
- 保持 GitHub `filter=latest`：历史重跑检查的筛选由 API 定义，代码不新增隐藏历史失败的筛选。
- 两分支各八种回归覆盖双套件成功、首/末失败、pending、错/缺 SHA、缺 required、仅其他 app；
  失败通过 draft 入口验证，断言未创建 local tag、remote tag 或 release。
- 独立注入保存的实际 dev 响应并拆为两页：成功通过；第二页失败、queued、空集、错 SHA、
  neutral、cancelled、timed_out、其他 app、null conclusion 均拒绝。PR/master 桥接仍为合成，
  未执行外部 API、tag、上传或公开。
- 与 d8b5620 相比，electron/src/build/public、package、lockfile、builder 和 Vite 输入无差异；
  不因此假称后续最终安装器字节相同，仍需最终构建/资产及安装证据。

## Verification

Node22.23.2 / pnpm12.8.1。独立运行结果：

- `pnpm run test:release`：84/84 通过。
- scoped ESLint：通过。
- 生产和测试 typecheck：通过。
- scoped Prettier、docs、diff 检查：通过。
- 上述实际响应/分页注入十种场景：全部符合预期。

没有执行 full/native/UI/build/installer 或 Git 写操作；不访问真实用户 profile。

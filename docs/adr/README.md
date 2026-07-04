# ADR 目录说明

## 1. 职责

`docs/adr/` 存放 Architecture Decision Records，用于记录已经做出的高影响或不可逆架构决策。ADR 解释“为什么这样做”，不替代当前任务状态、交接现场或模块 README。

## 2. 当前 ADR

当前实现程度：ADR 目录已建立索引 README，并包含以下关键决策文件：

- `0001-use-webcontentsview.md`：统一使用 `WebContentsView`，禁止继续扩展旧 `BrowserView`。
- `0002-cookie-vault.md`：CookieVault 作为本地一等能力及 Cookie 安全边界。
- `0003-event-log-and-analytics.md`：学习行为采用“原始事件日志 + 聚合统计表”的设计。

## 3. 新增规则

需要新增 ADR 的情况：

- 改变浏览器容器、Cookie 策略、数据库事件模型、提交监测写入边界等高影响设计。
- 引入难以回滚的存储格式、打包策略或安全边界。
- 多个方案都可行，但需要长期遵守某个取舍。

不需要新增 ADR 的情况：

- 普通 bug fix。
- 局部 UI 拆分。
- 不改变对外契约的小型 helper 重构。

## 4. 维护要求

- ADR 应写清背景、决策、影响和后续约束。
- ADR 不记录 Cookie、用户源码、完整请求体、本机数据库或可复用登录态。
- 新增 ADR 后同步 `docs/README.md`。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:docs
```

新增 ADR 后还应人工确认对应设计文档或模块 README 已引用该决策，避免 ADR 只存在于目录中而没有维护入口。

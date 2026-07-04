# Docs Tests 说明

## 1. 职责

`tests/docs/` 存放文档一致性检查。它不验证业务逻辑，而是把项目结构巩固后的文档规则转成可重复执行的本地和 CI 门槛。

## 2. 当前检查

`check-docs.mjs` 当前覆盖：

- Markdown 相对链接存在性检查。
- `src/`、`electron/`、`tests/` 根目录及其子目录 README 覆盖。
- `.github/`、`.github/ISSUE_TEMPLATE/`、`.github/workflows/` README 覆盖。
- `algo-electron/build/`、`algo-electron/public/` README 覆盖。
- `docs/adr/` README 覆盖。
- 上述 README 的内容质量检查：至少说明职责、当前实现或覆盖范围、封装入口或关键文件、边界规则和验证入口。
- `docs/README.md` 总索引覆盖检查：根目录长期 Markdown、`docs/` 设计/验收文档、ADR 和已纳入守卫的 README 必须能从总索引找到。
- Markdown 中的 `npm run <script>` 引用检查：真实脚本名必须存在于 `algo-electron/package.json`，`npm run test:*` 这类通配说明不作为具体脚本校验。

检查会跳过 `node_modules/`、`tmp/`、`release/`、`dist/` 和 `dist-electron/` 等生成目录。

## 3. 验证入口

```powershell
cd algo-electron
npm run test:docs
```

发布前使用：

```powershell
npm run test:all
```

## 4. 维护边界

- 新增长期维护目录时，应先补 README，再把目录加入 `check-docs.mjs` 的覆盖目标。
- README 不能只写目录存在原因；必须写清职责、当前实现或覆盖范围、封装入口或关键文件、边界规则和验证入口。
- 新增长期 Markdown 或被覆盖目录 README 后，必须同步 `docs/README.md`，保持总索引可导航。
- 新增或改名 npm script 后，必须同步相关文档；文档里不要引用不存在的 `npm run` 命令。
- 新增文档链接时优先使用相对路径，保持本脚本可验证。
- 不把 Cookie、用户源码、完整请求体、本机数据库或可复用登录态写入文档示例。

# Security Tests 说明

## 1. 职责

`tests/security/` 存放仓库级敏感文件和高置信敏感文本检查。它不替代人工安全审查，但能防止最常见的 `.env`、本地数据库、日志和 Cookie/header 明文材料进入可提交文件。

## 2. 当前检查

`check-sensitive-files.mjs` 当前覆盖：

- 使用 `git ls-files --cached --others --exclude-standard` 只检查 tracked 和未忽略的新增文件。
- 禁止提交 `.env`、`.env.*`。
- 禁止提交 `.sqlite`、`.sqlite3`、`.db`。
- 禁止提交 `.log`。
- 检查高置信的 `Cookie:`、`Set-Cookie:`、`Authorization: Bearer ...`、常见 session/csrf token 赋值模式。

检查不会因为文档中普通描述 `Cookie`、`session`、`csrf token` 等词汇而失败。

## 3. 验证入口

```powershell
cd algo-electron
npm run test:security
```

发布前使用：

```powershell
npm run test:all
```

## 4. 维护边界

- 新增敏感文件类型时，同步本检查、`docs/GOVERNANCE/SECURITY.md` 和 `.gitattributes`。
- 不要把真实 Cookie、用户源码、完整请求体、本机数据库或可复用登录态写入测试 fixture。
- 本检查只覆盖仓库文件；运行时日志、截图、安装包内容仍需按 `docs/OPERATIONS/RELEASE_PROCESS.md` 人工验收。

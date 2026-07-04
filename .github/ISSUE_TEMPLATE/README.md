# Issue 模板说明

## 1. 职责

本目录存放 GitHub issue forms，用于收集普通缺陷和提交监测专项问题。模板只负责收集安全、可复现的信息，不定义任务状态或修复方案。

## 2. 模板

当前实现程度：本目录使用 GitHub issue forms YAML 文件承接问题入口，关键文件如下：

- `bug_report.yml`：浏览器、多标签、题目、统计、笔记、设置、用户脚本、数据库和打包等普通缺陷。
- `submission_monitoring.yml`：Codeforces、AcWing、Nowcoder、VJudge、PTA、Luogu、LeetCode 和自定义站点的实时提交或同步问题。
- `config.yml`：关闭空白 issue，避免缺少复现信息和敏感信息确认。

## 3. 信息边界

模板必须持续要求用户不要上传：

- Cookie、session、csrf token 或可复用登录态。
- 用户源码、完整请求体或本机数据库内容。
- 绝对隐私路径、账号敏感信息或站点风控绕过细节。

提交监测问题只应收集公开题目 URL、动作类型、预期结果、实际结果和安全诊断文本。

## 4. 维护要求

新增问题类型时：

- 同步 `.github/README.md`、`CONTRIBUTING.md` 和 `docs/README.md`。
- 如果涉及提交监测，字段必须覆盖站点、页面 URL、动作类型、最终 verdict、语言、提交 ID、重复写入和自测误抓。
- 如果涉及发布或安装包，字段必须能关联 `docs/release-process.md` 和 `docs/final-acceptance-checklist.md`。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:docs
```

修改模板后还应在 GitHub 预览表单字段，确认必填项、下拉选项和敏感信息确认仍可读。

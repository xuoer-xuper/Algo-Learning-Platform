# 版本号规划

## 当前状况（2026-09-03）

- package.json: `1.1.0-beta.2`
- 最新 release: `v1.1.0-beta.2` (2026-07-13)
- 策略调整：跳过 1.1 正式版，直接发布 2.0 候选版（RC）

## 决策：承认历史，向前看

### 不改已发布的版本
- v2.0.0-beta.1/beta.2 保持不变（已发布，改了会造成混乱）
- 那是历史产物，接受它

### 从现在开始重新规划

#### 短期（当前开发阶段）
1. **v2.0.0-rc.1** - 第一个候选版本（即将发布）
   - 桌宠闪烁修复 ✅
   - CI 修复 ✅
   - 测试修复 ✅
   - 暗色模式 ✅
   - 设置页重构 ✅
   - 全应用 UI 统一（骨架屏、空状态、动效、无障碍）✅
   - 补全 CHANGELOG

2. **v2.0.0-rc.2/rc.3...** - 根据测试反馈迭代
   - 真实使用场景测试
   - bug 修复
   - 体验调教
   - 文档完善

#### 中期（正式发布）
3. **v2.0.0** - 正式版
   - RC 版本稳定后发布
   - 包含 AI Coach + 暗色模式 + UI 重构
   - 完整文档和发布说明

### 语义化版本承诺（从 1.1.0 开始严格执行）

```
主版本号.次版本号.修订号

- 主版本号：不兼容的 API 修改、架构重构
- 次版本号：向后兼容的功能性新增
- 修订号：向后兼容的问题修正
```

## 发版流程（立即生效）

### 1. 版本号更新
```bash
cd algo-electron
npm version [major|minor|patch] -m "chore: bump version to %s"
# 这会同时更新 package.json、package-lock.json 并创建 git tag
```

### 2. CHANGELOG 更新
- 将 `docs/PRODUCT/CHANGELOG.md` 的"未发布"内容移到新版本标题下
- 保留新的空"未发布"段

### 3. 验证与打包
```bash
npm run test:all
npm run build:win
```

### 4. 发布
```bash
git push && git push --tags
gh release create v版本号 release/版本号/*.exe --title "Algo Learning Platform v版本号" --notes-file release/版本号/RELEASE_NOTES.md
```

### 5. 更新项目文档
- README.md 的版本徽章
- OPERATIONS/RELEASE_PROCESS.md 的最新发布记录

## 近期 Roadmap

- [ ] v2.0.0-rc.1（本周）- 第一个候选版本，补全 CHANGELOG 和文档
- [ ] v2.0.0-rc.2/rc.3...（1-2 周）- 根据真实使用测试反馈迭代
- [ ] v2.0.0（TBD）- 正式版发布

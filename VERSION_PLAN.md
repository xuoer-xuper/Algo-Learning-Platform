# 版本号规划

## 当前状况（2026-09-03）

- package.json: `2.0.0-beta.2`
- 最新 release: `v2.0.0-beta.2` (2026-07-13)
- 问题：AI Coach 功能被标记为 2.0，但实际不值得大版本号

## 决策：承认历史，向前看

### 不改已发布的版本
- v2.0.0-beta.1/beta.2 保持不变（已发布，改了会造成混乱）
- 那是历史产物，接受它

### 从现在开始重新规划

#### 短期（当前 beta 阶段完成）
1. **v2.0.0-beta.3** - 修复当前已知 bug + 文档完善
   - 桌宠闪烁修复（已完成）
   - CI 修复（已完成）
   - 测试修复（已完成）
   - CHANGELOG 补全

2. **v1.1.0** - AI Coach 正式版
   - 将 2.0.0-beta.x 的 AI Coach 功能稳定化
   - 语义：1.0 之后的第一个功能增强
   - 承认：这本该叫 1.1，那就让它成为 1.1

#### 中期（大重构）
3. **v2.0.0** - 架构重构
   - 你说的"真正的 2.0"
   - 大规模架构改动、breaking changes
   - 这才配得上 2.0

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

- [ ] v2.0.0-beta.3（本周）- bug 修复 + 文档完善
- [ ] v1.1.0（2 周内）- AI Coach 稳定版
- [ ] v2.0.0（TBD）- 架构重构

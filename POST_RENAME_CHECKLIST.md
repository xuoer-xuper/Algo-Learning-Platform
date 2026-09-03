# GitHub Release 改名后的本地清理清单

## 你在 GitHub 上改完后，回来执行：

### 1. 删除本地旧 tag
```bash
cd D:/Algo-Learning-Platform
git tag -d v2.0.0-beta.1 v2.0.0-beta.2
```

### 2. 拉取新 tag
```bash
git fetch --tags --force
```

### 3. 更新 package.json 版本号
```bash
cd algo-electron
# 手动改或者用这个：
npm version 1.1.0-beta.2 --no-git-tag-version
```

### 4. 更新 CHANGELOG.md
将 `docs/PRODUCT/CHANGELOG.md` 中的：
- `## 2.0.0-beta.2` → `## 1.1.0-beta.2`

### 5. 提交本地修改
```bash
git add -A
git commit -m "chore: 统一版本号为 1.1.0-beta.2，修正之前错误的 2.0 标记"
git push
```

## 完成后验证
```bash
git tag -l "v1.*"        # 应该看到 v1.0.0, v1.1.0-beta.1, v1.1.0-beta.2
git tag -l "v2.*"        # 应该为空（或者只有以后的真正 v2.0.0）
```

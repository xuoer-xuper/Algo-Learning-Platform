# Coach 样式

## 1. 职责

`src/features/coach/styles/` 存放 Coach 渲染层的 CSS 样式文件，负责桌宠视觉与气泡的动画、配色与布局。

## 2. 当前实现程度

- `pet.css`：6 状态 keyframes 动画 + CSS 变量切换 + 几何体/粒子环/发光描边样式。
- `bubble.css`：气泡深色背景 + 描边发光 + 按钮样式 + 自动消失动画。

## 3. 关键文件

- `pet.css`：定义 `--pet-primary` / `--pet-secondary` 等 CSS 变量，每状态对应一组配色与动画。
- `bubble.css`：气泡容器、标题、消息、来源标签、等级标签、按钮的样式。

## 4. 边界规则

- 配色保持冷感青蓝/紫，非萌系。
- 不内联样式，统一在 CSS 文件中维护。
- 样式变更需同步检查 6 状态视觉效果。

## 5. 验证入口

```powershell
cd algo-electron
npm run typecheck
npm run lint
```

运行时手动验证：启动应用后切换 6 状态观察配色与动画差异。

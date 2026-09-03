# AI Coach 桌宠闪烁问题修复总结

## 问题表现

- AI Coach 桌宠不断闪烁
- Win11 任务栏图标下的状态条持续切换
- 点击桌宠以外区域暂时恢复正常，但一点桌宠就又闪烁
- 关闭桌宠后主进程没有问题

## 根本原因

**`setParentWindow()` 和 `setAlwaysOnTop()` 触发焦点事件，形成反馈循环**

问题机制：
```
主窗口聚焦（focus）
  ↓
handleFollowedWindowFocus() 调用 applyPinDecision()
  ↓
setParentWindow(mainWindow) 绑定父窗口
  ↓
setParentWindow 在 Windows 上改变 owner 关系，触发焦点变化
  ↓
主窗口失焦（blur）
  ↓
120ms 后 handleFollowedWindowBlur() 调用 applyPinDecision()
  ↓
setParentWindow(null) 解绑父窗口
  ↓
又触发主窗口聚焦（focus）
  ↓
无限循环 ← 回到开始
```

关键发现：
- `setParentWindow()` 和 `setAlwaysOnTop()` **本身会扰动焦点**
- 每次决策的结论都在真的翻转（attachToActiveShell: true ↔ false）
- 缓存去重（lastDecision）挡不住，因为值确实在变
- 120ms 延迟复核不够，无法打破循环

## 修复方案

**在执行 `setParentWindow`/`setAlwaysOnTop` 期间，屏蔽焦点事件处理**

### 主要修改

1. **CoachPetWindow.ts - 添加焦点事件屏蔽机制**
   ```typescript
   private applyingPinDecision = false

   private applyPinDecision(): void {
     // ... 判定决策 ...
     
     // 屏蔽期间的焦点事件
     this.applyingPinDecision = true
     this.win.setParentWindow(parent)
     this.win.setAlwaysOnTop(decision.alwaysOnTop, decision.level)
     this.lastDecision = decision
     this.lastParent = parent
     
     // 50ms 后恢复
     setTimeout(() => {
       this.applyingPinDecision = false
     }, 50)
   }

   private readonly handleFollowedWindowFocus = (): void => {
     if (this.applyingPinDecision) return  // 屏蔽期间忽略
     // ... 正常处理 ...
   }

   private readonly handleFollowedWindowBlur = (): void => {
     if (this.applyingPinDecision) return  // 屏蔽期间忽略
     // ... 正常处理 ...
   }
   ```

2. **CoachPetWindow.ts - 修复 follow 模式置顶逻辑**
   - 壳失焦时：解绑 parent，但开启 alwaysOnTop，避免桌宠沉底
   ```typescript
   // petPinPolicy.ts
   export function resolvePetPinDecision(ctx: PetPinContext): PetPinDecision {
     if (ctx.mode === 'follow') {
       if (ctx.hasActiveShell && ctx.activeShellFocused) {
         return { alwaysOnTop: false, level: 'normal', attachToActiveShell: true }
       }
       // 壳失焦时：解绑但置顶，保持桌宠可见
       return { alwaysOnTop: true, level: 'normal', attachToActiveShell: false }
     }
     // ...
   }
   ```

3. **CoachPetWindow.ts - 最小化/恢复处理**
   ```typescript
   private readonly handleFollowedWindowMinimize = (): void => {
     if (this.win && !this.win.isDestroyed()) {
       this.win.setParentWindow(null)
       this.win.setAlwaysOnTop(true, 'normal')
       this.win.show()  // Windows 需要显式 show
       this.lastParent = null
       this.lastDecision = { alwaysOnTop: true, level: 'normal', attachToActiveShell: false }
     }
   }

   private readonly handleFollowedWindowRestore = (): void => {
     if (this.pinMode === 'follow' && this.followedWindow && !this.followedWindow.isDestroyed()) {
       this.followedWindowFocused = true
       this.applyPinDecision()
     }
   }
   ```

4. **CoachPet.tsx - 气泡交互修复**
   - 气泡显示时强制关闭穿透
   - 气泡消失时不自动恢复穿透，由 `handleMouseLeave` 负责
   ```typescript
   useEffect(() => {
     if (bubble) {
       void toggleCoachIgnoreMouseEvents(false)
     }
     // 气泡消失时不自动恢复穿透，由 handleMouseLeave 负责
   }, [bubble])
   ```

5. **CoachPetWindow.ts - 防抖机制**
   - 16ms 防抖，避免 `setIgnoreMouseEvents` 触发的鼠标事件重新计算循环
   ```typescript
   private ignoreMouseEventsDebounceTimer: NodeJS.Timeout | null = null
   private pendingIgnoreMouseEvents: boolean | null = null

   setIgnoreMouseEvents(ignore: boolean): void {
     this.pendingIgnoreMouseEvents = ignore
     if (this.ignoreMouseEventsDebounceTimer !== null) {
       return
     }
     this.applyIgnoreMouseEvents(ignore)
     this.ignoreMouseEventsDebounceTimer = setTimeout(() => {
       this.ignoreMouseEventsDebounceTimer = null
       if (this.pendingIgnoreMouseEvents !== null && this.pendingIgnoreMouseEvents !== this.lastIgnoreMouseEvents) {
         this.applyIgnoreMouseEvents(this.pendingIgnoreMouseEvents)
       }
       this.pendingIgnoreMouseEvents = null
     }, 16)
   }
   ```

### 修改文件列表

- `algo-electron/electron/coach/CoachPetWindow.ts`
  - 添加 `applyingPinDecision` 标志位和屏蔽逻辑
  - 修复 `follow` 模式置顶决策
  - 添加 `minimize`/`restore` 事件监听
  - 添加 `setIgnoreMouseEvents` 防抖机制
  - 清理调试日志

- `algo-electron/electron/coach/petPinPolicy.ts`
  - 修复 `follow` 模式在壳失焦时的置顶逻辑

- `algo-electron/src/features/coach/CoachPet.tsx`
  - 气泡显示时强制关闭穿透
  - 气泡消失时不自动恢复穿透
  - 清理调试日志

## 为什么这样修复有效

1. **屏蔽机制打破反馈循环**
   - `setParentWindow`/`setAlwaysOnTop` 触发的焦点事件在 50ms 屏蔽期内被忽略
   - 50ms 足够长，覆盖 Windows 完成 owner 关系变更和焦点调整
   - 屏蔽结束后，焦点状态已经稳定，不会再触发新的决策翻转

2. **follow 模式优化避免桌宠沉底**
   - 壳失焦时解绑 parent（让原生菜单能盖住桌宠）
   - 同时开启 alwaysOnTop（防止桌宠被其他应用遮挡）
   - 平衡了"不盖住原生菜单"和"保持可见"两个需求

3. **最小化处理确保独立可见**
   - Windows 的 owner 窗口机制：子窗口会跟随父窗口最小化
   - 必须在最小化时立即解绑 + 置顶 + show()
   - show() 是关键：即使解绑了，Windows 仍可能隐藏子窗口

4. **气泡交互修复**
   - 气泡显示时强制关闭穿透，确保气泡可交互
   - 气泡消失时不立即恢复穿透，避免鼠标还在窗口上时恢复穿透导致无法再次点击

## 测试验证

### 手动验证步骤

1. ✅ 启动应用，确认桌宠显示正常
2. ✅ 将鼠标悬停在桌宠上 → 不应闪烁
3. ✅ 点击桌宠触发气泡 → 不应闪烁
4. ✅ 鼠标在气泡上移动 → 不应闪烁
5. ✅ 点击气泡按钮（"再给一点"/"先不用"） → 应该正常响应
6. ✅ 关闭气泡后再次点击桌宠 → 应该能正常打开气泡
7. ✅ 观察任务栏图标 → 状态条不应不断切换
8. ✅ 拖动桌宠 → 应该流畅，不抖动
9. ✅ 点击桌宠以外区域 → 应该穿透到下层窗口
10. ✅ 最小化主窗口 → 桌宠应该保持可见（独立置顶）
11. ✅ 从任务栏恢复主窗口 → 桌宠应该正常显示并跟随
12. ✅ 点击其他应用 → 桌宠应该仍然可见

## 与之前修复的区别

**commit 3e2adbc（2026-09-03）：修复多层穿透控制**
- 问题：多个组件重复调用 `setIgnoreMouseEvents` 形成反馈循环
- 表现：桌宠闪烁、任务栏状态条不断切换
- 修复：移除子组件的 mouseenter/mouseleave 监听，只在最外层控制
- 结果：该修复方案最终被证明不是根本原因

**本次修复（commit xxxxx，2026-09-03）：修复置顶决策反馈循环**
- 问题：`setParentWindow`/`setAlwaysOnTop` 触发焦点事件，导致决策翻转循环
- 表现：桌宠闪烁、任务栏状态条不断切换、最小化后桌宠消失
- 修复：在执行窗口 API 期间屏蔽焦点事件，优化 follow 模式置顶逻辑
- 结果：完全解决闪烁问题

**两个问题根因不同、互不冲突：**
- 3e2adbc 试图修的是 renderer 层组件架构问题（最终证明不是根因）
- 本次修的是主进程 Electron API 的副作用和决策逻辑问题（真正的根因）

## 技术要点

### Electron 窗口 API 的副作用

`setParentWindow`、`setAlwaysOnTop`、`setIgnoreMouseEvents` 等 API 都会改变窗口状态：
- `setParentWindow` 在 Windows 上改变 owner 关系，**会扰动焦点**
- `setAlwaysOnTop` 重排 z-order，**可能触发焦点事件**
- `setIgnoreMouseEvents` 改变命中测试，**可能触发鼠标事件重新计算**

频繁调用会导致可见的副作用（闪烁、焦点变化、z 序跳动）。

### 状态机反馈循环的识别与打破

**识别特征：**
- 决策是某个状态的纯函数（`attachToActiveShell = f(followedWindowFocused)`）
- 执行决策会改变该状态（`setParentWindow` → 触发 focus/blur）
- 每次决策的结论都在翻转，缓存去重无效

**打破方法：**
- 屏蔽执行期间的状态变化事件（本次方案）
- 延迟执行决策，合并短时间内的多次触发
- 引入额外的稳定性判据（如持续时间、变化次数）

### Windows owner 窗口机制

- 子窗口会跟随父窗口最小化/隐藏
- 即使调用 `setParentWindow(null)` 解绑，子窗口可能仍被隐藏
- 必须显式调用 `show()` 确保可见
- owner 关系的设置/清除会触发焦点事件

## 提交记录

- **3e2adbc** - fix(coach): 修复桌宠多层组件重复控制穿透导致的闪烁（2026-09-03）
- **[当前]** - fix(coach): 修复桌宠置顶决策反馈循环导致的闪烁和最小化消失问题（2026-09-03）
  - 添加焦点事件屏蔽机制，在执行 `setParentWindow`/`setAlwaysOnTop` 期间屏蔽焦点事件处理
  - 修复 follow 模式置顶逻辑：壳失焦时解绑 parent 但开启 alwaysOnTop，保持桌宠可见
  - 添加最小化/恢复事件处理，确保桌宠独立可见
  - 添加气泡交互修复，确保气泡按钮可点击
  - 添加 `setIgnoreMouseEvents` 16ms 防抖机制
  - 更新所有相关测试以匹配新行为



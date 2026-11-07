# 原生 UI 失败诊断验收

## 范围与原因

此前原生标签拖拽两次没有完成重排，另有一次窗口visible/focused前置条件失败；保留trace
但无pointer/capture/finishDrag记录，诊断重跑均通过，根因仍未定位。本切片只增加测试诊断，
不改生产组件、输入动作、断言/阈值、原生focus控制、超时/重试或hook。

## 实现

- `tests/ui/native-input-diagnostics.ts`：最多256条近期passive事件（上限1024），记录pointer/
  capture/DnD/focus；热路径不做geometry/style读取，也不额外await IPC。
- 记录fixture finishDrag输入及结果，保留this、参数、原promise/返回值和异常；拒绝观测
  会影响unhandledrejection bookkeeping，当前生产调用方已经catch，不宣称通用完全透明。
- 原生就绪和拖拽失败在关闭窗口前附JSON：renderer状态、独立native可见/聚焦/最小化/
  loading/cursor/bounds字段；采集与附件有界，失败仍抛原始错误。
- independent review修正诊断日志本身抛错覆盖原错误的问题并加回归。无虚假reorder、
  synthetic pointerup、重试或延时兜底。

## 验证

- 诊断器15/15单测：容量、无热路径布局读取、receiver/promise identity、同步/异步错误、
  cleanup/reinstall、不可写fixture方法、序列化eval、只读快照、附件错误/挂起/日志错误。
- 独立复核：与A2b组合6文件/54用例，两次typecheck/full lint/架构22/22/docs通过。
- 当前组合工作树 `pnpm test:all`：200文件/1702用例，真实Electron与UI11/11通过。
- `pnpm build:check`与jscpd1.76%通过。全部只访问合成fixture与临时库。
- 一次真实跨进程负向验证：实际helper打包后经page.evaluate安装，记录4次trusted pointermove；
  人工sentinel断言错误进入失败采集器后仍以同一对象抛出，renderer/native字段和JSON在关闭
  fixture前完整取得。证据为忽略目录`tmp/native-input-diagnostics-check.{json,log}`。

本次通过证明新增诊断不会阻断正常测试，不证明历史原生输入失败根因已解决。若再失败，
用新附件判断是哪一层出错，不无限重跑整门碰绿。日志在忽略目录`algo-electron/tmp/`。

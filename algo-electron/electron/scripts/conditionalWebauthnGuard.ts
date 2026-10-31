/**
 * WebAuthn 条件式请求守卫（在页面主世界执行）。
 *
 * 洛谷等站点的登录页会在页面加载时立即发起 `mediation: 'conditional'` 的
 * 通行密钥预查询（实测导航开始后约 0.6~3s）。Chrome 的条件式 UI 会静默挂起、
 * 等用户聚焦输入框才展示；Electron 不支持条件式 UI，会直接拉起 Windows
 * Hello 原生弹窗——用户看到的是"页面一加载就冒出 Windows 的框"。
 *
 * 守卫把无用户手势的 conditional 调用按协议以 NotAllowedError 静默拒绝，
 * 页面回退到普通登录表单；最近 5 秒内有过可信用户手势（点击"通过通行
 * 密钥登录"等显式入口）则放行，显式通行密钥流程不受影响。
 *
 * 注意：本函数经 contextBridge.executeInMainWorld 序列化后在 document-start
 * 阶段执行（先于任何页面脚本），因此必须完全自包含——不得引用模块作用域
 * 的任何其他绑定。
 */
export function installConditionalWebauthnGuard(): void {
  const scope = globalThis as typeof globalThis & { __algoConditionalWebauthnGuard?: boolean }
  if (scope.__algoConditionalWebauthnGuard) return
  scope.__algoConditionalWebauthnGuard = true
  // 双重 as 在这里是刻意的：DOM 的 CredentialsContainer.get 返回
  // Promise<Credential | null>，与守卫的宽松签名求交会让赋值永不通过；
  // 守卫只需要“有个可调用的 get”，完全替换成宽松视图。
  const credentials = (
    navigator as unknown as {
      credentials?: { get: (options?: unknown) => Promise<unknown> } | undefined
    }
  ).credentials
  if (!credentials || typeof credentials.get !== 'function') return

  let lastUserGestureAt = -1e9
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (event.isTrusted) lastUserGestureAt = performance.now()
    },
    true,
  )
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.isTrusted) lastUserGestureAt = performance.now()
    },
    true,
  )

  const originalGet = credentials.get.bind(credentials)
  credentials.get = (options?: unknown) => {
    if (
      options &&
      typeof options === 'object' &&
      (options as { mediation?: unknown }).mediation === 'conditional' &&
      performance.now() - lastUserGestureAt > 5000
    ) {
      /*
       * 对齐 Chrome 的静默形态：条件式请求在用户交互前保持 pending、
       * 不决议。任何 rejection 都会被站点捕获当作错误展示（洛谷实测把
       * message toast 到页面右上角），"拒绝"从来不是安静的选择。
       * 唯一的出口是页面自己 abort（按协议给 AbortError）。
       */
      return new Promise((_resolve, reject) => {
        const signal = (options as { signal?: AbortSignal | undefined }).signal
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
          return
        }
        signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          },
          { once: true },
        )
      })
    }
    return originalGet(options)
  }
}

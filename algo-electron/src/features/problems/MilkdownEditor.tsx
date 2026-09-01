import { useEffect, useRef } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'
import { saveNoteImage } from './problemsApi'

interface Props {
  noteId: string
  initialValue: string
  onChange: (markdown: string) => void
  placeholder?: string
}

function toNoteAssetDomUrl(noteId: string, url: string): string {
  const normalized = url.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (!normalized || !normalized.startsWith('assets/')) return url
  if (normalized.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(normalized)) return url
  if (normalized.split('/').some((part) => part === '..')) return url

  const encodedPath = normalized
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')

  return `note-asset://local/${encodeURIComponent(noteId)}/${encodedPath}`
}

export function MilkdownEditor({ noteId, initialValue, onChange, placeholder }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 记录最新 markdown 与是否有未 flush 的修改，组件卸载时用于同步保存
  const latestMarkdownRef = useRef(initialValue)
  const pendingRef = useRef(false)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!containerRef.current) return
    if (crepeRef.current) return

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: initialValue,
      features: {
        [CrepeFeature.AI]: false,
        // B5.6（决策 D14）：开启数学公式。KaTeX 的 CSS 与那 1MB 字体本来就随
        // crepe 的 theme/common/style.css 一路 @import 进产物（latex.css →
        // katex/dist/katex.min.css），关着这个开关只是白背这份体积。
        [CrepeFeature.Latex]: true,
        // latex 硬依赖 CodeMirror（crepe 的 loadFeature 里直接抛
        // "You need to enable CodeMirror to use LaTeX feature"）。crepe 的
        // defaultFeatures 本来就把它设为 true，但那个值没有从包里导出（只在
        // .d.ts 里声明，运行时 undefined），测不到也读不到。与其依赖一个不可
        // 观察的默认值，这里显式写出来——升级 crepe 翻默认值时不会静默失效。
        [CrepeFeature.CodeMirror]: true,
        [CrepeFeature.ImageBlock]: true,
        [CrepeFeature.TopBar]: true,
        [CrepeFeature.Toolbar]: true,
        [CrepeFeature.BlockEdit]: false,
        [CrepeFeature.Cursor]: false,
        [CrepeFeature.LinkTooltip]: true,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: placeholder ?? '开始编写题解…（输入 ## 自动生成标题）',
        },
        [CrepeFeature.Latex]: {
          // 行内公式的确认按钮文案（默认是个勾图标，这里给中文标签对齐其余面板）
          inlineEditConfirm: '确认',
          // 写错的公式渲染成红字提示而不是抛异常——题解是一边写一边存的，
          // 半个公式的中间态必须能留在文档里。crepe 在块级预览与行内 toDOM
          // 两处已各自硬写 throwOnError:false，这里显式声明是为了让行内
          // 编辑气泡（唯一真正读 katexOptions 的地方）也走同一口径。
          // strict:false：题解里常见 `\R`、中文夹在公式中间这类写法，
          // 严格模式会刷一片 console 警告，但渲染结果本身是对的。
          katexOptions: {
            throwOnError: false,
            strict: false as const,
          },
        },
        [CrepeFeature.ImageBlock]: {
          blockUploadButton: '上传图片',
          blockUploadPlaceholderText: '或粘贴图片链接',
          blockCaptionPlaceholderText: '图片说明',
          blockConfirmButton: '确认',
          inlineUploadButton: '上传',
          inlineUploadPlaceholderText: '或粘贴图片链接',
          inlineConfirmButton: '确认',
          onUpload: async (file) => {
            const buffer = await file.arrayBuffer()
            return saveNoteImage(noteId, file.name, file.type, buffer)
          },
          proxyDomURL: (url) => toNoteAssetDomUrl(noteId, url),
        },
      },
    })

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown === prevMarkdown) return
        latestMarkdownRef.current = markdown
        pendingRef.current = true
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => {
          pendingRef.current = false
          debounceTimer.current = null
          onChangeRef.current(markdown)
        }, 400)
      })
    })

    crepe.create().catch((err) => {
      console.error('[MilkdownEditor] 初始化失败:', err)
    })

    crepeRef.current = crepe

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = null
      }
      // 卸载前 flush 未保存的修改，避免关闭/切换笔记时丢失最近 400ms 内的编辑
      if (pendingRef.current) {
        pendingRef.current = false
        try {
          onChangeRef.current(latestMarkdownRef.current)
        } catch { /* ignore */ }
      }
      crepe.destroy().catch(() => {})
      crepeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="milkdown-wrapper" ref={containerRef} />
  )
}

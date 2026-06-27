import { useEffect, useRef } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'

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
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return
    if (crepeRef.current) return

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: initialValue,
      features: {
        [CrepeFeature.AI]: false,
        [CrepeFeature.Latex]: false,
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
            const result = await window.electronAPI.saveNoteImage(noteId, file.name, file.type, buffer)
            return result.markdownUrl
          },
          proxyDomURL: (url) => toNoteAssetDomUrl(noteId, url),
        },
      },
    })

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown === prevMarkdown) return
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => {
          onChangeRef.current(markdown)
        }, 400)
      })
    })

    crepe.create().catch((err) => {
      console.error('[MilkdownEditor] 初始化失败:', err)
    })

    crepeRef.current = crepe

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      crepe.destroy().catch(() => {})
      crepeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="milkdown-wrapper" ref={containerRef} />
  )
}

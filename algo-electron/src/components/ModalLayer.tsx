import type { ReactNode } from 'react'

const TOOLBAR_HEIGHT = 42
const TABBAR_HEIGHT = 36
const BROWSER_TOP_OFFSET = TOOLBAR_HEIGHT + TABBAR_HEIGHT

interface ModalLayerProps {
  backdrop: string | null
  sidebarWidth: number
  onClose: () => void
  children: ReactNode
  size?: 'compact' | 'default' | 'large' | 'full'
}

export function ModalLayer({ backdrop, sidebarWidth, onClose, children, size = 'default' }: ModalLayerProps) {
  const previewStyle = {
    left: sidebarWidth,
    top: BROWSER_TOP_OFFSET,
    width: `calc(100% - ${sidebarWidth}px)`,
    height: `calc(100% - ${BROWSER_TOP_OFFSET}px)`,
  }

  const panelClass = `modal-panel modal-panel-${size}`

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {backdrop ? (
        <div
          className="modal-preview"
          style={{
            ...previewStyle,
            backgroundImage: `url(${backdrop})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'top left',
            backgroundRepeat: 'no-repeat',
          }}
        />
      ) : null}
      <div className="modal-overlay" />
      <div className="modal-workspace" style={previewStyle}>
        <div className={panelClass} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>
  )
}

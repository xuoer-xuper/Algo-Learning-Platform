import type { ReactNode } from 'react'

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
    top: 'var(--browser-top-offset)',
    width: `calc(100% - ${sidebarWidth}px)`,
    height: 'calc(100% - var(--browser-top-offset))',
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

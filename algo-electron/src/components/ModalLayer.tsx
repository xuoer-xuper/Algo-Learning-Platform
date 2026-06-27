import type { ReactNode } from 'react'

const TOOLBAR_HEIGHT = 42

interface ModalLayerProps {
  backdrop: string | null
  sidebarWidth: number
  onClose: () => void
  children: ReactNode
  size?: 'default' | 'large' | 'full'
}

export function ModalLayer({ backdrop, sidebarWidth, onClose, children, size = 'default' }: ModalLayerProps) {
  const previewStyle = {
    left: sidebarWidth,
    top: TOOLBAR_HEIGHT,
    width: `calc(100% - ${sidebarWidth}px)`,
    height: `calc(100% - ${TOOLBAR_HEIGHT}px)`,
  }

  const panelClass = size === 'full'
    ? 'modal-panel modal-panel-full'
    : size === 'large'
      ? 'modal-panel modal-panel-large'
      : 'modal-panel'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {backdrop ? (
        <img className="modal-preview" src={backdrop} alt="" style={previewStyle} />
      ) : null}
      <div className="modal-overlay" />
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

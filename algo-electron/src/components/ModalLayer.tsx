import type { ReactNode } from 'react'

const TOOLBAR_HEIGHT = 42

interface ModalLayerProps {
  backdrop: string | null
  sidebarWidth: number
  onClose: () => void
  children: ReactNode
}

export function ModalLayer({ backdrop, sidebarWidth, onClose, children }: ModalLayerProps) {
  const previewStyle = {
    left: sidebarWidth,
    top: TOOLBAR_HEIGHT,
    width: `calc(100% - ${sidebarWidth}px)`,
    height: `calc(100% - ${TOOLBAR_HEIGHT}px)`,
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {backdrop ? (
        <img className="modal-preview" src={backdrop} alt="" style={previewStyle} />
      ) : null}
      <div className="modal-overlay" />
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

'use client'

type Props = {
  isOpen: boolean
  onClose: () => void
  html: string
}

export default function EmailPreviewModal({ isOpen, onClose, html }: Props) {
  if (!isOpen) return null

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0 }}>Email Preview</h2>
          <button onClick={onClose} style={closeBtn}>
            Close
          </button>
        </div>

        <div style={bodyStyle}>
          <iframe
            title="Email Preview"
            srcDoc={html}
            style={iframeStyle}
          />
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
}

const modalStyle: React.CSSProperties = {
  width: '90%',
  height: '90%',
  background: '#fff',
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #ddd',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
}

const iframeStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  background: '#f4f4f4',
}

const closeBtn: React.CSSProperties = {
  padding: '6px 12px',
  cursor: 'pointer',
}
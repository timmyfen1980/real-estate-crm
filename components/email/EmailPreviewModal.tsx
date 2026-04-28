'use client'

type Props = {
  isOpen: boolean
  onClose: () => void
  html: string
}

export default function EmailPreviewModal({ isOpen, onClose, html }: Props) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#e5e7eb', // light gray (like email client)
        zIndex: 9999,
        overflowY: 'auto',
      }}
    >
      {/* TOP BAR */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          background: 'white',
          padding: '10px 20px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ fontWeight: 600 }}>Email Preview</div>
        <button onClick={onClose}>Close</button>
      </div>

      {/* EMAIL WRAPPER */}
      <div
        style={{
          padding: '40px 20px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 600,
            background: 'white',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
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
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#f5f5f5',
          width: '90%',
          maxWidth: 700,
          height: '90%',
          borderRadius: 8,
          padding: 20,
          overflow: 'auto',
        }}
      >
        {/* CLOSE */}
        <div style={{ textAlign: 'right', marginBottom: 10 }}>
          <button onClick={onClose}>Close</button>
        </div>

        {/* EMAIL CONTAINER */}
        <div
          style={{
            background: 'white',
            maxWidth: 600,
            margin: '0 auto',
            padding: 20,
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
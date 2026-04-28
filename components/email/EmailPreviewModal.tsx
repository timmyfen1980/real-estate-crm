'use client'

import { useEffect } from 'react'

type Props = {
  isOpen: boolean
  onCloseAction: () => void
  html: string
}

export default function EmailPreviewModal({
  isOpen,
  onCloseAction,
  html,
}: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseAction()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCloseAction])

  if (!isOpen) return null

  return (
    <div
      onClick={onCloseAction}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#e5e7eb',
        zIndex: 9999,
        overflowY: 'auto',
      }}
    >
      {/* TOP BAR */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'sticky',
          top: 0,
          background: 'white',
          padding: '12px 20px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ fontWeight: 600 }}>Email Preview</div>

        {/* BIG CLOSE BUTTON */}
        <button
          onClick={onCloseAction}
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
          }}
        >
          ✕
        </button>
      </div>

      {/* EMAIL */}
      <div
        onClick={(e) => e.stopPropagation()}
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
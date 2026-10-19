/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';

interface Giveaway {
  id: string;
  title: string;
  prize_name: string;
  description: string | null;
  image_url: string | null;
  draw_date: string | null;
  is_active: boolean;
  entry_count: number;
  created_at: string;
}

export default function GiveawayManagerPage() {
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Giveaway | null>(null);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [prizeName, setPrizeName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [drawDate, setDrawDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const SECRET = typeof window !== 'undefined' 
    ? '' // Will use session-based auth via proxy
    : '';

  async function fetchGiveaways() {
    try {
      // Use the admin route via a session-authenticated proxy
      // For now, we'll need the secret - in production this should use session auth
      const res = await fetch('/api/admin/giveaways-list');
      const data = await res.json();
      setGiveaways(data.giveaways || []);
    } catch {
      setGiveaways([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGiveaways();
  }, []);

  function openNewForm() {
    setEditing(null);
    setTitle('');
    setPrizeName('');
    setDescription('');
    setImageUrl('');
    setDrawDate('');
    setShowForm(true);
  }

  function openEditForm(g: Giveaway) {
    setEditing(g);
    setTitle(g.title);
    setPrizeName(g.prize_name);
    setDescription(g.description || '');
    setImageUrl(g.image_url || '');
    setDrawDate(g.draw_date || '');
    setShowForm(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'giveaways');
      
      const res = await fetch('/api/admin/upload-giveaway-image', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setImageUrl(data.url);
      }
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!title.trim() || !prizeName.trim()) {
      alert('Title and prize name are required');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        prize_name: prizeName.trim(),
        description: description.trim() || null,
        image_url: imageUrl || null,
        draw_date: drawDate || null,
      };

      if (editing) {
        const res = await fetch(`/api/admin/giveaways-update/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Update failed');
      } else {
        const res = await fetch('/api/admin/giveaways-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Create failed');
      }
      
      setShowForm(false);
      fetchGiveaways();
    } catch {
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: string) {
    if (!confirm('Make this the active giveaway? The public page will show this one.')) return;
    try {
      const res = await fetch(`/api/admin/giveaways-update/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      if (res.ok) fetchGiveaways();
    } catch {
      alert('Failed to activate');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this giveaway? Entries will be kept but unlinked.')) return;
    try {
      const res = await fetch(`/api/admin/giveaways-update/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) fetchGiveaways();
    } catch {
      alert('Delete failed');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '12px',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '4px',
    display: 'block',
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0 }}>🎁 Giveaways</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0' }}>
            Create prize draws. The active one shows on{' '}
            <a href="https://www.thefcgroup.ca/giveaway" target="_blank" rel="noopener noreferrer" style={{ color: '#d22630', fontWeight: 600 }}>
              thefcgroup.ca/giveaway ↗
            </a>
          </p>
        </div>
        <button
          onClick={openNewForm}
          style={{
            padding: '12px 24px',
            background: '#d22630',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          + New Giveaway
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : giveaways.length === 0 ? (
        <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: '#6b7280' }}>No giveaways yet. Create your first one!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {giveaways.map((g) => (
            <div
              key={g.id}
              style={{
                background: 'white',
                border: g.is_active ? '2px solid #16a34a' : '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                gap: '20px',
              }}
            >
              {g.image_url && (
                <img
                  src={g.image_url}
                  alt={g.prize_name}
                  style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{g.title}</h3>
                  {g.is_active && (
                    <span style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                      ● LIVE
                    </span>
                  )}
                </div>
                <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 8px' }}>
                  Prize: <strong>{g.prize_name}</strong>
                </p>
                {g.draw_date && (
                  <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 8px' }}>
                    Draw: {new Date(g.draw_date).toLocaleDateString()}
                  </p>
                )}
                <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 12px' }}>
                  Entries: <strong>{g.entry_count}</strong>
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!g.is_active && (
                    <button
                      onClick={() => handleActivate(g.id)}
                      style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Set Live
                    </button>
                  )}
                  <button
                    onClick={() => openEditForm(g)}
                    style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(g.id)}
                    style={{ padding: '8px 16px', background: 'white', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '32px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 20px' }}>
              {editing ? 'Edit Giveaway' : 'New Giveaway'}
            </h2>
            
            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} placeholder="e.g. Win Leafs Tickets!" value={title} onChange={(e) => setTitle(e.target.value)} />
            
            <label style={labelStyle}>Prize Name *</label>
            <input style={inputStyle} placeholder="e.g. Pair of Toronto Maple Leafs Tickets" value={prizeName} onChange={(e) => setPrizeName(e.target.value)} />
            
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder="Details about the prize..." value={description} onChange={(e) => setDescription(e.target.value)} />
            
            <label style={labelStyle}>Prize Image (optional)</label>
            {imageUrl && (
              <img src={imageUrl} alt="Prize" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }} />
            )}
            <label
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#374151',
                cursor: 'pointer',
                marginBottom: '12px',
              }}
            >
              {uploading ? 'Uploading...' : imageUrl ? 'Change Image' : 'Upload Prize Image'}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
                disabled={uploading}
              />
            </label>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 12px' }}>
              The team hero image always shows at the top. This is for the specific prize (e.g. Leafs tickets photo).
            </p>
            
            <label style={labelStyle}>Draw Date</label>
            <input style={inputStyle} type="date" value={drawDate} onChange={(e) => setDrawDate(e.target.value)} />
            
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1, padding: '12px', background: '#d22630', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Giveaway'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{ padding: '12px 24px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';

export default function GiveawayDashboardPage() {
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/admin/giveaway-entries');
        const data = await res.json();
        setEntryCount(data.count || 0);
      } catch {
        setEntryCount(0);
      } finally {
        setLoading(false);
      }
    }
    fetchCount();
  }, []);

  return (
    <div style={{ padding: '32px', maxWidth: '800px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px' }}>
        🎁 Giveaway
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '32px' }}>
        Manage your client giveaway draws.
      </p>

      <div
        style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>
          Current Draw
        </h2>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Prize</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>$500 Home Depot Gift Card</div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Draw Date</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>December 1, 2026</div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Entries</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>
            {loading ? '...' : entryCount}
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Entry Page</div>
          <a
            href="https://www.thefcgroup.ca/giveaway"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#d22630', fontWeight: 600, fontSize: '16px' }}
          >
            thefcgroup.ca/giveaway ↗
          </a>
        </div>
      </div>

      <div
        style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '24px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>
          How it works
        </h3>
        <ul style={{ color: '#4b5563', fontSize: '14px', lineHeight: 1.8, paddingLeft: '20px', margin: 0 }}>
          <li>Share the link via text, email, or social media</li>
          <li>They enter their phone → name autofills from your CRM</li>
          <li>They add their email → it's saved to their contact automatically</li>
          <li>New people get added as new contacts</li>
        </ul>
      </div>
    </div>
  );
}

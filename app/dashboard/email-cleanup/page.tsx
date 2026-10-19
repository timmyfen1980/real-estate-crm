'use client';

import { useState, useEffect } from 'react';

interface PhoneOnlyContact {
  id: string;
  name: string;
  phone: string;
}

export default function EmailCleanupPage() {
  const [contacts, setContacts] = useState<PhoneOnlyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Use the admin route via a simple fetch — we'll call it server-side
    fetch('/api/admin/phone-only-list')
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setContacts(data.phone_only);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const saveEmail = async (contactId: string) => {
    const email = (emails[contactId] || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Please enter a valid email address.');
      return;
    }
    setSaving(contactId);
    try {
      const res = await fetch('/api/admin/update-contact-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      // Remove from list
      setContacts(prev => prev.filter(c => c.id !== contactId));
      setEmails(prev => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
    setSaving(null);
  };

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  if (loading) return <div className="p-8">Loading contacts...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Email Cleanup</h1>
      <p className="text-gray-600 mb-6">
        {contacts.length} contacts have a phone number but no email. Add emails below —
        they'll be removed from this list as you go.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or phone..."
        className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-6 text-base"
      />

      <div className="space-y-3">
        {filtered.map(contact => (
          <div
            key={contact.id}
            className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium">{contact.name || 'Unnamed'}</p>
              <p className="text-sm text-gray-500 font-mono">{contact.phone}</p>
            </div>
            <div className="flex gap-2 flex-1">
              <input
                value={emails[contact.id] || ''}
                onChange={(e) => setEmails(prev => ({ ...prev, [contact.id]: e.target.value }))}
                placeholder="Email address"
                type="email"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEmail(contact.id);
                }}
              />
              <button
                onClick={() => saveEmail(contact.id)}
                disabled={saving === contact.id}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {saving === contact.id ? '...' : 'Save'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && contacts.length > 0 && (
        <p className="text-center text-gray-500 py-8">No matches for your search.</p>
      )}
      {contacts.length === 0 && (
        <p className="text-center text-gray-500 py-8">
          All done! Every contact has an email address.
        </p>
      )}
    </div>
  );
}

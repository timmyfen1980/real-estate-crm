'use client';

import { useState } from 'react';

export default function SendTenantLinkPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [property, setProperty] = useState('');
  const [agent, setAgent] = useState('Tim');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/send-tenant-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), property: property.trim(), agent }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: `Pre-screening email sent to ${email}.` });
        setName('');
        setEmail('');
        setProperty('');
      } else {
        setResult({ ok: false, message: data.error || 'Failed to send.' });
      }
    } catch {
      setResult({ ok: false, message: 'Something went wrong. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  const inputClass =
    'w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Send Tenant Pre-Screening Link</h1>
      <p className="text-gray-600 mb-6">
        Sends Beth&apos;s pre-screening email from <strong>beth@thefcgroup.ca</strong> with the
        tenant application link. The tenant must complete everything before any showing is booked.
      </p>

      <form onSubmit={handleSend} className="space-y-4 bg-white p-6 rounded-xl shadow-sm border">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tenant name</label>
          <input
            className={inputClass}
            placeholder="e.g. Sarah Johnson"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tenant email</label>
          <input
            className={inputClass}
            type="email"
            placeholder="sarah@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Property or area (optional)
          </label>
          <input
            className={inputClass}
            placeholder="e.g. 123 Main St, Whitby — or just &quot;Whitby&quot;"
            value={property}
            onChange={(e) => setProperty(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Referred by</label>
          <select
            className={inputClass}
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
          >
            <option value="Tim">Tim</option>
            <option value="Aidan">Aidan</option>
          </select>
        </div>

        {result && (
          <div
            className={`p-3 rounded-lg text-sm ${
              result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {result.message}
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          className="w-full py-3 bg-[#0f2a44] text-white rounded-lg font-semibold hover:bg-[#1a3a5c] disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send Pre-Screening Email'}
        </button>
      </form>
    </div>
  );
}

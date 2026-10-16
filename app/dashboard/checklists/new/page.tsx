'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CHECKLISTS,
  CHECKLIST_TYPE_LABELS,
  CHECKLIST_TYPES,
  ChecklistType,
} from '@/lib/checklists';
import { getAccountId, createClientFile } from '@/lib/checklistDb';

export default function NewClientFilePage() {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(null);

  const [checklistTypes, setChecklistTypes] = useState<ChecklistType[]>(['buyer']);
  const [clientNames, setClientNames] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');











  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactMatches, setContactMatches] = useState<any[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContactName, setSelectedContactName] = useState('');



  const [duplicateWarning, setDuplicateWarning] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getAccountId().then(setAccountId);
  }, []);

  // Search contacts by name, phone, or email for duplicate detection
  const searchContacts = async (name: string, phoneVal: string, emailVal: string) => {
    if (!accountId) return;
    const query = name.trim();
    if (query.length < 2 && !phoneVal.trim() && !emailVal.trim()) {
      setContactMatches([]);
      setDuplicateWarning([]);
      return;
    }
    setSearching(true);
    try {
      // Search by name
      let matches: any[] = [];
      if (query.length >= 2) {
        const { data } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email, phone')
          .eq('account_id', accountId)
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
          .limit(5);
        matches = data || [];
      }
      // Check phone match (exact digits)
      const phoneDigits = phoneVal.replace(/\D/g, '');
      if (phoneDigits.length >= 7) {
        const { data } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email, phone')
          .eq('account_id', accountId)
          .limit(50);
        const phoneMatches = (data || []).filter((c: any) => {
          const cDigits = (c.phone || '').replace(/\D/g, '');
          return cDigits && phoneDigits && (cDigits.includes(phoneDigits) || phoneDigits.includes(cDigits));
        });
        phoneMatches.forEach((pm: any) => {
          if (!matches.find((m: any) => m.id === pm.id)) matches.push({ ...pm, _matchReason: 'phone' });
        });
      }
      // Check email match
      if (emailVal.trim()) {
        const { data } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email, phone')
          .eq('account_id', accountId)
          .ilike('email', `%${emailVal.trim()}%`)
          .limit(5);
        (data || []).forEach((em: any) => {
          if (!matches.find((m: any) => m.id === em.id)) matches.push({ ...em, _matchReason: 'email' });
        });
      }
      setContactMatches(matches);
      // Flag as potential duplicates if name is close but not exact, or phone/email matched
      const warnings = matches.filter((m: any) => {
        const fullName = `${m.first_name || ''} ${m.last_name || ''}`.trim().toLowerCase();
        const inputName = query.toLowerCase();
        return m._matchReason || (fullName && inputName && fullName !== inputName);
      });
      setDuplicateWarning(warnings);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search on name/phone/email change
  useEffect(() => {
    const t = setTimeout(() => {
      if (!selectedContactId) searchContacts(clientNames, phone, email);
    }, 400);
    return () => clearTimeout(t);
  }, [clientNames, phone, email, accountId]);

  const toggleType = (t: ChecklistType) => {
    setChecklistTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) {
      setError('Could not determine your account. Please reload.');
      return;
    }
    if (checklistTypes.length === 0) {
      setError('Pick at least one checklist type.');
      return;
    }
    if (!clientNames.trim()) {
      setError('Client name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let contactId = selectedContactId;

      // If no contact linked, create one from the form data
      if (!contactId) {
        const nameParts = clientNames.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            account_id: accountId,
            first_name: firstName,
            last_name: lastName,
            phone: phone.trim() || null,
            email: email.trim() || null,
          })
          .select('id')
          .single();
        if (contactError) throw new Error('Could not create contact: ' + contactError.message);
        contactId = newContact.id;
      }

      const file = await createClientFile({
        account_id: accountId,
        checklist_types: checklistTypes,
        client_names: clientNames.trim(),
        phone: phone.trim(),
        email: email.trim(),
        crm_contact_id: contactId || undefined,
      });
      router.push(`/dashboard/checklists/${file.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create client file.');
      setSaving(false);
    }
  };

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href="/dashboard/checklists" className="text-sm text-blue-600 hover:underline">
        ← Back to client files
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">New Client File</h1>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-gray-200 rounded-xl p-6">
        {/* Checklist types */}
        <div>
          <label className={labelClass}>Checklist type(s) — pick all that apply</label>
          <div className="flex flex-wrap gap-2">
            {CHECKLIST_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  checklistTypes.includes(t)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {CHECKLIST_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Selling one property and buying another? Pick both — each gets its own checklist.
          </p>
        </div>

        {/* Client info */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Client name(s) *</label>
            <input
              className={inputClass}
              value={clientNames}
              onChange={(e) => {
                setClientNames(e.target.value);
                setSelectedContactId(null);
                setSelectedContactName('');
              }}
              placeholder="e.g. John and Jane Smith"
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. (905) 555-0123"
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. client@email.com"
            />
          </div>
        </div>

        {/* Contact matching */}
        {selectedContactId ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
            <p className="text-sm text-green-800">
              Linked to contact: <strong>{selectedContactName}</strong>
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedContactId(null);
                setSelectedContactName('');
              }}
              className="text-xs text-green-700 hover:underline"
            >
              Unlink
            </button>
          </div>
        ) : (
          <>
            {searching && (
              <p className="text-xs text-gray-500">Checking for existing contacts…</p>
            )}
            {duplicateWarning.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-900 mb-2">
                  Possible existing contact{duplicateWarning.length > 1 ? 's' : ''} found:
                </p>
                {duplicateWarning.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between py-1">
                    <p className="text-sm text-amber-800">
                      {m.first_name} {m.last_name}
                      {m._matchReason === 'phone' && ' (phone matches)'}
                      {m._matchReason === 'email' && ' (email matches)'}
                      {m.email && <span className="text-gray-500"> — {m.email}</span>}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedContactId(m.id);
                        setSelectedContactName(`${m.first_name || ''} ${m.last_name || ''}`.trim());
                        setDuplicateWarning([]);
                        setContactMatches([]);
                      }}
                      className="text-xs bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700"
                    >
                      Link this contact
                    </button>
                  </div>
                ))}
                <p className="text-xs text-amber-700 mt-2">
                  If none of these are the right person, just continue — a new contact will be created.
                </p>
              </div>
            )}
            {contactMatches.length > 0 && duplicateWarning.length === 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800 mb-1">Matching contacts:</p>
                {contactMatches.slice(0, 3).map((m: any) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedContactId(m.id);
                      setSelectedContactName(`${m.first_name || ''} ${m.last_name || ''}`.trim());
                      setContactMatches([]);
                    }}
                    className="block text-sm text-blue-700 hover:underline"
                  >
                    {m.first_name} {m.last_name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div>
        {/* Deal details are filled in on the checklist detail page */}
        <p className="text-sm text-gray-500">
          Property details, lawyer info, and dates get added on the next screen — either pulled from uploaded documents or entered manually.
        </p>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create Client File'}
        </button>
      </form>
    </div>
  );
}

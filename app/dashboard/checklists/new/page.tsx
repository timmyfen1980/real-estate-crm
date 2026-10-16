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
  const [propertyAddress, setPropertyAddress] = useState('');
  const [lawyerName, setLawyerName] = useState('');
  const [lawyerFirm, setLawyerFirm] = useState('');
  const [lawyerContact, setLawyerContact] = useState('');
  const [coopInfo, setCoopInfo] = useState('');
  const [offerDate, setOfferDate] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [conditions, setConditions] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAccountId().then(setAccountId);
  }, []);

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
      const file = await createClientFile({
        account_id: accountId,
        checklist_types: checklistTypes,
        client_names: clientNames.trim(),
        phone: phone.trim(),
        email: email.trim(),
        property_address: propertyAddress.trim(),
        lawyer_name: lawyerName.trim(),
        lawyer_firm: lawyerFirm.trim(),
        lawyer_contact: lawyerContact.trim(),
        coop_info: coopInfo.trim(),
        deal_dates: { offer_date: offerDate, closing_date: closingDate },
        financials: { price, deposit },
        conditions: conditions.trim(),
        notes: notes.trim(),
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
              onChange={(e) => setClientNames(e.target.value)}
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

        <div>
          <label className={labelClass}>Property address</label>
          <input
            className={inputClass}
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            placeholder="e.g. 8 Calais Street, Whitby"
          />
        </div>

        {/* Lawyer */}
        <div className="border-t pt-4">
          <h3 className="font-medium mb-3">Client&apos;s lawyer</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass} value={lawyerName} onChange={(e) => setLawyerName(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Firm</label>
              <input className={inputClass} value={lawyerFirm} onChange={(e) => setLawyerFirm(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Phone / Email</label>
              <input className={inputClass} value={lawyerContact} onChange={(e) => setLawyerContact(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Deal details */}
        <div className="border-t pt-4">
          <h3 className="font-medium mb-3">Deal details</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Offer date</label>
              <input type="date" className={inputClass} value={offerDate} onChange={(e) => setOfferDate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Closing date</label>
              <input type="date" className={inputClass} value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Price / Rent</label>
              <input className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. $699,900" />
            </div>
            <div>
              <label className={labelClass}>Deposit amount / held by</label>
              <input className={inputClass} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <label className={labelClass}>Conditions + deadlines</label>
            <input className={inputClass} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Financing by Oct 25, inspection by Oct 28" />
          </div>
          <div className="mt-4">
            <label className={labelClass}>Co-operating agent / brokerage</label>
            <input className={inputClass} value={coopInfo} onChange={(e) => setCoopInfo(e.target.value)} />
          </div>
          <div className="mt-4">
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

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

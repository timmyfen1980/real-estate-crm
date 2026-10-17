'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CHECKLISTS,
  CHECKLIST_TYPE_LABELS,
  REQUIRED_BADGE,
  ChecklistType,
} from '@/lib/checklists';
import {
  ClientFile,
  ClientDocument,
  enablePortalAccess,
  portalLink,
} from '@/lib/checklistDb';

export default function ClientFileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;

  const [file, setFile] = useState<ClientFile | null>(null);
  const [docs, setDocs] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ChecklistType | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingDeal, setEditingDeal] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  // Deal form fields
  const [fAddress, setFAddress] = useState('');
  const [fLawyerName, setFLawyerName] = useState('');
  const [fLawyerFirm, setFLawyerFirm] = useState('');
  const [fLawyerContact, setFLawyerContact] = useState('');
  const [fCoop, setFCoop] = useState('');
  const [fOfferDate, setFOfferDate] = useState('');
  const [fClosingDate, setFClosingDate] = useState('');
  const [fPrice, setFPrice] = useState('');
  const [fDeposit, setFDeposit] = useState('');
  const [fConditions, setFConditions] = useState('');
  const [fNotes, setFNotes] = useState('');
  // Deal picker
  const [contactDeals, setContactDeals] = useState<any[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [showDealPicker, setShowDealPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [fileId]);

  const loadData = async () => {
    const { data: fileData } = await supabase
      .from('client_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (!fileData) {
      setLoading(false);
      return;
    }
    setFile(fileData as ClientFile);
    setActiveTab((fileData as ClientFile).checklist_types[0] || null);
    // Populate deal form
    const f = fileData as ClientFile;
    setFAddress(f.property_address || '');
    setFLawyerName(f.lawyer_name || '');
    setFLawyerFirm(f.lawyer_firm || '');
    setFLawyerContact(f.lawyer_contact || '');
    setFCoop(f.coop_info || '');
    setFOfferDate(f.deal_dates?.offer_date || '');
    setFClosingDate(f.deal_dates?.closing_date || '');
    setFPrice(f.financials?.price || '');
    setFDeposit(f.financials?.deposit || '');
    setFConditions(f.conditions || '');
    setFNotes(f.notes || '');

    const { data: docData } = await supabase
      .from('client_documents')
      .select('*')
      .eq('client_file_id', fileId)
      .order('stage_index')
      .order('doc_index');

    setDocs((docData || []) as ClientDocument[]);
    setLoading(false);
  };

  const setStatus = async (docId: string, status: ClientDocument['status']) => {
    const { error } = await supabase
      .from('client_documents')
      .update({
        status,
        received_at: status === 'received' ? new Date().toISOString() : null,
        received_via: status === 'received' ? 'manual' : null,
      })
      .eq('id', docId);

    if (!error) {
      setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, status } : d)));
    }
  };

  const handleEnablePortal = async () => {
    if (!file) return;
    setPortalBusy(true);
    try {
      const token = await enablePortalAccess(file.id);
      setFile({ ...file, portal_token: token, portal_enabled: true });
    } finally {
      setPortalBusy(false);
    }
  };

  const copyPortalLink = async () => {
    if (!file?.portal_token) return;
    await navigator.clipboard.writeText(portalLink(file.portal_token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveDeal = async () => {
    if (!file) return;
    setSavingDeal(true);
    const { data, error } = await supabase
      .from('client_files')
      .update({
        property_address: fAddress.trim(),
        lawyer_name: fLawyerName.trim(),
        lawyer_firm: fLawyerFirm.trim(),
        lawyer_contact: fLawyerContact.trim(),
        coop_info: fCoop.trim(),
        deal_dates: { offer_date: fOfferDate, closing_date: fClosingDate },
        financials: { price: fPrice, deposit: fDeposit },
        conditions: fConditions.trim(),
        notes: fNotes.trim(),
      })
      .eq('id', file.id)
      .select()
      .single();

    setSavingDeal(false);
    if (!error && data) {
      setFile(data as ClientFile);
      setEditingDeal(false);
    }
  };

  const fetchDealsForPicker = async () => {
    if (!file?.crm_contact_id) return;
    setLoadingDeals(true);
    setShowDealPicker(true);
    try {
      // Get account_id from file
      const { data: deals } = await supabase
        .from('deals')
        .select('id, deal_type, status, property_id')
        .eq('contact_id', file.crm_contact_id)
        .eq('account_id', file.account_id)
        .order('created_at', { ascending: false });

      if (deals && deals.length > 0) {
        const propIds = [...new Set(deals.map((d: any) => d.property_id).filter(Boolean))];
        let propMap: Record<string, any> = {};
        if (propIds.length > 0) {
          const { data: props } = await supabase
            .from('properties')
            .select('id, address, city, province')
            .in('id', propIds);
          (props || []).forEach((p: any) => { propMap[p.id] = p; });
        }
        setContactDeals(deals.map((d: any) => ({ ...d, property: propMap[d.property_id] || null })));
      } else {
        setContactDeals([]);
      }
    } finally {
      setLoadingDeals(false);
    }
  };

  const handleDownloadAll = async () => {
    const docsWithFiles = docs.filter((d) => d.file_url);
    if (docsWithFiles.length === 0) {
      alert('No files uploaded yet.');
      return;
    }
    setDownloadingAll(true);
    try {
      // Download each file individually (browser will handle multiple downloads)
      // For a zip, we'd need a server endpoint - for now, open each in new tab
      for (const doc of docsWithFiles) {
        if (doc.file_url) {
          window.open(doc.file_url, '_blank');
          // Small delay to avoid browser blocking
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!file) return;
    setDeleting(true);
    try {
      // Delete associated documents first
      await supabase.from('client_documents').delete().eq('client_file_id', file.id);
      // Delete the file record
      const { error } = await supabase.from('client_files').delete().eq('id', file.id);
      if (error) throw error;
      // Redirect to list
      router.push('/dashboard/checklists');
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete. Please try again.');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleFileUpload = async (docId: string, file: File) => {
    if (!file) return;
    setUploadingDocId(docId);
    try {
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${fileId}/${docId}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL (bucket is private, so we create a signed URL)
      const { data: urlData } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(fileName, 31536000); // 1 year

      const fileUrl = urlData?.signedUrl || '';

      // Update the document record
      const { error: dbError } = await supabase
        .from('client_documents')
        .update({
          file_url: fileUrl,
          status: 'received',
          received_at: new Date().toISOString(),
          received_via: 'upload',
        })
        .eq('id', docId);

      if (dbError) throw dbError;

      // Update local state
      setDocs((prev) => prev.map((d) => 
        d.id === docId 
          ? { ...d, file_url: fileUrl, status: 'received' as const }
          : d
      ));
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingDocId(null);
      setDragOverDocId(null);
    }
  };

  const linkDeal = async (deal: any) => {
    if (!file) return;
    // Auto-fill address from deal property
    let addr = '';
    if (deal.property?.address) {
      addr = [deal.property.address, deal.property.city, deal.property.province]
        .filter(Boolean).join(', ');
      setFAddress(addr);
    }
    // Link the deal AND save the address to the database
    const updates: any = { crm_deal_id: deal.id };
    if (addr) updates.property_address = addr;
    const { data, error } = await supabase
      .from('client_files')
      .update(updates)
      .eq('id', file.id)
      .select()
      .single();
    if (!error && data) {
      setFile(data as ClientFile);
    }
    setShowDealPicker(false);
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="p-8">
        <p className="text-red-600">Client file not found.</p>
        <Link href="/dashboard/checklists" className="text-blue-600 hover:underline">
          ← Back to client files
        </Link>
      </div>
    );
  }

  const tabDocs = docs.filter((d) => d.checklist_type === activeTab);
  const stages = activeTab ? CHECKLISTS[activeTab].stages : [];
  const received = tabDocs.filter((d) => ['received', 'waived', 'na'].includes(d.status)).length;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/dashboard/checklists" className="text-sm text-blue-600 hover:underline">
        ← Back to client files
      </Link>

      {/* Deal header */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">{file.client_names}</h1>
            {file.property_address && (
              <p className="text-gray-500 mt-1">{file.property_address}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {file.checklist_types.map((t) => (
                <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                  {CHECKLIST_TYPE_LABELS[t as ChecklistType]}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="mb-2 px-3 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg border border-red-200"
            >
              Delete file
            </button>
            {file.crm_contact_id && (
              <>
                <button
                  onClick={async () => {
                    if (!confirm('Generate FINTRAC Form 630 for the linked contact?')) return;
                    try {
                      const res = await fetch('/api/generate-fintrac-630', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contact_id: file.crm_contact_id, client_file_id: file.id }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Generation failed');
                      alert('FINTRAC Form 630 generated and saved.');
                      window.location.reload();
                    } catch (err: any) {
                      alert(err.message || 'Failed to generate form.');
                    }
                  }}
                  className="mb-2 ml-2 px-3 py-1.5 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 rounded-lg border border-green-200"
                >
                  630
                </button>
                <button
                  onClick={async () => {
                    const amount = prompt('Funds amount (e.g. 25000):');
                    if (!amount) return;
                    const method = prompt('Method (electronic, in_person, or mail):', 'electronic');
                    if (!method) return;
                    try {
                      const res = await fetch('/api/generate-fintrac-635', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          contact_id: file.crm_contact_id,
                          client_file_id: file.id,
                          funds_amount: amount,
                          funds_method: method,
                          funds_date: new Date().toISOString().split('T')[0],
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Generation failed');
                      alert('FINTRAC Form 635 generated and saved.');
                      window.location.reload();
                    } catch (err: any) {
                      alert(err.message || 'Failed to generate form.');
                    }
                  }}
                  className="mb-2 ml-1 px-3 py-1.5 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 rounded-lg border border-green-200"
                >
                  635
                </button>
              </>
            )}
            {!file.portal_enabled ? (
              <button
                onClick={handleEnablePortal}
                disabled={portalBusy}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {portalBusy ? 'Generating…' : 'Enable Client Portal'}
              </button>
            ) : (
              <div>
                <p className="text-xs text-green-700 font-medium mb-2">✓ Client portal enabled</p>
                <button
                  onClick={copyPortalLink}
                  className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  {copied ? 'Copied!' : 'Copy Client Link'}
                </button>
                <p className="text-xs text-gray-500 mt-2 max-w-[220px]">
                  Send this link to the client — they can view their checklist and upload documents.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Deal info - editable */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Deal Details</h3>
            <div className="flex gap-2">
              {file.crm_contact_id && !editingDeal && (
                <button
                  onClick={fetchDealsForPicker}
                  className="text-xs px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium"
                >
                  Link Existing Deal
                </button>
              )}
              {!editingDeal ? (
                <button
                  onClick={() => setEditingDeal(true)}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  Edit Details
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingDeal(false)}
                    className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveDeal}
                    disabled={savingDeal}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {savingDeal ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Deal picker modal */}
          {showDealPicker && (
            <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-purple-900">
                  Select a deal to link:
                </p>
                <button
                  onClick={() => setShowDealPicker(false)}
                  className="text-xs text-purple-700 hover:underline"
                >
                  Close
                </button>
              </div>
              {loadingDeals ? (
                <p className="text-xs text-purple-700">Loading deals…</p>
              ) : contactDeals.length === 0 ? (
                <p className="text-xs text-purple-700">No deals found for this contact.</p>
              ) : (
                <div className="space-y-2">
                  {contactDeals.map((d: any) => (
                    <button
                      key={d.id}
                      onClick={() => linkDeal(d)}
                      className="w-full text-left px-3 py-2 rounded-lg border text-sm bg-white border-purple-200 hover:border-purple-400"
                    >
                      <span className="font-medium">{d.property?.address || 'No address'}</span>
                      {d.deal_type && <span className="ml-2 text-xs text-gray-500">({d.deal_type})</span>}
                      {d.status && <span className="ml-2 text-xs text-gray-500">— {d.status}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {editingDeal ? (
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Property address</label>
                <input value={fAddress} onChange={(e) => setFAddress(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="123 Main St, Whitby, ON" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lawyer name</label>
                <input value={fLawyerName} onChange={(e) => setFLawyerName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Law firm</label>
                <input value={fLawyerFirm} onChange={(e) => setFLawyerFirm(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lawyer contact</label>
                <input value={fLawyerContact} onChange={(e) => setFLawyerContact(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Phone / email" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Co-operating side</label>
                <input value={fCoop} onChange={(e) => setFCoop(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Other agent / brokerage" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Offer date</label>
                <input value={fOfferDate} onChange={(e) => setFOfferDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="2026-10-16" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Closing date</label>
                <input value={fClosingDate} onChange={(e) => setFClosingDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="2026-12-01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Price / Rent</label>
                <input value={fPrice} onChange={(e) => setFPrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deposit</label>
                <input value={fDeposit} onChange={(e) => setFDeposit(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Conditions + deadlines</label>
                <textarea value={fConditions} onChange={(e) => setFConditions(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                {(file.phone || file.phone_email) && (
                  <div>
                    <p className="text-gray-500">Phone</p>
                    <p className="font-medium">{file.phone || file.phone_email}</p>
                  </div>
                )}
                {file.email && (
                  <div>
                    <p className="text-gray-500">Email</p>
                    <p className="font-medium">{file.email}</p>
                  </div>
                )}
                {(file.lawyer_name || file.lawyer_firm) && (
                  <div>
                    <p className="text-gray-500">Lawyer</p>
                    <p className="font-medium">
                      {file.lawyer_name}
                      {file.lawyer_firm ? ` — ${file.lawyer_firm}` : ''}
                    </p>
                    {file.lawyer_contact && <p className="text-gray-500">{file.lawyer_contact}</p>}
                  </div>
                )}
                {file.coop_info && (
                  <div>
                    <p className="text-gray-500">Co-operating side</p>
                    <p className="font-medium">{file.coop_info}</p>
                  </div>
                )}
                {file.deal_dates?.closing_date && (
                  <div>
                    <p className="text-gray-500">Closing date</p>
                    <p className="font-medium">{file.deal_dates.closing_date}</p>
                  </div>
                )}
                {file.deal_dates?.offer_date && (
                  <div>
                    <p className="text-gray-500">Offer date</p>
                    <p className="font-medium">{file.deal_dates.offer_date}</p>
                  </div>
                )}
                {file.financials?.price && (
                  <div>
                    <p className="text-gray-500">Price / Rent</p>
                    <p className="font-medium">{file.financials.price}</p>
                  </div>
                )}
                {file.crm_deal_id && (
                  <div>
                    <p className="text-gray-500">Linked deal</p>
                    <p className="font-medium text-purple-700">✓ Connected</p>
                  </div>
                )}
              </div>
              {file.conditions && (
                <p className="text-sm mt-4">
                  <span className="text-gray-500">Conditions: </span>
                  {file.conditions}
                </p>
              )}
              {!file.property_address && !file.lawyer_name && !file.deal_dates?.closing_date && (
                <p className="text-sm text-gray-400 mt-2 italic">
                  No deal details yet — click Edit Details to add them, or upload documents and fill in what they show.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Checklist tabs */}
      <div className="flex gap-2 mt-6 border-b border-gray-200">
        {file.checklist_types.map((t) => {
          const ct = t as ChecklistType;
          const count = docs.filter(
            (d) => d.checklist_type === ct && ['received', 'waived', 'na'].includes(d.status)
          ).length;
          const total = docs.filter((d) => d.checklist_type === ct).length;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(ct)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === ct
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {CHECKLIST_TYPE_LABELS[ct]} ({count}/{total})
            </button>
          );
        })}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900">Delete this file?</h3>
            <p className="text-sm text-gray-600 mt-2">
              This will permanently delete <strong>{file.client_names}</strong> and all
              associated checklist documents. This cannot be undone.
            </p>
            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFile}
                disabled={deleting}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stages */}
      {activeTab && (
        <div className="mt-6 space-y-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {received} of {tabDocs.length} documents received
            </p>
            <button
              onClick={handleDownloadAll}
              disabled={downloadingAll}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
            >
              {downloadingAll ? 'Preparing…' : 'Download all files'}
            </button>
          </div>
          {stages.map((stage, si) => {
            const stageDocs = tabDocs.filter((d) => d.stage_index === si);
            if (stageDocs.length === 0) return null;
            return (
              <div key={si} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-semibold">{stage.title}</h3>
                  <p className="text-sm text-gray-500">{stage.description}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {stageDocs.map((doc) => {
                    const badge = REQUIRED_BADGE[doc.required] || REQUIRED_BADGE.required;
                    return (
                      <div
                        key={doc.id}
                        className={`px-5 py-4 flex items-start gap-4 transition-colors ${
                          dragOverDocId === doc.id ? 'bg-blue-50 border-2 border-blue-300 border-dashed' : ''
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverDocId(doc.id);
                        }}
                        onDragLeave={() => setDragOverDocId(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          const files = e.dataTransfer.files;
                          if (files.length > 0) {
                            handleFileUpload(doc.id, files[0]);
                          }
                        }}
                      >
                        <button
                          onClick={() =>
                            setStatus(doc.id, doc.status === 'received' ? 'pending' : 'received')
                          }
                          className={`mt-0.5 w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                            ['received', 'waived', 'na'].includes(doc.status)
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 hover:border-green-400'
                          }`}
                          title={['received', 'waived', 'na'].includes(doc.status) ? 'Mark as not received' : 'Mark as received'}
                        >
                          {['received', 'waived', 'na'].includes(doc.status) && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={`font-medium ${
                                ['received', 'waived', 'na'].includes(doc.status) ? 'line-through text-gray-400' : ''
                              }`}
                            >
                              {doc.document}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
                              {badge.label}
                            </span>
                            {doc.file_url && (
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                View file
                              </a>
                            )}
                          </div>
                          {doc.form && <p className="text-xs text-gray-500 mt-0.5">{doc.form}</p>}
                          {doc.beth_note && (
                            <p className="text-sm text-gray-500 mt-1">{doc.beth_note}</p>
                          )}
                          {doc.view_form && (
                            <a
                              href={doc.view_form}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                            >
                              View form →
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <select
                            value={doc.status}
                            onChange={(e) => setStatus(doc.id, e.target.value as ClientDocument['status'])}
                            className="text-xs border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="pending">Pending</option>
                            <option value="received">Received</option>
                            <option value="waived">Waived</option>
                            <option value="na">N/A</option>
                          </select>
                          <label className="cursor-pointer text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium border border-blue-200">
                            {uploadingDocId === doc.id ? 'Uploading…' : doc.file_url ? 'Replace file' : 'Upload file'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocId === doc.id}
                              onChange={(e) => {
                                const files = e.target.files;
                                if (files && files.length > 0) {
                                  handleFileUpload(doc.id, files[0]);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Download →
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

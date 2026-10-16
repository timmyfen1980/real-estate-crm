'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
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
  const fileId = params.id as string;

  const [file, setFile] = useState<ClientFile | null>(null);
  const [docs, setDocs] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ChecklistType | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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
  const received = tabDocs.filter((d) => d.status === 'received').length;

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

        {/* Deal info grid */}
        <div className="grid md:grid-cols-3 gap-4 mt-6 text-sm">
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
        </div>
        {file.conditions && (
          <p className="text-sm mt-4">
            <span className="text-gray-500">Conditions: </span>
            {file.conditions}
          </p>
        )}
      </div>

      {/* Checklist tabs */}
      <div className="flex gap-2 mt-6 border-b border-gray-200">
        {file.checklist_types.map((t) => {
          const ct = t as ChecklistType;
          const count = docs.filter(
            (d) => d.checklist_type === ct && d.status === 'received'
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

      {/* Stages */}
      {activeTab && (
        <div className="mt-6 space-y-8">
          <p className="text-sm text-gray-500">
            {received} of {tabDocs.length} documents received
          </p>
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
                      <div key={doc.id} className="px-5 py-4 flex items-start gap-4">
                        <button
                          onClick={() =>
                            setStatus(doc.id, doc.status === 'received' ? 'pending' : 'received')
                          }
                          className={`mt-0.5 w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                            doc.status === 'received'
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 hover:border-green-400'
                          }`}
                          title={doc.status === 'received' ? 'Mark as not received' : 'Mark as received'}
                        >
                          {doc.status === 'received' && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={`font-medium ${
                                doc.status === 'received' ? 'line-through text-gray-400' : ''
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
                              View blank form →
                            </a>
                          )}
                        </div>
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

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CHECKLIST_TYPE_LABELS, ChecklistType } from '@/lib/checklists';
import { getAccountId, ClientFile } from '@/lib/checklistDb';

type DocCount = { total: number; received: number };

export default function ChecklistsPage() {
  const router = useRouter();
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [progress, setProgress] = useState<Record<string, DocCount>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    const accountId = await getAccountId();
    if (!accountId) {
      setLoading(false);
      return;
    }

    const { data: fileData } = await supabase
      .from('client_files')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    const list = (fileData || []) as ClientFile[];
    setFiles(list);

    // Progress per file
    if (list.length > 0) {
      const { data: docs } = await supabase
        .from('client_documents')
        .select('client_file_id, status')
        .in(
          'client_file_id',
          list.map((f) => f.id)
        );

      const map: Record<string, DocCount> = {};
      (docs || []).forEach((d: any) => {
        if (!map[d.client_file_id]) map[d.client_file_id] = { total: 0, received: 0 };
        map[d.client_file_id].total += 1;
        if (['received', 'waived', 'na'].includes(d.status)) map[d.client_file_id].received += 1;
      });
      setProgress(map);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Loading client files…</p>
      </div>
    );
  }

  // Filter files by search text, type, and completion status
  const filteredFiles = files.filter((f) => {
    // Search across name, address, phone, email
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [
        f.client_names,
        f.property_address || '',
        (f as any).phone || '',
        (f as any).email || '',
        f.phone_email || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    // Type filter
    if (typeFilter !== 'all' && !f.checklist_types.includes(typeFilter as ChecklistType)) {
      return false;
    }
    // Status filter (complete = 100% received)
    if (statusFilter !== 'all') {
      const p = progress[f.id] || { total: 0, received: 0 };
      const pct = p.total > 0 ? p.received / p.total : 0;
      const isComplete = pct === 1;
      if (statusFilter === 'complete' && !isComplete) return false;
      if (statusFilter === 'active' && isComplete) return false;
    }
    return true;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Client Checklists</h1>
          <p className="text-gray-500 mt-1">
            Track paperwork for every client file — what&apos;s collected, what&apos;s outstanding.
          </p>
        </div>
        <Link
          href="/dashboard/checklists/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          + New Client File
        </Link>
      </div>

      {/* Search and filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, address, phone, or email…"
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All types</option>
          <option value="buyer">Buyer</option>
          <option value="seller">Seller</option>
          <option value="tenant">Tenant</option>
          <option value="landlord">Landlord</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="complete">Complete</option>
        </select>
      </div>

      {filteredFiles.length === 0 && files.length > 0 && (
        <p className="text-gray-500 text-sm mb-4">
          No files match your search. Try a different name, address, or clear the filters.
        </p>
      )}

      {files.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <p className="text-gray-500 mb-4">No client files yet.</p>
          <Link
            href="/dashboard/checklists/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Create your first client file
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredFiles.map((f) => {
            const p = progress[f.id] || { total: 0, received: 0 };
            const pct = p.total > 0 ? Math.round((p.received / p.total) * 100) : 0;
            return (
              <Link
                key={f.id}
                href={`/dashboard/checklists/${f.id}`}
                className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-white"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-lg">{f.client_names}</h2>
                    {f.property_address && (
                      <p className="text-gray-500 text-sm mt-0.5">{f.property_address}</p>
                    )}
                  </div>
                  {f.portal_enabled && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      Client portal on
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {f.checklist_types.map((t: ChecklistType) => (
                    <span
                      key={t}
                      className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full"
                    >
                      {CHECKLIST_TYPE_LABELS[t]}
                    </span>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>
                      {p.received} of {p.total} documents
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

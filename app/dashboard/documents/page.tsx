// /dashboard/documents — Team document library, served from Supabase storage
'use client';

import { useState } from 'react';

interface TeamDoc {
  name: string;
  size: string;
  path: string; // storage path in the client-documents bucket
}

const BUYER_DOCS: TeamDoc[] = [
  { name: 'New Home Utility.docx', size: '517 KB', path: 'team-docs/buyer/New Home Utility.docx' },
  { name: 'New Home Utility.pdf', size: '117 KB', path: 'team-docs/buyer/New Home Utility.pdf' },
  { name: 'Sched A Buyer rep.pdf', size: '681 KB', path: 'team-docs/buyer/Sched A Buyer rep.pdf' },
  { name: 'Buyer Schedule B.docx', size: '15 KB', path: 'team-docs/buyer/Buyer Schedule B.docx' },
  { name: 'Copy of SHOWINGS REPORT.xlsx', size: '18 KB', path: 'team-docs/buyer/Copy of SHOWINGS REPORT.xlsx' },
  { name: 'FINTRAC - Individual Identification Information Record.pdf', size: '495 KB', path: 'team-docs/buyer/FINTRAC - Individual Identification Information Record.pdf' },
  { name: 'FINTRAC - Receipt of Funds Record.pdf', size: '77 KB', path: 'team-docs/buyer/FINTRAC - Receipt of Funds Record.pdf' },
  { name: 'LEASE CLAUSES.docx', size: '14 KB', path: 'team-docs/buyer/LEASE CLAUSES.docx' },
  { name: 'OFFER CLAUSES.docx', size: '32 KB', path: 'team-docs/buyer/OFFER CLAUSES.docx' },
  { name: 'Team Fennessey Information Package.pdf', size: '1.3 MB', path: 'team-docs/buyer/Team Fennessey Information Package.pdf' },
  { name: 'RECO-Information-Guide.pdf', size: '2.3 MB', path: 'team-docs/buyer/RECO-Information-Guide.pdf' },
];

const SELLER_DOCS: TeamDoc[] = [
  { name: 'tresa-schedule-a-listing-agreement.docx', size: '27 KB', path: 'team-docs/seller/tresa-schedule-a-listing-agreement.docx' },
  { name: 'FINTRAC - Individual Identification Information Record.pdf', size: '495 KB', path: 'team-docs/seller/FINTRAC - Individual Identification Information Record.pdf' },
  { name: 'New Home Utility.pdf', size: '117 KB', path: 'team-docs/seller/New Home Utility.pdf' },
  { name: 'Tim Fennessey - Selling is what I do!.pptx', size: '11 MB', path: 'team-docs/seller/Tim Fennessey - Selling is what I do!.pptx' },
  { name: 'RECO-Information-Guide.pdf', size: '2.3 MB', path: 'team-docs/seller/RECO-Information-Guide.pdf' },
  { name: 'brokerbay-new-listing-info-sheet.pdf', size: '2.6 MB', path: 'team-docs/seller/brokerbay-new-listing-info-sheet.pdf' },
  { name: 'deposit-instructions-durham-region.pdf', size: '207 KB', path: 'team-docs/seller/deposit-instructions-durham-region.pdf' },
  { name: 'rough-trade-letter-size-fillable.pdf', size: '397 KB', path: 'team-docs/seller/rough-trade-letter-size-fillable.pdf' },
  { name: 'Sched B.pdf', size: '2.1 MB', path: 'team-docs/seller/Sched B.pdf' },
  { name: 'transaction-templates-amp-forms-2024.pdf', size: '154 KB', path: 'team-docs/seller/transaction-templates-amp-forms-2024.pdf' },
  { name: 'Tim Fennessey - Selling is what I do!.pdf', size: '2.8 MB', path: 'team-docs/seller/Tim Fennessey - Selling is what I do!.pdf' },
];

const FOLDERS = [
  { id: 'buyer', title: 'Buyer File', description: 'Buyer representation, offer clauses, FINTRAC forms, info package', docs: BUYER_DOCS },
  { id: 'seller', title: 'Seller File', description: 'Listing agreement, seller presentation, trade forms, FINTRAC', docs: SELLER_DOCS },
  { id: 'renter', title: 'Renter File', description: 'Tenant documents', docs: [] as TeamDoc[] },
];

function fileIcon(name: string): string {
  if (name.endsWith('.pdf')) return '📄';
  if (name.endsWith('.docx')) return '📝';
  if (name.endsWith('.xlsx')) return '📊';
  if (name.endsWith('.pptx')) return '📽️';
  return '📎';
}

async function openDoc(doc: TeamDoc, mode: 'preview' | 'download'): Promise<void> {
  const res = await fetch(
    `/api/team-doc-url?path=${encodeURIComponent(doc.path)}${mode === 'download' ? '&download=1' : ''}`
  );
  const data = await res.json();
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'could not open document');
  }
  let url: string = data.url;
  // Office docs can't render natively in the browser — open via Google Docs viewer
  if (mode === 'preview' && !doc.name.toLowerCase().endsWith('.pdf')) {
    url = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  }
  window.open(url, '_blank', 'noopener');
}

export default function DocumentsPage() {
  const [activeFolder, setActiveFolder] = useState('buyer');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const folder = FOLDERS.find((f) => f.id === activeFolder)!;

  const handle = async (doc: TeamDoc, mode: 'preview' | 'download') => {
    const key = `${mode}:${doc.path}`;
    setBusyKey(key);
    try {
      await openDoc(doc, mode);
    } catch {
      alert('Could not open the document. Please try again.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Documents</h1>
      <p className="text-gray-600 mb-6">
        Team document library — preview any file in the browser, or download it.
      </p>

      <div className="flex gap-2 mb-6">
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(f.id)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeFolder === f.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            📁 {f.title}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-1">{folder.title}</h2>
        <p className="text-sm text-gray-500 mb-4">{folder.description}</p>

        {folder.docs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-2">📂</p>
            <p>No documents yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {folder.docs.map((doc) => (
              <div key={doc.path} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{fileIcon(doc.name)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                    <p className="text-xs text-gray-400">{doc.size}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handle(doc, 'preview')}
                    disabled={busyKey !== null}
                    className="px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                  >
                    {busyKey === `preview:${doc.path}` ? 'Opening…' : 'Preview 👁️'}
                  </button>
                  <button
                    onClick={() => handle(doc, 'download')}
                    disabled={busyKey !== null}
                    className="px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                  >
                    {busyKey === `download:${doc.path}` ? 'Opening…' : 'Download ↓'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// /dashboard/documents — Team document library, served from Supabase storage
'use client';

import { useState, useRef } from 'react';

interface TeamDoc {
  name: string;
  size: string;
  path: string; // storage path in the client-documents bucket
}

const BUYER_DOCS: TeamDoc[] = [
  { name: 'New Home Utility.docx', size: '517 KB', path: 'team-docs/buyer/New Home Utility.docx' },
  { name: 'New Home Utility.pdf', size: '117 KB', path: 'team-docs/buyer/New Home Utility.pdf' },
  { name: 'Sched A Buyer rep.pdf', size: '681 KB', path: 'team-docs/buyer/Sched A Buyer rep.pdf' },
  { name: 'Buyer Representation Agreement - Form 371.pdf', size: '56 KB', path: 'team-docs/buyer/Buyer Representation Agreement - Form 371.pdf' },
  { name: 'Buyer Schedule B.docx', size: '15 KB', path: 'team-docs/buyer/Buyer Schedule B.docx' },
  { name: 'Copy of SHOWINGS REPORT.xlsx', size: '18 KB', path: 'team-docs/buyer/Copy of SHOWINGS REPORT.xlsx' },
  { name: 'FINTRAC - Individual Identification Information Record.pdf', size: '495 KB', path: 'team-docs/buyer/FINTRAC - Individual Identification Information Record.pdf' },
  { name: 'FINTRAC - Receipt of Funds Record.pdf', size: '77 KB', path: 'team-docs/buyer/FINTRAC - Receipt of Funds Record.pdf' },
  { name: 'FINTRAC 635 - Receipt of Funds Record.pdf', size: '121 KB', path: 'team-docs/buyer/FINTRAC 635 - Receipt of Funds Record.pdf' },
  { name: 'FINTRAC 636 - Beneficial Ownership.pdf', size: '85 KB', path: 'team-docs/buyer/FINTRAC 636 - Beneficial Ownership.pdf' },
  { name: 'FINTRAC 639 - Risk Assessment.pdf', size: '232 KB', path: 'team-docs/buyer/FINTRAC 639 - Risk Assessment.pdf' },
  { name: 'LEASE CLAUSES.docx', size: '14 KB', path: 'team-docs/buyer/LEASE CLAUSES.docx' },
  { name: 'OFFER CLAUSES.docx', size: '32 KB', path: 'team-docs/buyer/OFFER CLAUSES.docx' },
  { name: 'Team Fennessey Information Package.pdf', size: '1.3 MB', path: 'team-docs/buyer/Team Fennessey Information Package.pdf' },
  { name: 'RECO-Information-Guide.pdf', size: '2.3 MB', path: 'team-docs/buyer/RECO-Information-Guide.pdf' },
];

const SELLER_DOCS: TeamDoc[] = [
  { name: 'tresa-schedule-a-listing-agreement.docx', size: '27 KB', path: 'team-docs/seller/tresa-schedule-a-listing-agreement.docx' },
  { name: 'Listing Agreement - Sale - Form 271.pdf', size: '80 KB', path: 'team-docs/seller/Listing Agreement - Sale - Form 271.pdf' },
  { name: 'FINTRAC - Individual Identification Information Record.pdf', size: '495 KB', path: 'team-docs/seller/FINTRAC - Individual Identification Information Record.pdf' },
  { name: 'FINTRAC 635 - Receipt of Funds Record.pdf', size: '121 KB', path: 'team-docs/seller/FINTRAC 635 - Receipt of Funds Record.pdf' },
  { name: 'FINTRAC 636 - Beneficial Ownership.pdf', size: '85 KB', path: 'team-docs/seller/FINTRAC 636 - Beneficial Ownership.pdf' },
  { name: 'FINTRAC 639 - Risk Assessment.pdf', size: '232 KB', path: 'team-docs/seller/FINTRAC 639 - Risk Assessment.pdf' },
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

const RENTER_DOCS: TeamDoc[] = [
  { name: 'Tenant Representation Agreement - Form 372.pdf', size: '56 KB', path: 'team-docs/renter/Tenant Representation Agreement - Form 372.pdf' },
  { name: 'Listing Agreement - Lease - Form 272.pdf', size: '80 KB', path: 'team-docs/renter/Listing Agreement - Lease - Form 272.pdf' },
  { name: 'FINTRAC - Individual Identification Information Record.pdf', size: '154 KB', path: 'team-docs/renter/FINTRAC - Individual Identification Information Record.pdf' },
  { name: 'FINTRAC 635 - Receipt of Funds Record.pdf', size: '121 KB', path: 'team-docs/renter/FINTRAC 635 - Receipt of Funds Record.pdf' },
];

const FOLDERS = [
  { id: 'buyer', title: 'Buyer File', description: 'Buyer representation, offer clauses, FINTRAC forms, info package', docs: BUYER_DOCS },
  { id: 'seller', title: 'Seller File', description: 'Listing agreement, seller presentation, trade forms, FINTRAC', docs: SELLER_DOCS },
  { id: 'renter', title: 'Renter File', description: 'Tenant representation, lease listing agreement, FINTRAC forms', docs: RENTER_DOCS },
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

  const [uploading, setUploading] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<TeamDoc | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const handleReplace = async (doc: TeamDoc, file: File) => {
    setUploading(doc.path);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', doc.path);
      const res = await fetch('/api/team-docs/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      alert(`"${doc.name}" has been replaced.`);
    } catch (e: any) {
      alert('Replace failed: ' + e.message);
    }
    setUploading(null);
    setReplaceTarget(null);
  };

  const handleAddNew = async (file: File) => {
    const folderId = activeFolder; // buyer, seller, or renter
    const storagePath = `team-docs/${folderId}/${file.name}`;
    setUploading('new');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', storagePath);
      const res = await fetch('/api/team-docs/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      alert(`"${file.name}" uploaded. Refresh to see it.`);
    } catch (e: any) {
      alert('Upload failed: ' + e.message);
    }
    setUploading(null);
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

      {/* Hidden file inputs */}
      <input
        type="file"
        ref={replaceInputRef}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replaceTarget) handleReplace(replaceTarget, file);
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={addInputRef}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleAddNew(file);
          e.target.value = '';
        }}
      />

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">{folder.title}</h2>
          <button
            onClick={() => addInputRef.current?.click()}
            disabled={uploading !== null}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {uploading === 'new' ? 'Uploading…' : '+ Add New File'}
          </button>
        </div>
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
                  <button
                    onClick={() => { setReplaceTarget(doc); replaceInputRef.current?.click(); }}
                    disabled={uploading !== null}
                    className="px-4 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg disabled:opacity-50"
                  >
                    {uploading === doc.path ? 'Replacing…' : 'Replace 🔄'}
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

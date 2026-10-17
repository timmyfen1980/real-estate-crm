// /dashboard/documents — Team document library (Buyer/Seller/Renter files)
// Files live in Dropbox; this page provides quick access to each folder.

'use client';

import { useState } from 'react';
import Link from 'next/link';

interface TeamDoc {
  name: string;
  size: string;
}

const BUYER_DOCS: TeamDoc[] = [
  { name: 'New Home Utility.docx', size: '517 KB' },
  { name: 'Sched A Buyer rep.pdf', size: '681 KB' },
  { name: 'Buyer Schedule B.docx', size: '15 KB' },
  { name: 'New Home Utility.pdf', size: '117 KB' },
  { name: 'Copy of SHOWINGS REPORT.xlsx', size: '18 KB' },
  { name: 'FINTRAC - Individual Identification Information Record.pdf', size: '495 KB' },
  { name: 'LEASE CLAUSES.docx', size: '14 KB' },
  { name: 'FINTRAC - Receipt of Funds Record.pdf', size: '77 KB' },
  { name: 'OFFER CLAUSES.docx', size: '32 KB' },
  { name: 'Team Fennessey Information Package.pdf', size: '1.3 MB' },
  { name: 'RECO-Information-Guide.pdf', size: '2.3 MB' },
];

const SELLER_DOCS: TeamDoc[] = [
  { name: 'tresa-schedule-a-listing-agreement.docx', size: '27 KB' },
  { name: 'FINTRAC - Individual Identification Information Record.pdf', size: '495 KB' },
  { name: 'New Home Utility.pdf', size: '117 KB' },
  { name: 'Tim Fennessey - Selling is what I do!.pptx', size: '11 MB' },
  { name: 'RECO-Information-Guide.pdf', size: '2.3 MB' },
  { name: 'brokerbay-new-listing-info-sheet.pdf', size: '2.6 MB' },
  { name: 'rough-trade-letter-size-fillable.pdf', size: '397 KB' },
  { name: 'deposit-instructions-durham-region (1).pdf', size: '207 KB' },
  { name: 'Sched B.pdf', size: '2.1 MB' },
  { name: 'transaction-templates-amp-forms-2024.pdf', size: '154 KB' },
  { name: 'Tim Fennessey - Selling is what I do!.pdf', size: '2.8 MB' },
];

const FOLDERS = [
  {
    id: 'buyer',
    title: 'Buyer File',
    description: 'Buyer representation, offer clauses, FINTRAC forms, info package',
    docs: BUYER_DOCS,
    dropboxPath: '/Team Files/Buyer File',
  },
  {
    id: 'seller',
    title: 'Seller File',
    description: 'Listing agreement, seller presentation, trade forms, FINTRAC',
    docs: SELLER_DOCS,
    dropboxPath: '/Team Files/Seller File',
  },
  {
    id: 'renter',
    title: 'Renter File',
    description: 'Tenant documents — folder not yet in Dropbox',
    docs: [] as TeamDoc[],
    dropboxPath: '',
  },
];

export default function DocumentsPage() {
  const [activeFolder, setActiveFolder] = useState('buyer');
  const folder = FOLDERS.find((f) => f.id === activeFolder)!;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Documents</h1>
      <p className="text-gray-600 mb-6">
        Team document library — buyer, seller, and renter files. Click a file to download from Dropbox.
      </p>

      {/* Folder tabs */}
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

      {/* Folder contents */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-1">{folder.title}</h2>
        <p className="text-sm text-gray-500 mb-4">{folder.description}</p>

        {folder.docs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-2">📂</p>
            <p>No documents yet. Add files to the Renter File folder in Dropbox.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {folder.docs.map((doc) => (
              <div key={doc.name} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {doc.name.endsWith('.pdf') ? '📄' : doc.name.endsWith('.docx') ? '📝' : doc.name.endsWith('.xlsx') ? '📊' : doc.name.endsWith('.pptx') ? '📽️' : '📎'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                    <p className="text-xs text-gray-400">{doc.size}</p>
                  </div>
                </div>
                <a
                  href={`https://www.dropbox.com/home${folder.dropboxPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  Download ↓
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Files are stored in Dropbox under Team Files. Downloads open the Dropbox folder — click the file there to download.
      </p>
    </div>
  );
}

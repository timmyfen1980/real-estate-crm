// /dashboard/documents — Team document library with preview + download
'use client';

import { useState } from 'react';

interface TeamDoc {
  name: string;
  size: string;
  previewUrl: string;
  downloadUrl: string;
}

const BUYER_DOCS: TeamDoc[] = [
    { name: 'New Home Utility.docx', size: '517 KB', previewUrl: 'https://www.dropbox.com/scl/fi/g6hithdnk9jdd6nzy58mw/New-Home-Utility.docx?rlkey=dsf568i0b1k72iltlhrabodrj&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/g6hithdnk9jdd6nzy58mw/New-Home-Utility.docx?rlkey=dsf568i0b1k72iltlhrabodrj&dl=1' },
    { name: 'Sched A Buyer rep.pdf', size: '681 KB', previewUrl: 'https://www.dropbox.com/scl/fi/majxp8jvdn3q688g9zm3r/Sched-A-Buyer-rep.pdf?rlkey=b3wwhxlf95v6nqfqw3nfmy1rc&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/majxp8jvdn3q688g9zm3r/Sched-A-Buyer-rep.pdf?rlkey=b3wwhxlf95v6nqfqw3nfmy1rc&dl=1' },
    { name: 'Buyer Schedule B.docx', size: '15 KB', previewUrl: 'https://www.dropbox.com/scl/fi/kfp0pwe8nw91key09s5pg/Buyer-Schedule-B.docx?rlkey=8rvs3ci1359pz4qlzm97xhiiw&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/kfp0pwe8nw91key09s5pg/Buyer-Schedule-B.docx?rlkey=8rvs3ci1359pz4qlzm97xhiiw&dl=1' },
    { name: 'New Home Utility.pdf', size: '117 KB', previewUrl: 'https://www.dropbox.com/scl/fi/87qulkytk2c0x05flkmj2/New-Home-Utility.pdf?rlkey=mnoaxqk1m3ikmoknl3ogys5lm&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/87qulkytk2c0x05flkmj2/New-Home-Utility.pdf?rlkey=mnoaxqk1m3ikmoknl3ogys5lm&dl=1' },
    { name: 'Copy of SHOWINGS REPORT.xlsx', size: '18 KB', previewUrl: 'https://www.dropbox.com/scl/fi/go9evz6n5qvg44grlniqh/Copy-of-SHOWINGS-REPORT.xlsx?rlkey=xcqe8moal0kottjagahuiw7le&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/go9evz6n5qvg44grlniqh/Copy-of-SHOWINGS-REPORT.xlsx?rlkey=xcqe8moal0kottjagahuiw7le&dl=1' },
    { name: 'FINTRAC - Individual Identification Information Record.pdf', size: '495 KB', previewUrl: 'https://www.dropbox.com/scl/fi/3ot8t5snzmknjd5yhiaxc/FINTRAC-Individual-Identification-Information-Record.pdf?rlkey=ibzz4z17iu9xirpx7ntfr135h&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/3ot8t5snzmknjd5yhiaxc/FINTRAC-Individual-Identification-Information-Record.pdf?rlkey=ibzz4z17iu9xirpx7ntfr135h&dl=1' },
    { name: 'LEASE CLAUSES.docx', size: '14 KB', previewUrl: 'https://www.dropbox.com/scl/fi/2vas8qaan5g9mdd80gf8u/LEASE-CLAUSES.docx?rlkey=yraefkdoa49v23pusfkenb0g2&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/2vas8qaan5g9mdd80gf8u/LEASE-CLAUSES.docx?rlkey=yraefkdoa49v23pusfkenb0g2&dl=1' },
    { name: 'FINTRAC - Receipt of Funds   Record.pdf', size: '77 KB', previewUrl: 'https://www.dropbox.com/scl/fi/i26sgzl1rll9yey9cgevo/FINTRAC-Receipt-of-Funds-Record.pdf?rlkey=t24t8gzm6klfi4aov63zkujwo&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/i26sgzl1rll9yey9cgevo/FINTRAC-Receipt-of-Funds-Record.pdf?rlkey=t24t8gzm6klfi4aov63zkujwo&dl=1' },
    { name: 'OFFER CLAUSES.docx', size: '32 KB', previewUrl: 'https://www.dropbox.com/scl/fi/6ort7tnqwhxdzhea3ouof/OFFER-CLAUSES.docx?rlkey=au6evbx0uhx0mrg1lbxhhu9yn&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/6ort7tnqwhxdzhea3ouof/OFFER-CLAUSES.docx?rlkey=au6evbx0uhx0mrg1lbxhhu9yn&dl=1' },
    { name: 'Team Fennessey Information Package.pdf', size: '1.3 MB', previewUrl: 'https://www.dropbox.com/scl/fi/fxfbarqoqft7n5illo6b3/Team-Fennessey-Information-Package.pdf?rlkey=ewbylwmbj8h5my051urmua73w&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/fxfbarqoqft7n5illo6b3/Team-Fennessey-Information-Package.pdf?rlkey=ewbylwmbj8h5my051urmua73w&dl=1' },
    { name: 'RECO-Information-Guide.pdf', size: '2.3 MB', previewUrl: 'https://www.dropbox.com/scl/fi/py6yinz23ousqtyrqgy9u/RECO-Information-Guide.pdf?rlkey=54u7g8ihgh3qaiyd0m3b0py0p&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/py6yinz23ousqtyrqgy9u/RECO-Information-Guide.pdf?rlkey=54u7g8ihgh3qaiyd0m3b0py0p&dl=1' },
];

const SELLER_DOCS: TeamDoc[] = [
    { name: 'tresa-schedule-a-listing-agreement.docx', size: '27 KB', previewUrl: 'https://www.dropbox.com/scl/fi/x4rxuwkk62qtn53wmi07y/tresa-schedule-a-listing-agreement.docx?rlkey=5gmezi7gwiizxjqkcffkxtrbr&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/x4rxuwkk62qtn53wmi07y/tresa-schedule-a-listing-agreement.docx?rlkey=5gmezi7gwiizxjqkcffkxtrbr&dl=1' },
    { name: 'FINTRAC - Individual Identification Information Record.pdf', size: '495 KB', previewUrl: 'https://www.dropbox.com/scl/fi/9e4yzlw553bmnbg0d0qay/FINTRAC-Individual-Identification-Information-Record.pdf?rlkey=pwfymatgp8qzdwf7ibg9ovvkb&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/9e4yzlw553bmnbg0d0qay/FINTRAC-Individual-Identification-Information-Record.pdf?rlkey=pwfymatgp8qzdwf7ibg9ovvkb&dl=1' },
    { name: 'New Home Utility.pdf', size: '117 KB', previewUrl: 'https://www.dropbox.com/scl/fi/ax5spcot7odtljzbcrb86/New-Home-Utility.pdf?rlkey=gh5st81le1wdp2k138i63d412&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/ax5spcot7odtljzbcrb86/New-Home-Utility.pdf?rlkey=gh5st81le1wdp2k138i63d412&dl=1' },
    { name: 'Tim Fennessey - Selling is what I do!.pptx', size: '11 MB', previewUrl: 'https://www.dropbox.com/scl/fi/j1y563bwdxjm6b07wh3br/Tim-Fennessey-Selling-is-what-I-do.pptx?rlkey=t4e4iyp2or8fsh6wc2p8nlw3b&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/j1y563bwdxjm6b07wh3br/Tim-Fennessey-Selling-is-what-I-do.pptx?rlkey=t4e4iyp2or8fsh6wc2p8nlw3b&dl=1' },
    { name: 'RECO-Information-Guide.pdf', size: '2.3 MB', previewUrl: 'https://www.dropbox.com/scl/fi/92793xtm6ozrtm5zjsirs/RECO-Information-Guide.pdf?rlkey=84fmy8oca70xpodn9qpb4bsj6&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/92793xtm6ozrtm5zjsirs/RECO-Information-Guide.pdf?rlkey=84fmy8oca70xpodn9qpb4bsj6&dl=1' },
    { name: 'brokerbay-new-listing-info-sheet.pdf', size: '2.6 MB', previewUrl: 'https://www.dropbox.com/scl/fi/zp3tw0seiwn56tn935jo8/brokerbay-new-listing-info-sheet.pdf?rlkey=6bl8ejjdx0eqll5y7qznbhyyi&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/zp3tw0seiwn56tn935jo8/brokerbay-new-listing-info-sheet.pdf?rlkey=6bl8ejjdx0eqll5y7qznbhyyi&dl=1' },
    { name: 'rough-trade-letter-size-fillable.pdf', size: '397 KB', previewUrl: 'https://www.dropbox.com/scl/fi/01wjvudd2ubctjb9dfr1b/rough-trade-letter-size-fillable.pdf?rlkey=xtdn3v9fhsuyowjkqjwaoh6t2&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/01wjvudd2ubctjb9dfr1b/rough-trade-letter-size-fillable.pdf?rlkey=xtdn3v9fhsuyowjkqjwaoh6t2&dl=1' },
    { name: 'deposit-instructions-durham-region (1).pdf', size: '207 KB', previewUrl: 'https://www.dropbox.com/scl/fi/15hgnewv1cinjfn8vdpts/deposit-instructions-durham-region-1.pdf?rlkey=a822szv5828g9937pd66w0u9y&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/15hgnewv1cinjfn8vdpts/deposit-instructions-durham-region-1.pdf?rlkey=a822szv5828g9937pd66w0u9y&dl=1' },
    { name: 'Sched B.pdf', size: '2.1 MB', previewUrl: 'https://www.dropbox.com/scl/fi/hhjcoh274zydj4rqdstb2/Sched-B.pdf?rlkey=kc9v9doqz5i4zmo0xj386hdsm&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/hhjcoh274zydj4rqdstb2/Sched-B.pdf?rlkey=kc9v9doqz5i4zmo0xj386hdsm&dl=1' },
    { name: 'transaction-templates-amp-forms-2024.pdf', size: '154 KB', previewUrl: 'https://www.dropbox.com/scl/fi/geesdywpw5eg03jy236rm/transaction-templates-amp-forms-2024.pdf?rlkey=kc3804blkrtrwryavpumahwm0&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/geesdywpw5eg03jy236rm/transaction-templates-amp-forms-2024.pdf?rlkey=kc3804blkrtrwryavpumahwm0&dl=1' },
    { name: 'Tim Fennessey - Selling is what I do!.pdf', size: '2.8 MB', previewUrl: 'https://www.dropbox.com/scl/fi/j6nff3nt56i50tbrllrah/Tim-Fennessey-Selling-is-what-I-do.pdf?rlkey=6knacr6hyxx44jdygbjql6mdl&dl=0', downloadUrl: 'https://www.dropbox.com/scl/fi/j6nff3nt56i50tbrllrah/Tim-Fennessey-Selling-is-what-I-do.pdf?rlkey=6knacr6hyxx44jdygbjql6mdl&dl=1' },
];

const FOLDERS = [
  { id: 'buyer', title: 'Buyer File', description: 'Buyer representation, offer clauses, FINTRAC forms, info package', docs: BUYER_DOCS },
  { id: 'seller', title: 'Seller File', description: 'Listing agreement, seller presentation, trade forms, FINTRAC', docs: SELLER_DOCS },
  { id: 'renter', title: 'Renter File', description: 'Tenant documents — folder not yet in Dropbox', docs: [] as TeamDoc[] },
];

function fileIcon(name: string): string {
  if (name.endsWith('.pdf')) return '📄';
  if (name.endsWith('.docx')) return '📝';
  if (name.endsWith('.xlsx')) return '📊';
  if (name.endsWith('.pptx')) return '📽️';
  return '📎';
}

export default function DocumentsPage() {
  const [activeFolder, setActiveFolder] = useState('buyer');
  const [previewDoc, setPreviewDoc] = useState<TeamDoc | null>(null);
  const folder = FOLDERS.find((f) => f.id === activeFolder)!;

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
            <p>No documents yet. Add files to the Renter File folder in Dropbox.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {folder.docs.map((doc) => (
              <div key={doc.name} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{fileIcon(doc.name)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                    <p className="text-xs text-gray-400">{doc.size}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    Preview 👁️
                  </button>
                  <a
                    href={doc.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Download ↓
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-5xl h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold truncate">{previewDoc.name}</h3>
              <div className="flex gap-2">
                <a
                  href={previewDoc.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  Download ↓
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Close ✕
                </button>
              </div>
            </div>
            <iframe
              src={previewDoc.previewUrl}
              className="flex-1 w-full rounded-b-xl"
              title={previewDoc.name}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';

interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_photo_url: string | null;
}

// Shrink a picked photo in the browser before uploading it. Phone photos are
// several MB and the upload endpoint rejects bodies that large (the old page
// failed with "Request Entity Too Large"); a signature photo never needs to
// be bigger than this, so uploads stay small and always go through.
async function resizeForUpload(file: File, kind: 'hero' | 'headshot'): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = url;
    });
    const maxDim = kind === 'hero' ? 1200 : 600;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    );
    return blob || file;
  } catch {
    return file;
  }
}

async function postUpload(imageId: string, blob: Blob) {
  const formData = new FormData();
  formData.append('image', blob, 'upload.jpg');
  formData.append('imageId', imageId);
  const res = await fetch('/api/brand-images/upload', {
    method: 'POST',
    body: formData,
  });
  // Read as text first: a platform-level rejection is plain text, not JSON,
  // and parsing it as JSON is what produced the old cryptic error.
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON — handled below */
  }
  if (!res.ok) {
    throw new Error((data && data.error) || text.slice(0, 140) || 'Upload failed');
  }
  return data || {};
}

const TEMPLATE_BASE =
  'https://zftihampsyucluajcnmo.supabase.co/storage/v1/object/public/account-assets/brand/social-templates';

interface SocialTemplate {
  name: string;
  file: string;
  format: string;
  use: string;
}

const SOCIAL_TEMPLATES: SocialTemplate[] = [
  { name: 'Open House Cover', file: 'tpl-open-house-cover.png', format: 'Carousel · slide 1', use: 'First image of every open house post. Generic on purpose — never carries an address, price or time.' },
  { name: 'Open House Listing Slide', file: 'tpl-open-house-slide.png', format: 'Carousel · slide 2', use: 'The listing itself: photo set, price, address, specs and the open house day and time.' },
  { name: 'Just Listed — Hero', file: 'tpl-just-listed-1.png', format: 'Carousel · slide 1', use: 'New listing opener: price, address, specs and the swipe invite.' },
  { name: 'Just Listed — Interior Feature', file: 'tpl-just-listed-interior.png', format: 'Carousel · middle', use: 'Full-photo slide with one feature callout. Repeat for each room or feature worth showing.' },
  { name: 'Team Closing Slide', file: 'tpl-team-closing.png', format: 'Carousel · last', use: 'Ends every listing carousel: the team, a price recap and the book-a-showing call to action.' },
  { name: 'Just Listed — Single Image', file: 'tpl-just-listed-single.png', format: 'Single image', use: 'One-image version for when there is no carousel.' },
  { name: 'Just Sold — Hero', file: 'tpl-just-sold-1.png', format: 'Carousel · slide 1', use: 'Sold price and how fast it went. No client names without their permission.' },
  { name: 'Just Sold — Story', file: 'tpl-just-sold-2.png', format: 'Carousel · slide 2', use: 'How the sale came together, with the team. Fair framing when the buyer is also our client.' },
  { name: 'New Price', file: 'tpl-new-price.png', format: 'Single or carousel · slide 1', use: 'Price change announcement. Never shows the old price struck through.' },
  { name: 'Coming Soon', file: 'tpl-coming-soon.png', format: 'Single image', use: 'Pre-listing teaser: area and home type only — no price, no address.' },
  { name: 'Just Leased', file: 'tpl-just-leased.png', format: 'Carousel · slide 1', use: 'For lease deals: monthly rent, specs and the swipe invite.' },
  { name: 'Market Update', file: 'tpl-market-update.png', format: 'Single image', use: 'Monthly stats and rate-decision posts: three numbers, the team, and a what-it-means line.' },
  { name: 'Testimonial', file: 'tpl-testimonial.png', format: 'Single image', use: 'Quote card for a client review. Also generated automatically in the Testimonials manager.' },
  { name: 'Announcement — Flexible', file: 'tpl-announcement.png', format: 'Single image', use: 'The replaceable slot: swap the headline and paragraph for community news, events and one-offs.' },
];

export default function BrandImagesPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [membersError, setMembersError] = useState('');
  const [heroUrl, setHeroUrl] = useState('/api/email-hero');
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/brand-images/members');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load the team list.');
        setMembers(data.members || []);
      } catch (err: any) {
        setMembersError(err.message || 'Could not load the team list.');
      }
    })();
  }, []);

  const handleUpload = async (id: string, kind: 'hero' | 'headshot', file: File) => {
    setUploading(id);
    setMessage('');
    try {
      const blob = await resizeForUpload(file, kind);
      const data = await postUpload(id, blob);
      if (id === 'hero') {
        setHeroUrl('/api/email-hero?v=' + Date.now());
        setMessage('Email hero updated successfully!');
      } else {
        const fresh = (data.agent_photo_url || '') + '?v=' + Date.now();
        setMembers((prev) =>
          prev.map((m) => (m.id === id ? { ...m, agent_photo_url: fresh } : m))
        );
        setMessage('Photo updated successfully!');
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  const firstName = (m: Member) => (m.full_name || 'Team member').split(' ')[0];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Brand Images</h1>
      <p className="text-gray-600 mb-8">
        The email hero, plus a signature photo for everyone on the team. Add or replace a
        photo and it updates everywhere it is used, instantly. New team members show up
        here automatically.
      </p>

      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.startsWith('Error') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          {message}
        </div>
      )}

      <div className="grid gap-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold">Email Hero</h2>
              <p className="text-gray-600 text-sm">600×200 banner at the top of every email</p>
              <p className="text-gray-500 text-xs mt-1">Used in: All emails (newsletter + drip campaigns)</p>
            </div>
            <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              {uploading === 'hero' ? 'Uploading...' : 'Replace'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading === 'hero'}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload('hero', 'hero', file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center min-h-[120px]">
            <img src={heroUrl} alt="Email Hero" className="max-w-full h-auto rounded" style={{ maxHeight: '120px' }} />
          </div>
        </div>

        {membersError && (
          <div className="p-4 rounded-lg bg-red-100 text-red-800">{membersError}</div>
        )}

        {members.map((m) => (
          <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-semibold">{firstName(m)}&apos;s Headshot</h2>
                <p className="text-gray-600 text-sm">
                  Signature photo for {m.full_name || 'this team member'}
                  {m.email ? ` (${m.email})` : ''}
                </p>
                <p className="text-gray-500 text-xs mt-1">Used in: Email signature (follow-ups, campaigns, newsletters)</p>
              </div>
              <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                {uploading === m.id ? 'Uploading...' : m.agent_photo_url ? 'Replace' : 'Add photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading === m.id}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(m.id, 'headshot', file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center min-h-[120px]">
              {m.agent_photo_url ? (
                <img src={m.agent_photo_url} alt={`${firstName(m)}'s headshot`} className="max-w-full h-auto rounded" style={{ maxHeight: '150px' }} />
              ) : (
                <p className="text-gray-400 text-sm">No photo yet — add one and it will appear in {firstName(m)}&apos;s email signature.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-semibold">Social Media Templates</h2>
        <p className="text-gray-600 text-sm mt-1 mb-1">
          Every social post is built from one of these fixed templates, in the dark
          charcoal style. The listing photos and details change — the layout, logo
          position, team placement and footer never do, so every post looks like ours.
        </p>
        <p className="text-gray-500 text-xs mb-5">
          Rea builds posts from these templates. Samples below use 8 Calais Street.
          All templates are 1080×1350 (Instagram portrait).
        </p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SOCIAL_TEMPLATES.map((t) => (
            <div key={t.file} className="rounded-lg border border-gray-200 overflow-hidden">
              <img
                src={`${TEMPLATE_BASE}/${t.file}`}
                alt={t.name}
                className="w-full block"
                style={{ aspectRatio: '4 / 5', objectFit: 'cover' }}
              />
              <div className="p-3">
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-xs font-medium text-red-700 mt-0.5">{t.format}</p>
                <p className="text-xs text-gray-600 mt-1 leading-5">{t.use}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> The hero image is used in ALL emails. Changing it will affect the newsletter and all drip campaigns. Headshots are used in each person&apos;s email signature. Photos are automatically shrunk to a sensible size when you upload them, so big phone photos are fine.
        </p>
      </div>
    </div>
  );
}

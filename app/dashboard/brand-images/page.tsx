'use client';

import { useState, useEffect } from 'react';

interface BrandImage {
  id: string;
  name: string;
  description: string;
  url: string;
  location: string;
  usedIn: string;
}

export default function BrandImagesPage() {
  const [images, setImages] = useState<BrandImage[]>([
    {
      id: 'hero',
      name: 'Email Hero',
      description: '600×200 banner at the top of every email',
      url: '/api/email-hero',
      location: 'GitHub: public/email-hero.b64',
      usedIn: 'All emails (newsletter + 5 drip campaigns)',
    },
    {
      id: 'tim',
      name: "Tim's Headshot",
      description: 'Signature photo for Tim\'s emails',
      url: 'https://zftihampsyucluajcnmo.supabase.co/storage/v1/object/public/account-assets/a540905b-7cd7-4dd6-bba0-162c07978bd6/agents/tim-headshot.jpg',
      location: 'Supabase: account-assets/.../agents/tim-headshot.jpg',
      usedIn: 'Tim\'s email signature (drip campaigns)',
    },
    {
      id: 'aidan',
      name: "Aidan's Headshot",
      description: 'Signature photo for Aidan\'s emails',
      url: 'https://zftihampsyucluajcnmo.supabase.co/storage/v1/object/public/account-assets/a540905b-7cd7-4dd6-bba0-162c07978bd6/agents/aidan-headshot.jpg',
      location: 'Supabase: account-assets/.../agents/aidan-headshot.jpg',
      usedIn: 'Aidan\'s email signature (drip campaigns)',
    },
  ]);

  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const handleUpload = async (id: string, file: File) => {
    setUploading(id);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('imageId', id);
      
      const res = await fetch('/api/brand-images/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      
      setMessage(`${id} updated successfully!`);
      // Refresh the image (cache bust)
      setImages(prev => prev.map(img => 
        img.id === id ? { ...img, url: img.url.split('?')[0] + '?v=' + Date.now() } : img
      ));
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Brand Images</h1>
      <p className="text-gray-600 mb-8">
        The 3 images used across all emails. Upload a replacement to update everywhere instantly.
      </p>

      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.startsWith('Error') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          {message}
        </div>
      )}

      <div className="grid gap-8">
        {images.map((img) => (
          <div key={img.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-semibold">{img.name}</h2>
                <p className="text-gray-600 text-sm">{img.description}</p>
                <p className="text-gray-500 text-xs mt-1">Used in: {img.usedIn}</p>
                <p className="text-gray-400 text-xs font-mono mt-1">{img.location}</p>
              </div>
              <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                {uploading === img.id ? 'Uploading...' : 'Replace'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading === img.id}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(img.id, file);
                  }}
                />
              </label>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center min-h-[120px]">
              <img
                src={img.url}
                alt={img.name}
                className="max-w-full h-auto rounded"
                style={{ maxHeight: img.id === 'hero' ? '120px' : '150px' }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> The hero image is used in ALL emails. Changing it will affect the newsletter and all drip campaigns. The headshots are used in email signatures.
        </p>
      </div>
    </div>
  );
}

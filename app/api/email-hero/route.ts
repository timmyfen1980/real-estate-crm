import { NextResponse } from 'next/server';

// Serves the email hero header image from Supabase storage.
// Updated via the Brand Images page in the CRM dashboard.
const HERO_URL = 'https://zftihampsyucluajcnmo.supabase.co/storage/v1/object/public/account-assets/a540905b-7cd7-4dd6-bba0-162c07978bd6/brand/email-hero.jpg';

export async function GET() {
  try {
    const res = await fetch(HERO_URL);
    if (!res.ok) throw new Error('Failed to fetch hero');
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600', // 1 hour cache (was 1 year)
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Hero not found' }, { status: 404 });
  }
}

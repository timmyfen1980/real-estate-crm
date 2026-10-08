import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// Serves the email hero header image.
// The PNG is stored base64-encoded in public/email-hero.b64 (text-safe for git),
// decoded here and served with the correct content type.
export async function GET() {
  const b64 = readFileSync(join(process.cwd(), 'public', 'email-hero.b64'), 'utf8').trim();
  const buf = Buffer.from(b64, 'base64');
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

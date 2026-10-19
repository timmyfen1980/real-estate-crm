import { NextResponse } from 'next/server';
// Migration complete. This route is now disabled.
export async function POST() {
  return NextResponse.json({ error: 'not found' }, { status: 404 });
}
export async function GET() {
  return NextResponse.json({ error: 'not found' }, { status: 404 });
}

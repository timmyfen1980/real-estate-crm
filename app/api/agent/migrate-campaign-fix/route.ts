import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// One-time migration: fix 3 campaign step-1 openers.
// Protected by a one-time token. Delete this route after use.
const MIGRATION_TOKEN = 'c478b9e1dcb245a3a589ca3a5fe4d47d';

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const updates = [
    {
      id: 'b8e7b2bf-af4c-4968-b723-b2e3fe6f5f9b',
      subject: 'Great to connect',
      body_html: '<p>Great to connect with you.</p><p>Buying a home can feel overwhelming at times, especially with how quickly the market changes across Durham Region and surrounding areas.</p><p>One thing I always tell buyers is this:</p><ul><li>You do not need to figure everything out immediately</li><li>You do not need to rush</li><li>You just need the right guidance and the right plan</li></ul><p>Whether you are buying your first home, upsizing, downsizing, or just starting to explore options, I am here to help however I can.</p><p>If you ever want custom listings, neighbourhood advice, or just honest answers to questions, reply anytime.</p>',
    },
    {
      id: '4da5108e-12c5-4cef-a10e-e3f8c07b15c5',
      subject: 'Great to connect',
      body_html: '<p>Great to connect with you.</p><p>Whether you are thinking about selling soon or simply exploring your options, I am happy to be a resource for you.</p><p>One thing I always remind sellers is that preparation usually creates better results.</p><p>The more information you have early, the easier it becomes to make confident decisions later.</p><p>If you ever want honest advice about timing, pricing, preparation, or the current market, just reply anytime.</p>',
    },
    {
      id: 'dc3a2d9e-66a4-4062-9d8c-e204966bb38b',
      subject: 'Great to connect',
      body_html: '<p>Great to connect with you.</p><p>Whether you are currently renting, planning a move, or starting to think about future home ownership, I am happy to help however I can.</p><p>The rental market changes quickly, and having reliable guidance can make a big difference.</p><p>If you ever have questions about rentals, leases, neighbourhoods, or future buying plans, reply anytime.</p>',
    },
  ];

  const results = [];
  for (const u of updates) {
    const { error } = await supabase
      .from('email_sequences')
      .update({ subject: u.subject, body_html: u.body_html })
      .eq('id', u.id);
    results.push({ id: u.id, ok: !error, error: error?.message });
  }

  return NextResponse.json({ results });
}

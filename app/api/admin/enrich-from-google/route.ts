/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function normalizeName(n: string): string {
  return (n || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z ]/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token !== process.env.REA_AGENT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const googleContacts = body.google_contacts || [];
    const dryRun = body.dry_run !== false;

    const googleMap = new Map<string, any>();
    for (const g of googleContacts) {
      const key = normalizeName(`${g.first_name || ''} ${g.last_name || ''}`.trim());
      if (key && !googleMap.has(key)) {
        googleMap.set(key, g);
      }
    }

    let crmContacts: any[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, secondary_email, phone, secondary_phone')
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      crmContacts = crmContacts.concat(data);
      if (data.length < 1000) break;
      page++;
      if (page > 20) break;
    }

    let matched = 0;
    let enriched = 0;
    let skipped = 0;
    let noMatch = 0;
    const enrichments: any[] = [];
    const skipReasons: any[] = [];

    for (const c of crmContacts) {
      const key = normalizeName(`${c.first_name || ''} ${c.last_name || ''}`.trim());
      const g = googleMap.get(key);
      if (!g) {
        noMatch++;
        continue;
      }
      matched++;

      const updates: any = {};
      const added: string[] = [];

      const googleEmails = (g.emails || []).filter((e: string) => e && e.includes('@'));
      if (!c.email && googleEmails.length > 0) {
        updates.email = googleEmails[0];
        added.push(`email: ${googleEmails[0]}`);
      }
      if (!c.secondary_email && googleEmails.length > 1) {
        updates.secondary_email = googleEmails[1];
        added.push(`secondary_email: ${googleEmails[1]}`);
      }

      const googlePhones = (g.phones || []).filter((p: string) => p && p.replace(/\D/g, '').length >= 7);
      if (!c.phone && googlePhones.length > 0) {
        updates.phone = googlePhones[0];
        added.push(`phone: ${googlePhones[0]}`);
      }
      if (!c.secondary_phone && googlePhones.length > 1) {
        updates.secondary_phone = googlePhones[1];
        added.push(`secondary_phone: ${googlePhones[1]}`);
      }

      if (Object.keys(updates).length > 0) {
        if (!dryRun) {
          const { error } = await supabase
            .from('contacts')
            .update(updates)
            .eq('id', c.id);
          if (error) {
            // Skip constraint violations (email already on another contact)
            if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
              skipped++;
              skipReasons.push({
                name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
                reason: 'Email already exists on another contact',
              });
              continue;
            }
            throw error;
          }
        }
        enriched++;
        enrichments.push({
          contact_id: c.id,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          added,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total_crm: crmContacts.length,
      total_google: googleContacts.length,
      name_matched: matched,
      no_google_match: noMatch,
      enriched,
      skipped_duplicates: skipped,
      sample: enrichments.slice(0, 20),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

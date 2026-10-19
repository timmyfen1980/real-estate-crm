/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/admin/import-birthdays — match Facebook birthdays to CRM contacts.
// Auth: Bearer REA_AGENT_SECRET header.
// Body: { birthdays: [{ name, birthday }], dry_run?: boolean }
// Matches by normalized name, updates contacts.birthday where empty.
// Returns match statistics.

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
    const birthdays = body.birthdays || [];
    const dryRun = body.dry_run !== false; // default to dry run

    // Load all contacts with names
    let allContacts: any[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, birthday')
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allContacts = allContacts.concat(data);
      if (data.length < 1000) break;
      page++;
      if (page > 20) break;
    }

    // Build name -> contact map (normalized full name)
    const contactMap = new Map<string, any>();
    for (const c of allContacts) {
      const fullName = normalizeName(`${c.first_name || ''} ${c.last_name || ''}`.trim());
      if (fullName && !contactMap.has(fullName)) {
        contactMap.set(fullName, c);
      }
    }

    let matched = 0;
    let alreadyHad = 0;
    let noMatch = 0;
    let updated = 0;
    const matches: any[] = [];

    for (const b of birthdays) {
      const normName = normalizeName(b.name);
      const contact = contactMap.get(normName);
      if (!contact) {
        noMatch++;
        continue;
      }
      if (contact.birthday) {
        alreadyHad++;
        continue;
      }
      matched++;
      matches.push({
        contact_id: contact.id,
        name: `${contact.first_name} ${contact.last_name}`.trim(),
        birthday: b.birthday,
      });

      if (!dryRun) {
        const { error } = await supabase
          .from('contacts')
          .update({ birthday: b.birthday })
          .eq('id', contact.id);
        if (!error) updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total_birthdays: birthdays.length,
      total_contacts: allContacts.length,
      matched,
      already_had_birthday: alreadyHad,
      no_contact_match: noMatch,
      updated,
      // Include first 20 matches for review
      sample_matches: matches.slice(0, 20),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

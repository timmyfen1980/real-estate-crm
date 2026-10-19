/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/admin/find-duplicates — scan all contacts for duplicates.
// Auth: Bearer REA_AGENT_SECRET header.
// Checks: same email, same phone (normalized), same name, same address.
// Returns groups of potential duplicates.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function normalizeEmail(e: string | null): string {
  return (e || '').trim().toLowerCase();
}

function normalizePhone(p: string | null): string {
  // Strip all non-digits, drop leading 1 for NANP numbers
  let d = (p || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d;
}

function normalizeName(n: string | null): string {
  return (n || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeAddress(a: string | null, city: string | null): string {
  const full = `${a || ''} ${city || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
  return full;
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

    // Pull all contacts (paginated)
    let allContacts: any[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, address, city, created_at')
        .order('created_at', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allContacts = allContacts.concat(data);
      if (data.length < pageSize) break;
      page++;
      if (page > 20) break; // safety cap at 20k contacts
    }

    // Group by normalized keys
    const emailGroups = new Map<string, any[]>();
    const phoneGroups = new Map<string, any[]>();
    const nameGroups = new Map<string, any[]>();
    const addressGroups = new Map<string, any[]>();

    for (const c of allContacts) {
      const email = normalizeEmail(c.email);
      if (email) {
        if (!emailGroups.has(email)) emailGroups.set(email, []);
        emailGroups.get(email)!.push(c);
      }

      const phone = normalizePhone(c.phone);
      if (phone && phone.length >= 7) {
        if (!phoneGroups.has(phone)) phoneGroups.set(phone, []);
        phoneGroups.get(phone)!.push(c);
      }

      const name = `${normalizeName(c.first_name)}|${normalizeName(c.last_name)}`;
      if (normalizeName(c.first_name) || normalizeName(c.last_name)) {
        if (!nameGroups.has(name)) nameGroups.set(name, []);
        nameGroups.get(name)!.push(c);
      }

      const addr = normalizeAddress(c.address, c.city);
      if (addr.length > 5) {
        if (!addressGroups.has(addr)) addressGroups.set(addr, []);
        addressGroups.get(addr)!.push(c);
      }
    }

    // Filter to groups with 2+ contacts, format for display
    function formatGroups(groups: Map<string, any[]>, type: string) {
      const result = [];
      for (const [key, contacts] of groups) {
        if (contacts.length >= 2) {
          result.push({
            type,
            key,
            contacts: contacts.map((c: any) => ({
              id: c.id,
              name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
              email: c.email,
              phone: c.phone,
              address: [c.address, c.city].filter(Boolean).join(', '),
              created_at: c.created_at,
            })),
          });
        }
      }
      return result;
    }

    const duplicates = [
      ...formatGroups(emailGroups, 'same_email'),
      ...formatGroups(phoneGroups, 'same_phone'),
      ...formatGroups(nameGroups, 'same_name'),
      ...formatGroups(addressGroups, 'same_address'),
    ];

    return NextResponse.json({
      ok: true,
      total_contacts: allContacts.length,
      duplicate_groups: duplicates.length,
      groups: duplicates,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

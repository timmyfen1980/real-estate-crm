/* eslint-disable @typescript-eslint/no-explicit-any */
// Team identity — the ONE place branded surfaces read who the team is
// (Tim's productization direction, 2026-11-11: "it should all come
// from whatever is in the account info"). Before this lib existed, the
// team's names, titles, emails and numbers were hardcoded in ~40
// files; changing any of them meant a code push per surface.
//
// Resolution order, per field: the account's own stored value first
// (accounts + profiles, edited in Account → Team & Brand), then a
// generic fallback. Nothing FC-specific lives here on purpose: the FC
// Group's values are seeded into its account row by the one-time SQL
// (files/team-identity-setup.sql), so this file stays identical for
// every future team.
//
// Fields that need the setup SQL (they don't exist as columns yet):
// accounts.office_phone / info_email / website_url / instagram_handle /
// instagram_collabs / brokerage_address, profiles.title. Reads use
// select('*') so the lib works before AND after the SQL runs; a
// missing column simply falls back.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TeamPerson {
  userId: string;
  name: string;
  title: string;
  role: string;
}

export interface TeamIdentity {
  teamName: string;
  brokerageName: string;
  brokerageAddress: string;
  infoEmail: string;
  officePhone: string;
  websiteUrl: string;
  instagramHandle: string;
  instagramCollabs: string[];
  people: TeamPerson[];
}

function str(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function getTeamIdentity(
  supabase: SupabaseClient,
  accountId: string
): Promise<TeamIdentity> {
  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle();

  const { data: memberRows } = await supabase
    .from('account_users')
    .select('user_id, role, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true });

  const members = (memberRows || []) as any[];
  // Owner first, then everyone else in join order — the footer and
  // signature conventions speak for the team's first two people.
  const ordered = [
    ...members.filter((m) => m.role === 'owner'),
    ...members.filter((m) => m.role !== 'owner'),
  ];

  let people: TeamPerson[] = [];
  if (ordered.length) {
    const ids = ordered.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids);
    const byId = new Map<string, any>(
      ((profiles || []) as any[]).map((p) => [p.id, p])
    );
    people = ordered
      .map((m) => {
        const p = byId.get(m.user_id) || {};
        const name = str(p.full_name);
        if (!name) return null;
        return {
          userId: m.user_id,
          name,
          // Stored title wins; until it's set, the Ontario default:
          // the account owner is the Broker, members are Sales
          // Representatives. Editable per person in Team & Brand.
          title:
            str(p.title) ||
            (m.role === 'owner' ? 'Broker' : 'Sales Representative'),
          role: str(m.role) || 'agent',
        } as TeamPerson;
      })
      .filter(Boolean) as TeamPerson[];
  }

  const a: any = account || {};
  const collabs = str(a.instagram_collabs)
    .split(',')
    .map((s) => s.trim().replace(/^@/, ''))
    .filter(Boolean);

  return {
    teamName: str(a.team_name) || str(a.name),
    brokerageName: str(a.brokerage_name),
    brokerageAddress: str(a.brokerage_address),
    infoEmail: str(a.info_email) || str(a.email),
    officePhone: str(a.office_phone) || str(a.phone),
    websiteUrl: str(a.website_url),
    instagramHandle: str(a.instagram_handle).replace(/^@/, ''),
    instagramCollabs: collabs,
    people,
  };
}

// "Tim Fennessey, Broker · Aidan Comeau, Sales Representative ·
//  info@thefcgroup.ca · 905 668-3800" — the slide-footer line, built
// from the first two people + the office contact points. Segments
// that aren't set are simply left out.
export function identityFooterLine(id: TeamIdentity): string {
  const names = id.people
    .slice(0, 2)
    .map((p) => (p.title ? `${p.name}, ${p.title}` : p.name))
    .join(' · ');
  return [names, id.infoEmail, id.officePhone].filter(Boolean).join(' · ');
}

// The two-line RECO block used on the team slide:
// line 1 the first two people's names + titles, line 2 the brokerage
// plus the office contact points.
export function identityRecoLines(id: TeamIdentity): {
  line1: string;
  line2: string;
} {
  const line1 = id.people
    .slice(0, 2)
    .map((p) => (p.title ? `${p.name}, ${p.title}` : p.name))
    .join(' · ');
  const line2 = [id.brokerageName.toUpperCase(), id.infoEmail, id.officePhone]
    .filter(Boolean)
    .join(' · ');
  return { line1, line2 };
}

// "thefcgroup.ca" from "https://www.thefcgroup.ca" for print lines.
export function websiteHost(id: TeamIdentity): string {
  return id.websiteUrl
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

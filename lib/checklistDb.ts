// Helpers for the FC Group checklist system (CRM side).
// Uses the existing Supabase browser client (@/lib/supabaseClient).

import { supabase } from '@/lib/supabaseClient';
import { CHECKLISTS, ChecklistType } from '@/lib/checklists';

export interface ClientFile {
  id: string;
  account_id: string;
  crm_deal_id: string | null;
  crm_contact_id: string | null;
  checklist_types: ChecklistType[];
  client_names: string;
  phone_email: string | null;
  property_address: string | null;
  lawyer_name: string | null;
  lawyer_firm: string | null;
  lawyer_contact: string | null;
  coop_info: string | null;
  deal_dates: Record<string, string>;
  financials: Record<string, string>;
  conditions: string | null;
  notes: string | null;
  portal_token: string | null;
  portal_enabled: boolean;
  created_at: string;
}

export interface ClientDocument {
  id: string;
  client_file_id: string;
  checklist_type: ChecklistType;
  stage_index: number;
  doc_index: number;
  document: string;
  form: string | null;
  required: string;
  view_form: string | null;
  beth_note: string | null;
  status: 'pending' | 'received' | 'waived' | 'na';
  received_at: string | null;
  received_via: string | null;
  file_url: string | null;
  notes: string | null;
}

export async function getAccountId(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data: membership } = await supabase
    .from('account_users')
    .select('account_id')
    .eq('user_id', userData.user.id)
    .single();
  return membership?.account_id ?? null;
}

/** Create a client file and seed its document rows from the checklist definitions. */
export async function createClientFile(input: {
  account_id: string;
  checklist_types: ChecklistType[];
  client_names: string;
  phone_email?: string;
  property_address?: string;
  lawyer_name?: string;
  lawyer_firm?: string;
  lawyer_contact?: string;
  coop_info?: string;
  deal_dates?: Record<string, string>;
  financials?: Record<string, string>;
  conditions?: string;
  notes?: string;
  crm_deal_id?: string;
  crm_contact_id?: string;
}): Promise<ClientFile> {
  const { data: file, error } = await supabase
    .from('client_files')
    .insert({
      account_id: input.account_id,
      checklist_types: input.checklist_types,
      client_names: input.client_names,
      phone_email: input.phone_email || null,
      property_address: input.property_address || null,
      lawyer_name: input.lawyer_name || null,
      lawyer_firm: input.lawyer_firm || null,
      lawyer_contact: input.lawyer_contact || null,
      coop_info: input.coop_info || null,
      deal_dates: input.deal_dates || {},
      financials: input.financials || {},
      conditions: input.conditions || null,
      notes: input.notes || null,
      crm_deal_id: input.crm_deal_id || null,
      crm_contact_id: input.crm_contact_id || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Seed document rows from checklist definitions
  const rows: Omit<ClientDocument, 'id' | 'received_at'>[] = [];
  for (const type of input.checklist_types) {
    const checklist = CHECKLISTS[type];
    checklist.stages.forEach((stage, stage_index) => {
      stage.items.forEach((item, doc_index) => {
        rows.push({
          client_file_id: file.id,
          checklist_type: type,
          stage_index,
          doc_index,
          document: item.document,
          form: item.form || null,
          required: item.required,
          view_form: item.viewForm || null,
          beth_note: item.bethNote,
          status: 'pending',
          received_via: null,
          file_url: null,
          notes: null,
        });
      });
    });
  }

  if (rows.length > 0) {
    const { error: docError } = await supabase.from('client_documents').insert(rows);
    if (docError) throw docError;
  }

  return file;
}

/** Generate (or regenerate) a portal magic-link token for a client file. */
export async function enablePortalAccess(clientFileId: string): Promise<string> {
  const token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  const { error } = await supabase
    .from('client_files')
    .update({ portal_token: token, portal_enabled: true, updated_at: new Date().toISOString() })
    .eq('id', clientFileId);

  if (error) throw error;
  return token;
}

export function portalLink(token: string): string {
  // Website client portal URL — update if the website uses a different domain
  const base = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://www.thefcgroup.ca';
  return `${base}/client/${token}`;
}

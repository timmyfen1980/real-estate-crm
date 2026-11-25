/* eslint-disable @typescript-eslint/no-explicit-any */
// Beth's Training — hands-on practice exercises with fake clients.
//
// Beth works through the exercises in the real CRM using clearly fake
// "TRAINING" clients, ticks each one complete as she finishes it, and
// Tim reviews her work (the fake files themselves) and ticks Reviewed.
// Only Beth and the account owner (Tim) may use this feature. Data
// access goes through the service role after a session check, same
// pattern as lib/contractorHours.ts.

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FC_ACCOUNT_ID, BETH_USER_ID } from '@/lib/contractorHours';

export { FC_ACCOUNT_ID, BETH_USER_ID };

export interface TrainingExercise {
  key: string;
  title: string;
  minutes: string;
  intro: string;
  steps: string[];
  doneWhen: string;
  // Name fragment of the fake client this exercise is built around
  // (e.g. 'Tina Buyer' for TRAINING Tina Buyer). Used to find the
  // practice client file Beth created so it can be linked directly.
  fakeClient?: string;
}

export const TRAINING_EXERCISES: TrainingExercise[] = [
  {
    key: 'start-documents',
    title: 'Start here: the Documents library',
    minutes: '10 min',
    intro:
      'Every blank form and team document lives in Documents in the sidebar, sorted into Buyer, Seller and Renter folders. Learn where things live before you build any files.',
    steps: [
      'Open Documents in the sidebar and look through the Buyer File, Seller File and Renter File folders.',
      'Open the Client File Quick Reference (it is the first document in every folder). That one sheet shows what belongs in each kind of client file.',
      'In the Seller folder, find the RE/MAX Hallmark kit list (transaction-templates-amp-forms-2024.pdf) — that is the brokerage’s full list of every form for every deal type.',
      'Find a blank FINTRAC — Individual Identification Information Record in the Buyer folder and open it so you know what the form looks like.',
    ],
    doneWhen: 'You can find any form in the library in under a minute.',
  },
  {
    key: 'fake-buyer-file',
    fakeClient: 'Tina Buyer',
    title: 'Create a fake BUYER file',
    minutes: '20 min',
    intro:
      'Practise the file you will build most often. Use the fake client exactly as written so Tim can find and review it: contact name “TRAINING Tina Buyer”, property “123 Practice Street, Whitby”, price $500,000, deposit $25,000.',
    steps: [
      'Create a new contact named TRAINING Tina Buyer (make up a phone number and email — put “training” in the email, e.g. tina.training@example.com).',
      'Create a BUYER client file for her. Then open the file and use Edit in the Deal information section at the top to fill in the property address (123 Practice Street, Whitby), Price ($500,000) and Deposit ($25,000). Those fields are not asked for when the file is created — they live in that Edit form, and the deposit amount gets used later by the FINTRAC receipt.',
      'Work through Stage 1: for the photo ID row, upload a photo of a driver’s licence (your own is fine — this file gets deleted after review).',
      'For the Buyer Representation Agreement row: remember the agreement itself is sent by the agent for signing — practise marking the row the way you would once the signed copy comes back.',
      'Open the FINTRAC 630 row and look at what information it needs from the licence.',
      'In the note box below, write the name of the file you created.',
    ],
    doneWhen: 'The buyer file exists, Stage 1 is filled in, and the checklist progress has moved.',
  },
  {
    key: 'fake-seller-file',
    fakeClient: 'Sam Seller',
    title: 'Create a fake SELLER file',
    minutes: '20 min',
    intro:
      'A seller file starts with the listing paperwork, before any offer exists. Fake client: “TRAINING Sam Seller”, property “456 Sample Avenue, Oshawa”. Note: there is no list price to enter on a seller file — the price lives on the Listing Agreement itself, not in the file.',
    steps: [
      'Create a new contact named TRAINING Sam Seller and a SELLER client file. Open the file and use Edit in the Deal information section at the top to set the property address to 456 Sample Avenue, Oshawa.',
      'Work through the Listing stage: photo ID, Seller Representation Agreement (Form 271 — again, the agent sends it for signing), FINTRAC 630.',
      'For the property tax bill row: there is no sample tax bill in the Documents library, so use the Client File Quick Reference PDF (first item in the Seller folder) as a stand-in file, just to practise the upload.',
      'For the BrokerBay listing info sheet row, the blank sheet is in the Seller folder of the Documents library (brokerbay-new-listing-info-sheet.pdf) — download it and upload it to that row. The MLS data sheet has no blank in the library, so use the Quick Reference PDF as the stand-in there too.',
      'In the note box below, write the name of the file you created.',
    ],
    doneWhen: 'The seller file exists and the Listing stage is complete.',
  },
  {
    key: 'fake-tenant-file',
    fakeClient: 'Terry Tenant',
    title: 'Create a fake TENANT file',
    minutes: '20 min',
    intro:
      'Tenant files are mostly about collecting the application package from the tenant. Fake client: “TRAINING Terry Tenant”, applying for “789 Example Crescent, Whitby” at $2,200/month.',
    steps: [
      'Create a new contact named TRAINING Terry Tenant and a TENANT client file.',
      'Collect the full package the way a real tenant would send it: Rental Application (Form 410 — the blank is in the Renter folder of the Documents library), photo ID, Equifax credit report, employment letter, and two pay stubs. Use sample documents you make yourself or pull from the Documents library as stand-ins.',
      'File each document on its own checklist row — one document per row, never a bundle on one row.',
      'Add the signed Tenant Representation Agreement (Form 372) row.',
      'In the note box below, write the name of the file you created.',
    ],
    doneWhen: 'The tenant file exists and every required Stage 1 row has its document (the rows marked “if applicable” can stay empty).',
  },
  {
    key: 'fake-landlord-file',
    fakeClient: 'Laura Landlord',
    title: 'Create a fake LANDLORD file',
    minutes: '15 min',
    intro:
      'A landlord file is the mirror of a seller file, but for a lease listing. Fake client: “TRAINING Laura Landlord”, property “321 Demo Drive, Ajax”.',
    steps: [
      'Create a new contact named TRAINING Laura Landlord and a LANDLORD client file for 321 Demo Drive, Ajax.',
      'Work through the Listing stage: photo ID, Landlord Representation Agreement (Form 272 — we are designated representation), its Schedule (Form 211), and FINTRAC 630.',
      'Add the MLS data sheet (lease) and BrokerBay rows.',
      'Move to the Tenant Found stage and look at what it asks for (an accepted Agreement to Lease, its schedules, a Confirmation of Co-operation, and the tenant’s FINTRAC rows). You do not need to complete this stage for the exercise.',
      'In the note box below, write the name of the file you created.',
    ],
    doneWhen: 'The landlord file exists and the Listing stage is complete.',
  },
  {
    key: 'licence-portal-test',
    fakeClient: 'Tina Buyer',
    title: 'Test the driver’s licence link like a client',
    minutes: '15 min',
    intro:
      'Clients get a portal link where they upload their own documents — including their driver’s licence, which the system reads automatically. Try it yourself so you can talk a client through it.',
    steps: [
      'Open your TRAINING Tina Buyer file and click “Enable Client Portal” at the top of the file, then copy the portal link it gives you.',
      'Open the portal link in a private/incognito browser window so you see exactly what a client sees.',
      'Upload a photo of a driver’s licence where the portal asks for ID (your own licence is fine — the training file is deleted after review).',
      'Go back to the CRM and check what the upload did: the client’s name, address, date of birth and licence number should be filled in from the licence, and only into fields that were blank.',
      'Note anything that looks wrong or confusing in the note box below — Tim wants to hear about it.',
    ],
    doneWhen: 'You have uploaded a licence through the portal and checked the details it filled in.',
  },
  {
    key: 'fintrac-generate-test',
    fakeClient: 'Tina Buyer',
    title: 'Generate the FINTRAC forms',
    minutes: '15 min',
    intro:
      'On a buyer file with an accepted offer, the CRM can fill the FINTRAC forms for you. Practise on your fake buyer so the first real one is not your first try.',
    steps: [
      'Open your TRAINING Tina Buyer file and check the Deal information at the top shows Deposit $25,000 (you set it back in Exercise 2 — the Receipt of Funds form uses that amount). The FINTRAC rows live in Stage 1 (Form 630) and Stage 2 — Offer (Form 635).',
      'Use the one-click FINTRAC buttons to generate Form 630 (Individual Identification Information Record) and Form 635 (Receipt of Funds Record).',
      'Open both PDFs and check them like a reviewer: full legal name spelled right, dates in the right places, and the 635 amount matches the $25,000 deposit.',
      'If anything looks off, write what you saw in the note box below instead of fixing it silently.',
    ],
    doneWhen: 'Both FINTRAC forms are generated on the fake buyer file and you have read them over.',
  },
];

export interface TrainingContext {
  userId: string;
  role: string;
  isOwner: boolean;
  isBeth: boolean;
  supabase: SupabaseClient;
}

export type TrainingAuthResult =
  | { ok: true; ctx: TrainingContext }
  | { ok: false; response: NextResponse };

export async function requireTrainingAccess(): Promise<TrainingAuthResult> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }),
    };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: membership, error: membershipError } = await supabase
    .from('account_users')
    .select('account_id, role')
    .eq('user_id', user.id)
    .eq('account_id', FC_ACCOUNT_ID)
    .single();

  if (membershipError || !membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No access to this account.' },
        { status: 403 }
      ),
    };
  }

  const isOwner = membership.role === 'owner';
  const isBeth = user.id === BETH_USER_ID;
  if (!isOwner && !isBeth) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This page is only for Beth and Tim." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: { userId: user.id, role: membership.role, isOwner, isBeth, supabase },
  };
}

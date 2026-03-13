REAL ESTATE CRM – SYSTEM STATE SNAPSHOT

(March 2026 – Authoritative Architecture)

1️⃣ Core Stack

Next.js 16 (App Router)

Supabase (Postgres + Auth + RLS)

Resend (transactional email)

Multi-agent team structure

Open house ingestion system

Client-side dashboard (Supabase browser client)

Server-side ingestion APIs (service role only)

2️⃣ Architecture Pattern
Public / Ingestion Flows

/api/open-house → uses supabaseAdmin

/api/properties → uses supabaseAdmin

Bypasses RLS intentionally

Handles:

Lead creation

Duplicate detection

Assignment logic

Conflict task generation

Feature sheet email

Rate limiting

Dashboard (Authenticated Users)

Uses createBrowserClient

Uses anon key

Fully RLS-protected

No service role used in dashboard

All reads + writes are client-side

Authorization enforced at DB level via RLS

This separation is intentional.

3️⃣ Leads – Schema
Column	Nullable
id	NO
account_id	NO
assigned_user_id	NO
first_name	NO
user_id (creator)	YES
open_house_event_id	YES
email	YES
status	YES
deal_type	YES

Important:

Leads can NEVER be unassigned.

assigned_user_id is NOT NULL.

4️⃣ Contacts – Schema
Column	Nullable
id	NO
account_id	NO
assigned_user_id	NO
created_by	YES

Contacts can never be unassigned.

5️⃣ RLS Enforcement Model
Leads

Policies enforce:

Owner can update any lead.

Members can update leads in their account.

Members cannot change assigned_user_id.

Only owner can reassign.

Creator (user_id) can manage their own lead.

Account isolation enforced.

Result:
Assignment is protected at DB level.
Client-side reassignment is not insecure.

Contacts

Owner full access.

Agent only if assigned_user_id = auth.uid().

Strict assignment enforcement.

Tasks

Scoped to account_id.

Any account member can update any task.

No assignment-based restriction.

Notes

User can only manage notes they created.

Can insert notes referencing any lead/contact in account.

Accounts

Owners can update team.

Account isolation via account_users.

One SELECT policy allows authenticated read of accounts.

6️⃣ Assignment Model (Current)
Automatic Assignment

Open house ingestion assigns:

Event agent OR

Account owner

Manual lead creation assigns:

Creator (default)

Reassignment

Only owner can reassign.

Enforced via RLS.

Currently handled client-side.

No historical tracking yet.

7️⃣ Multi-Agent Conflict Handling

When duplicate lead detected:

Note inserted on lead

Task created for team owner

source: multi_agent_review

No dedicated needs_review column

No lead_activity timeline UI yet

8️⃣ Email System

Resend

Domain verified

From: info@thefcgroup.ca

Reply-to: owner email

Feature sheet status stored in DB

feature_sheet_sent_at tracked

9️⃣ Data Integrity

account_id NOT NULL on leads and contacts

assigned_user_id NOT NULL

(email, account_id) unique on leads

FK relationships exist

RLS enabled on all core tables

🔟 What Is NOT Built Yet

Lead assignment history table UI

Structured activity timeline

Assignment change logging

Notification on reassignment

Needs Review filter

Transactional API for reassignment

Task assignment restrictions

Audit log visibility

System is:
MVP production capable
Not yet enterprise-audited

1️⃣1️⃣ Important Constraints

Dashboard uses browser Supabase client.

RLS is relied upon for enforcement.

Service role must not be used in dashboard.

Leads and contacts cannot be unassigned.

Only owner can reassign.

1️⃣2️⃣ Known UI Mismatch

Lead detail page includes:

<option value="">Unassigned</option>

But assigned_user_id is NOT NULL.

This must be corrected.

1️⃣3️⃣ Current Status Classification

Security: Enforced at DB level
Account Isolation: Correct
Assignment Control: Correct
Audit Trail: Not implemented
Activity Timeline: Not implemented
Notification Layer: Not implemented

1️⃣4️⃣ Future Direction (Undecided)

Potential improvements:

lead_activity logging for assignment changes

Reassignment API endpoint for atomic logging

Task-level assignment enforcement

Audit log UI

Lead lifecycle automation

Owner review dashboard

Activity feed component

✅ What This Snapshot Solves

When pasted into a new chat:

It prevents re-auditing.

It prevents assumptions.

It defines enforcement layer.

It clarifies architecture direction.

It answers security concerns.

It documents intentional design.
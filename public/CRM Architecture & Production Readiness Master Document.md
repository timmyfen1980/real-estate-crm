CRM Architecture & Production Readiness Master Document

System: Multi-Tenant Real Estate CRM
Stack: Next.js (App Router) + Supabase + Tailwind + TypeScript
Isolation Model: account_id + Row Level Security (RLS)

Authoritative Version: v1.3 – Phase 1 Stabilization
Architecture Freeze Date: March 6, 2026
Next Architecture Review: Start of Phase 2 (Hardening)

⚠️ DEVELOPMENT RULES (MANDATORY)

Any assistant helping on this project must follow these rules.

Never guess file structure.

Never propose edits without reviewing the full file.

Prefer block replacements over tiny inserts.

Always reference exact existing code before suggesting changes.

Do not redesign architecture during Phase 1.

Respect working flows.

UI-level enforcement is acceptable in Phase 1.

Do not introduce Phase-2 infrastructure changes unless requested.

Always give clear search targets when suggesting edits.

Assume the user is not a developer.

🧭 PHASE MODEL
🟡 Phase 1 — Workflow Stabilization (Current)

Goal:

Stable workflow
Reliable UI
Predictable system behavior

Focus areas:

Identity model
Task system
Contact management
Property management
Open house lead capture
Activity timeline
Multi-agent behavior

Not included in Phase 1:

API route migration
DB enum enforcement
DB role enforcement
Centralized role provider
Audit log system
Rate limiting
Abuse mitigation
Soft delete system

These belong to Phase 2 Hardening.

🏗 SYSTEM OVERVIEW

Multi-tenant CRM architecture.

Tenant structure:

Account
 └ Users
 └ Contacts
 └ Properties
 └ Leads
 └ Tasks
 └ Open Houses

Isolation enforced by:

account_id
Row Level Security
account_users membership

All records belong to an account.

🔐 ROLE MODEL

Roles:

owner
agent

Stored in:

account_users

Resolution:

Queried per page

Enforcement:

UI only

Owner capabilities:

View all tasks
Assign tasks
Assign contacts
View all leads

Agent capabilities:

View account contacts
View assigned tasks

This is acceptable for Phase 1.

👤 CONTACT MODEL (AUTHORITATIVE IDENTITY)

Contacts represent people.

Table:

contacts

Important fields:

id
account_id
assigned_user_id
first_name
last_name
preferred_name
email
secondary_email
phone
secondary_phone
lifecycle_stage
birthday
marriage_anniversary
spouse_name
children_names
number_of_children
pet_names
address
city
province
postal_code
preferred_contact_method
best_time_to_contact
language_preference
source
referral_source
campaign
lead_capture_method
last_contacted_at
next_followup_date
instagram
facebook
linkedin
twitter
tags
created_at

Constraint:

UNIQUE(account_id, email)

Relationships:

contacts
 ├ notes
 ├ tasks
 ├ leads
 └ property_contacts

Contacts are the authoritative identity record.

🏠 PROPERTY MODEL

Table:

properties

Fields:

id
account_id
address
city
province
postal_code
status
image_url
feature_sheet_url
created_at

Relationships:

properties
 ├ property_contacts
 └ open_house_events

Implemented features:

Property creation
Property editing
Property image upload
Feature sheet upload
Seller linking
Seller removal
Seller modal search
🔗 PROPERTY_CONTACTS (JOIN TABLE)

Purpose:

Links contacts to properties

Fields:

property_id
contact_id
role

Current role used:

seller

Relationships:

property_contacts
 ├ properties
 └ contacts
🏡 OPEN HOUSE SYSTEM

Table:

open_house_events

Fields:

property_id
event_date
start_time
end_time

Workflow:

Property
 └ Open House
     └ Leads captured

Implemented features:

Open house creation
Open house page
Lead capture
Attendance tracking
📊 LEADS

Table:

leads

Purpose:

Represents pipeline opportunities

Fields:

contact_id
assigned_user_id
source
status
created_at

Sources:

Open house
Manual entry

Duplicate prevention:

UNIQUE(account_id, email)
🗂 TASK SYSTEM

Table:

tasks

Fields:

account_id
assigned_user_id
title
description
priority
status
due_date
due_time
completed_at
lead_id
contact_id
source

Capabilities:

Dashboard tasks
Task creation
Task completion
Tasks visible on contact page
Tasks visible on lead page

Task scope rules:

Task may belong to contact
Task may belong to lead
Task may exist standalone
📝 NOTES

Table:

notes

Purpose:

Freeform notes attached to contacts

Fields:

contact_id
user_id
content
created_at
📜 ACTIVITY TIMELINE

Table:

lead_activity

Fields:

lead_id
contact_id
user_id
type
metadata
created_at

Events logged:

task_created
task_updated
task_completed
lead_reassigned
lead_status_changed

Displayed on:

Contact page
Lead page
📥 CONTACT IMPORT SYSTEM

Location:

dashboard/contacts/import/page.tsx

Purpose:

Import contacts from legacy CRM

Required features:

Upload CSV
Preview rows
Map columns
Insert contacts
Prevent duplicates
Assign account_id

Status:

Importer page exists
Importer logic incomplete
📚 DATABASE SCHEMA MAP
accounts
   │
   ├ account_users
   │       └ profiles
   │
   ├ contacts
   │       ├ notes
   │       ├ tasks
   │       ├ leads
   │       └ property_contacts
   │
   ├ properties
   │       ├ property_contacts
   │       └ open_house_events
   │               └ leads
   │
   ├ leads
   │       ├ tasks
   │       └ lead_activity
   │
   └ tasks

Purpose:

Prevent future development sessions from guessing schema relationships.

📁 CURRENT PROJECT STRUCTURE
app
│
├ api
│   ├ open-house
│   │   └ route.ts
│   └ properties
│       └ route.ts
│
├ dashboard
│   │ layout.tsx
│   │ page.tsx
│
│   ├ account
│   │   └ page.tsx
│
│   ├ contacts
│   │   │ page.tsx
│   │   ├ import
│   │   │   └ page.tsx
│   │   └ [id]
│   │       └ page.tsx
│
│   ├ leads
│   │   │ page.tsx
│   │   └ [id]
│   │       └ page.tsx
│
│   ├ open-houses
│   │   │ page.tsx
│   │   └ [id]
│   │       └ page.tsx
│
│   └ properties
│       └ [id]
│           └ page.tsx
│
├ login
├ signup
├ verify-email
├ open-house
│   └ [id]
│       └ page.tsx
└ properties
    └ new
        └ page.tsx
📊 CURRENT FEATURE COMPLETION MAP
Feature	Status
Authentication	✅ Complete
Account system	✅ Complete
Multi-tenant isolation	✅ Complete
Contacts list	✅ Complete
Contact detail page	✅ Complete
Contact editing	✅ Complete
Notes system	✅ Complete
Task system	✅ Complete
Task completion	✅ Complete
Activity timeline	✅ Complete
Lead system	✅ Complete
Property system	✅ Complete
Seller linking	✅ Complete
Seller modal search	✅ Complete
Open house system	✅ Complete
Open house lead capture	✅ Complete
Contact → property display	⚠ In progress
Contact import	⚠ Not complete
🎯 CURRENT ISSUE BEING FIXED

Goal:

Display properties on the contact detail page.

Expected UI:

Properties
----------------
123 Main St
Whitby ON
View

Data source:

property_contacts → properties

Status:

properties state exists
UI rendering verification required
🏁 PHASE 1 EXIT CRITERIA

Phase 1 is complete when:

Contacts stable
Leads stable
Tasks stable
Properties stable
Open house system stable
Seller linking stable
Contact → property display working
Contact import working
No JSX instability
No broken flows

At that point:

System ready for internal production launch
🛣 PHASE 2 — HARDENING (FUTURE)

Will include:

API route abstraction
DB enum enforcement
DB role enforcement
Centralized role provider
Audit log system
Rate limiting
Abuse mitigation
Soft delete system
Storage security hardening
Invite flow
🎯 SYSTEM IDENTITY

The CRM is currently:

Workflow stable
Multi-tenant isolated
Contact-centric identity model
Property + open house system operational
Task system operational
Importer pending

The system is not SaaS hardened yet.
This is intentional.

---------------------------------------------------------------------

🚀 PHASE 1 COMPLETION — LIVE SYSTEM STATUS (March 18, 2026)

System is now LIVE and stable for real-world usage.

This section reflects final implemented behavior after Phase 1 completion.
This is now the authoritative reference for current system state.

---------------------------------------------------------------------

🏡 OPEN HOUSE SYSTEM — FINAL STATE

Status: ✅ COMPLETE + LIVE

Public open house page:

app/open-house/[id]/page.tsx

Capabilities:

• Public access (no authentication required)
• RLS configured to allow safe public reads for:
  - open_house_events
  - properties
  - accounts

• QR code ready usage
• Mobile-friendly layout
• Lead capture fully functional

---------------------------------------------------------------------

🎨 OPEN HOUSE BRANDING SYSTEM (NEW)

Branding is now dynamically rendered from the accounts table.

Fields used:

accounts:
- name
- logo_url (agent logo)
- team_logo_url
- brokerage_logo_url
- brokerage_name
- phone (if present)
- owner_email (if present)

---------------------------------------------------------------------

🧠 BRANDING DISPLAY LOGIC (FINAL)

Location: Under property image (left column)

Rendering rules:

1. Agent logo (logo_url) → ALWAYS shown if exists
2. Team logo (team_logo_url) → shown alongside agent logo
3. Brokerage logo → ONLY shown if both above are missing

Layout:

[ Agent Logo ]   [ Team Logo ]

Then:

Agent Name  
Brokerage Name  
Contact Info  

Design goals achieved:

• Clean
• Professional
• Listing-style presentation
• QR-friendly
• Mobile responsive

---------------------------------------------------------------------

🖼 BRANDING UX IMPROVEMENTS

• Branding moved BELOW property image for visual clarity
• Removed top-heavy header layout
• Centered on mobile, left-aligned on desktop
• Logos scaled appropriately (agent smaller, team slightly larger)

---------------------------------------------------------------------

🏢 ACCOUNT BRANDING SYSTEM — FINAL STATE

Location:

dashboard/account/page.tsx

Status: ✅ COMPLETE

Capabilities:

• Agent logo upload
• Brokerage logo upload
• Team logo upload
• Team name management
• Invite code display + copy
• File uploads stored in Supabase Storage (account-assets bucket)

---------------------------------------------------------------------

🐛 CRITICAL BUG FIXES COMPLETED

1. Agent Logo Not Persisting

Issue:
Logo disappeared after refresh

Cause:
userRole dependency prevented logo from loading

Fix:
setLogoUrl now always uses loaded.logo

Result:
✅ Logo persists after refresh
✅ Matches DB state correctly

---------------------------------------------------------------------

2. Team Section Disappearing

Issue:
Team UI not visible

Cause:
Strict dependency on teamEnabled

Fix:
Team section now safely rendered when enabled and preserved correctly

Result:
✅ Team settings visible
✅ Team logo upload functional
✅ Invite code visible

---------------------------------------------------------------------

3. Branding Mismatch (Open House Page)

Issue:
Wrong logo displayed (brokerage instead of team)

Fix:
Explicit priority + side-by-side rendering

Result:
✅ Agent + Team logos both visible
✅ Correct hierarchy enforced

---------------------------------------------------------------------

📦 STORAGE STRUCTURE (CONFIRMED)

Bucket: account-assets

Paths:

Agent logo:
{accountId}/agents/{timestamp}-{filename}

Brokerage logo:
{accountId}/brokerage-logo.ext

Team logo:
{accountId}/team-logo.ext

All URLs resolved via:
supabase.storage.getPublicUrl()

---------------------------------------------------------------------

📊 FEATURE COMPLETION UPDATE

Feature	Status

Open house public page	✅ LIVE
Branding system	✅ COMPLETE
Agent logo persistence	✅ FIXED
Team logo system	✅ COMPLETE
Team invite system	✅ COMPLETE
QR-ready open house flow	✅ COMPLETE

---------------------------------------------------------------------

🧾 CURRENT SYSTEM STATE (IMPORTANT)

The CRM is now:

• Fully usable in real-world scenarios
• Stable across core workflows
• Branding-ready for agents/teams
• Lead capture operational
• Multi-tenant isolation working correctly

This is the FIRST production-capable version of the system.

---------------------------------------------------------------------

🎯 NEXT PHASE — LEAD NURTURE / EMAIL SYSTEM

Planned next work:

• Automated email follow-ups
• Lead tagging + segmentation
• Open house follow-up sequences
• Manual + automated outreach
• Email templates per scenario

This will be built ON TOP of current stable system.

---------------------------------------------------------------------

⚠️ WARNING FOR FUTURE DEVELOPMENT

DO NOT:

• Rework branding logic
• Change storage paths
• Alter open house public access rules
• Modify RLS without full understanding
• Introduce backend restructuring yet

System is now STABLE — protect this baseline.

---------------------------------------------------------------------
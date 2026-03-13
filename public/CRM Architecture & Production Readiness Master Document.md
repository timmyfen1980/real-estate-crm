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


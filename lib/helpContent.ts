// lib/helpContent.ts — Help & Training content: the single source of truth.
//
// The coaching guide lives here as structured modules. Three readers use
// the SAME text, so updating the guide once updates everything:
//   1. the in-CRM Rea chat (via the search_help tool in /api/rea-chat),
//   2. the Help & Training page (/dashboard/help),
//   3. the printed coaching plan for a new team member.
//
// Structure (from the 2026-11-11 help design): CORE modules are generic —
// they describe how the product works using roles ("your Broker", "your
// team lead"), never a specific team's names, so the same content ships
// to any brokerage. TEAM_OVERLAY carries one team's own rules; the chat
// reads core + overlay together. A buying team replaces the overlay with
// theirs and the whole help system speaks their language.

export type HelpAudience = "agent" | "coordinator" | "admin" | "all";

export interface HelpModule {
  id: string;
  title: string;
  audience: HelpAudience;
  summary: string;
  body: string;
  steps: string[];
  tryIt: string;
  watchOut: string[];
  link: string;
  linkLabel: string;
  keywords: string[];
}

export const HELP_MODULES: HelpModule[] = [
  {
    id: "golden-rules",
    title: "The Golden Rules",
    audience: "all",
    summary:
      "The handful of team standards that apply everywhere in the CRM — titles, approvals, signed copies, designated forms, and never deleting a contact.",
    body:
      "These rules sit underneath every other module. Most expensive mistakes in a CRM come from breaking one of them, so they are worth learning first.\n\nYour team's own versions of these rules (names, titles, rates) live in the team overlay and are read together with this module.",
    steps: [
      "Titles matter: on anything that leaves the office, use each person's correct RECO title — the Broker is the Broker, the Sales Representative is the Sales Representative, never reversed and never merged into one joint title.",
      "Client-facing sends are approved by your team lead first. Draft freely; the lead confirms and sends. (CRM follow-up emails are the exception once your own email account is connected — see the Email module.)",
      "A signed copy replaces the unsigned copy: when a signed document comes back, it becomes the copy of record in the client file.",
      "Know your representation model and use the matching agreement forms: designated representation uses the designated forms (buyer 371, seller 271, tenant 372, landlord 272), never the brokerage versions (300 / 346 / 200 / 210).",
      "Never delete a contact to tidy up. Deleting ends their email sequences and removes their history. If someone should not be chased anymore, use Stop follow-ups instead (Contacts module).",
      "Practise on the test client. Every workspace has a test buyer/client file for trying things — use it instead of a real client's file when an exercise says to practise.",
    ],
    tryIt:
      "Read the six rules out loud once. Then, the next time you touch any document, check rule 1 and rule 3 before you act.",
    watchOut: [
      "Deleting a contact is the one tidy-up that cannot be undone — it ends drips and erases history.",
    ],
    link: "/dashboard",
    linkLabel: "Open the Dashboard",
    keywords: ["rules", "standards", "titles", "broker", "approvals", "delete contact", "designated", "signed copy"],
  },
  {
    id: "getting-around",
    title: "Getting Around",
    audience: "all",
    summary:
      "The Dashboard shows your own work; the sidebar badges tell you what needs attention (Leads) and what is due within 3 days (Tasks). Where everything lives.",
    body:
      "When you sign in you land on the Dashboard. Everything on it — counts, lists, reminders — shows your own items, not the whole team's. The team picture lives on each page's Team view where one exists (Tasks has one).\n\nThe Leads badge counts your leads that need attention right now; when someone is stopped, they drop out of the count. The Tasks badge counts tasks due within 3 days or overdue. Tasks further out sit in an Upcoming section on the Tasks page and roll into the count automatically as they get close — a small badge number is normal and does not mean there is no work coming.",
    steps: [
      "Sign in and land on the Dashboard — it is your day at a glance, showing only your own items.",
      "Check the sidebar numbers: Leads = your leads needing attention; Tasks = due within 3 days or overdue.",
      "Go to the right place for the job: Leads for enquiries, Contacts for master records, Tasks for your to-do list, Client Files (Checklists) for a client's paperwork, Offers for an offer in progress.",
      "Email tools live under the Emails section (Campaigns, Email Health, Email Cleanup); marketing campaigns live in Lead Campaigns; the draw lives in Giveaway.",
      "Open Houses holds open-house events and sign-ins; Brand Images holds the team photos used in emails; Account holds your profile and connections.",
      "Use the Team toggle where a page offers one (Tasks does) when you need the whole team's picture instead of just yours.",
    ],
    tryIt:
      "Find your Tasks number in the sidebar, then open Tasks and look at the Upcoming section — that's your next couple of weeks taking shape. Open the Team toggle on Tasks to see how it differs from your own list.",
    watchOut: [
      "A low Tasks badge does not mean an empty week — check Upcoming before assuming.",
    ],
    link: "/dashboard",
    linkLabel: "Open the Dashboard",
    keywords: ["dashboard", "sidebar", "navigate", "navigation", "menu", "badge", "where is", "home"],
  },
  {
    id: "contacts",
    title: "Contacts",
    audience: "all",
    summary:
      "Contacts are the master records everything pulls from. Search before you add, keep occupation and licence details complete, and use Stop follow-ups instead of deleting.",
    body:
      "Contacts are the master records — every lead, client file, form and email pulls its details from here, so accuracy here saves rework everywhere.\n\nFields that matter most: name, email and phone (names are automatically cleaned up to proper capitals when saved); address, city, province and postal code (used on forms); occupation and the Driver's Licence section — licence number, province, expiry, date of birth — which feed the FINTRAC forms; and notes, the running dated story of the relationship.\n\nStop follow-ups (on a contact, and on a lead) does three things at once: flags the person do-not-contact so newsletters and broadcasts skip them, clears their open follow-up tasks, and pauses their email drip. Resume switches the flag off — but a paused drip stays paused until it is restarted from Email Drips, so resuming is not an accidental re-start of everything.",
    steps: [
      "Always search a name before adding a contact — duplicates split a client's history across two records.",
      "If you find two records for the same person, do not delete one; flag it for your team lead.",
      "Fill the fields forms will need later: full address, occupation, and the Driver's Licence section (number, province, expiry, date of birth).",
      "Add dated notes as things happen — notes are the record the whole team relies on.",
      "To stop chasing someone, open their contact and use Stop follow-ups: it flags do-not-contact, clears their open follow-up tasks, and pauses their drip in one click.",
      "To restart contact later, use Resume on the record. Remember the drip stays paused until restarted separately in Email Drips.",
    ],
    tryIt:
      "Open a complete contact (your team's most recent buyer) and find the occupation and licence details — that completeness is the standard a contact needs before FINTRAC forms will generate. Then find the Stop follow-ups button so you know where it lives — don't press it on a real client.",
    watchOut: [
      "Never delete a duplicate or an unwanted contact yourself — deletion ends enrollments and removes history.",
      "A contact missing occupation or licence number will block FINTRAC generation later.",
    ],
    link: "/dashboard/contacts",
    linkLabel: "Open Contacts",
    keywords: ["contact", "contacts", "add contact", "duplicate", "stop follow-ups", "do not contact", "resume", "licence", "occupation", "notes"],
  },
  {
    id: "leads",
    title: "Leads",
    audience: "all",
    summary:
      "A lead is the opportunity, the contact is the person. Add a note after every contact — it stamps last-contacted and completes the check-in task. Working-with-a-realtor leads are hands-off.",
    body:
      "A lead is someone who has enquired — through the website, a campaign, an open house, or added by hand — and is not a client yet. Leads and contacts are linked: the lead is the opportunity, the contact is the person.\n\nThe daily habit that makes leads work: work the leads that need attention (that is the sidebar count), and after any contact with a lead, add a note on the lead. Adding a note stamps the last-contacted time and automatically completes any open check-in task for that lead. If you emailed from your own inbox instead, the lead page's 'Follow-up done — sent from my email' button records the same thing.\n\nA lead flagged 'working with a realtor' is not to be followed up, ever — no tasks, no check-ins, no outreach. They stay in the system for one reason only: to receive a price-change email on a home they viewed.",
    steps: [
      "Work your attention list first — those are the leads the sidebar badge is counting.",
      "After any call, text or meeting, add a note on the lead the same day; it stamps last-contacted and completes the open check-in task automatically.",
      "If you emailed the lead from your own email account, use 'Follow-up done — sent from my email' on the lead page so the follow-up is recorded.",
      "Check for the 'working with a realtor' flag before any outreach — flagged leads are hands-off, always.",
      "When your team lead says you have reached out enough, stop the chase from the Leads list with the Stop button — same effect as on the contact.",
    ],
    tryIt:
      "Open any lead and find: where its source is shown, where the notes go, the working-with-a-realtor flag, and the Stop button. Then open the Email Follow-ups card on your dashboard and see how the two connect.",
    watchOut: [
      "Never follow up a lead flagged 'working with a realtor' — no exceptions for a friendly check-in.",
      "A follow-up that is not noted did not happen, as far as the system (and the next person covering for you) is concerned.",
    ],
    link: "/dashboard/leads",
    linkLabel: "Open Leads",
    keywords: ["lead", "leads", "follow up", "follow-up", "check-in", "note", "working with a realtor", "attention", "stop"],
  },
  {
    id: "tasks",
    title: "Tasks",
    audience: "all",
    summary:
      "Your badge and main list count tasks due within 3 days or overdue; the rest wait in Upcoming. Check-in tasks complete themselves when you note the lead.",
    body:
      "Tasks come from three places: you create them, your team creates them, and the system creates them (follow-up reminders, check-ins, closing-related items).\n\nYour dashboard and badge count only your tasks; the Tasks page Team toggle shows everyone's, with names. Only tasks due within 3 days (or overdue) count in the badge and the main list — everything else waits in Upcoming and rolls up automatically. Check-in tasks (titles linked to a lead) complete themselves when a note is added to that lead, or can be completed manually. Monday open-house follow-up tasks appear automatically for unrepresented visitors from the weekend's open houses.",
    steps: [
      "Start from the Dashboard or the sidebar badge — that is your due-in-3-days-or-overdue list.",
      "Open Tasks and scan Upcoming so nothing further out surprises you.",
      "Complete tasks as you finish them; do not let finished work sit open.",
      "For a check-in task, add the note on the lead — the task completes itself. If you reached the person another way, complete it manually.",
      "Create future tasks with honest due dates; anything beyond 3 days will wait quietly in Upcoming.",
    ],
    tryIt:
      "Complete one real task end-to-end. Then create a practice task for yourself due in 10 days, watch it land in Upcoming instead of your main count, and delete it again so the list stays honest.",
    watchOut: [
      "The badge is a 3-day window, not your whole workload — plan from Upcoming too.",
    ],
    link: "/dashboard/tasks",
    linkLabel: "Open Tasks",
    keywords: ["task", "tasks", "to-do", "todo", "upcoming", "overdue", "due", "check-in task", "complete"],
  },
  {
    id: "client-files",
    title: "Client Files & Checklists",
    audience: "coordinator",
    summary:
      "One file per client: checklist, documents and portal access. Buyer files require 2 things, seller and landlord files 3 — the representation agreement is agent-sent, never an upload.",
    body:
      "When someone becomes a client, they get a client file: one place for their checklist, their documents, and their portal access. Creating a file: pick the client (their contact), the file type (buyer / seller / landlord) and the property address — the checklist builds itself from the type.\n\nWhat is actually required (everything else is optional and does not count toward progress): a Buyer file needs 2 things — the client's driver's licence uploaded, and a signed Buyer Representation Agreement (Form 371). The agreement is NOT an upload: the agent sends it to the client to sign, and the checklist tracks that; progress shows as x/2. A Seller file needs 3 things: tax bill uploaded, driver's licence uploaded, and the Seller Representation Agreement (Form 271, agent-sent, same model). A Landlord file is the same as seller, with the Landlord Representation Agreement (Form 272).\n\nWorking a file: upload documents against their checklist rows as they arrive; when a document is signed (through iinked, or in person and scanned back), upload the signed copy to the same row — it replaces the unsigned prepared copy as the copy of record. The client's portal shows them their own checklist progress and, as their deal moves stages, their documents — what you file is what they see. When a client uploads government ID through the portal, the system reads name, address, date of birth and licence number and fills in blank fields only on their contact and file — it never overwrites existing data, but still glance at it; a misread digit on a licence number matters.",
    steps: [
      "Create the file: New file → pick the contact, the file type (buyer / seller / landlord), and the property address. The checklist builds itself.",
      "Learn the required set for the type: Buyer = licence upload + Form 371 (agent-sent). Seller = tax bill + licence upload + Form 271 (agent-sent). Landlord = same as seller with Form 272.",
      "Upload each document against its checklist row as it arrives.",
      "When a signed copy returns, upload it to the same row — it replaces the unsigned prepared copy as the copy of record.",
      "After an ID upload auto-fills a contact, proofread the licence number and date of birth against the document.",
      "Check the file's progress (x/2 or x/3) before telling anyone a file is complete.",
    ],
    tryIt:
      "Open the test buyer file and walk the checklist: which items are required, where an upload goes, and where the agreement row explains that the agent sends it. Then open a real seller file (read-only) and compare its required set.",
    watchOut: [
      "The representation agreement is agent-sent, not an upload — do not wait for the client to upload it.",
      "Optional checklist items do not count toward progress; a file can look long and still be complete.",
      "ID auto-fill only fills blanks — if a field was wrong before the upload, it stays wrong until you fix it.",
    ],
    link: "/dashboard/checklists",
    linkLabel: "Open Client Files",
    keywords: ["client file", "checklist", "checklists", "buyer file", "seller file", "landlord", "required", "upload", "portal", "371", "271", "272", "tax bill"],
  },
  {
    id: "fintrac",
    title: "Paperwork & FINTRAC Forms",
    audience: "coordinator",
    summary:
      "Form 630 generates in one click once the contact has name, occupation and licence number. Form 635 is only for a buyer with an accepted offer, once funds are actually received.",
    body:
      "Most forms in this system are question-driven: you answer questions, the system fills the official form, and the filled PDF stays editable — you can open it and adjust before anything is sent.\n\nFINTRAC Form 630 (Individual Identification Information Record) generates from the client file, or the contact's Driver's Licence card, in one click. Before it will work, the contact needs a name, occupation, and licence number; if something is missing, the page asks for exactly that, saves it to the contact, and then generates. The form comes out with the client's details, licence info, the property address, the sales rep's name and the standard risk answers completed, and it files itself into the client's checklist automatically.\n\nFINTRAC Form 635 (Receipt of Funds Record) is only for a buyer with an accepted offer, when funds have actually been received. From the client file, the button asks how much (it suggests the file's deposit amount — check it is the amount actually received) and how the funds arrived (electronic, in person, or mail). It completes the provider section from the client's ID details automatically.",
    steps: [
      "Before generating, open the contact and confirm: full legal name, occupation, licence number, licence expiry, and date of birth are all on file.",
      "For a Form 630: open the client file (or the contact's Driver's Licence card) and click Generate 630. If the page asks for a missing field, enter it there — it saves to the contact.",
      "Open the generated 630 and proofread it: name, address, date of birth, occupation, licence number, expiry.",
      "For a Form 635: only once a buyer's offer is accepted AND the funds are actually in hand, open the client file and click Generate 635.",
      "Enter the amount actually received (the suggested amount is the file's deposit — verify it) and how the funds arrived: electronic, in person, or mail.",
      "If a client's licence was renewed, update the expiry on the contact first, then generate — forms take their dates from the contact.",
    ],
    tryIt:
      "On the test buyer, generate a Form 630. Open the resulting PDF and check it like a proofreader: name, address, date of birth, occupation, licence number, expiry. That proofreading habit is the whole quality system for generated forms.",
    watchOut: [
      "A 635 is a record of money received — never generate it before the deposit is actually in hand.",
      "A generated form with wrong source data is worse than no form: the contact is always the fix, then regenerate.",
    ],
    link: "/dashboard/checklists",
    linkLabel: "Open Client Files",
    keywords: ["fintrac", "630", "635", "identification", "receipt of funds", "generate form", "licence", "deposit"],
  },
  {
    id: "offers",
    title: "Offers",
    audience: "all",
    summary:
      "An offer package holds the forms, the answers behind them, and the signing state. Save to package refreshes every form; signing sends from inside the package.",
    body:
      "The Offers page lists offer packages. A package holds everything for one offer on one property: the forms, the answers behind them, and the signing state.\n\nInside a package, forms are filled by answering the workspace questions — that is where the details live (price, deposit, dates, chattels). Save to package refreshes every form in the package from the current answers, not just the one you are looking at, so if you changed an answer, save before sending anything. 'Send for signature — iinked Sign' lives inside the package, in the signing section, and sends the package out for e-signature. When a package is sent from the CRM, the signed copies file themselves back into the package and the client file when signing completes.",
    steps: [
      "Open Offers and pick the package — one package per offer on one property.",
      "Work in the workspace questions; the forms are generated from those answers.",
      "After changing any answer, use Save to package — it regenerates every form in the package, not just the open one.",
      "To send for signature, use the signing section inside the package ('Send for signature — iinked Sign').",
      "After signing completes, confirm the signed copies have filed back into the package and the client file.",
    ],
    tryIt:
      "Open any existing package (read-only) and find: the forms list, where the answers live, the Save to package button, and the signing section. Don't send anything.",
    watchOut: [
      "If a signing package was created directly inside iinked (not from the CRM), there is no link back — signed copies will not arrive on their own and must be uploaded by hand. Flag it for your team lead.",
      "Sending before saving means the client signs yesterday's answers — save first, every time.",
    ],
    link: "/dashboard/offers",
    linkLabel: "Open Offers",
    keywords: ["offer", "offers", "package", "workspace", "signature", "signing", "iinked", "syngrafii", "save to package", "forms"],
  },
  {
    id: "email",
    title: "Email: Drips, Follow-ups & the Newsletter",
    audience: "all",
    summary:
      "Connect your own email once in Account. Drips run automatically; your Follow-ups card is a reply queue where dismissal is final; the newsletter sends only after the team lead approves it.",
    body:
      "Setup first: go to Account and click Connect Outlook (or your email provider). Until you do, follow-up emails you send from the CRM cannot go out from your own mailbox — they fall back to a generic team sender. One click, once.\n\nEmail Drips are the automatic sequences (for example, a buyer drip that educates new leads over a few months). People are enrolled automatically when they arrive from the website or a campaign, and by hand when needed. Deleting a contact ends their enrollments, and Stop follow-ups pauses a person's drip; resuming contact does not restart it — a drip is restarted deliberately, from Email Drips.\n\nYour Email Follow-ups card (on the Dashboard) lists people whose emails to you are waiting on a reply, based on your own inbox. Work it like a queue: reply, or dismiss — a dismissal is final for that message. Automated mail (booking confirmations, no-reply senders, showing notifications) is filtered out on purpose.\n\nThe monthly newsletter goes to past clients and subscribers. The approval window opens on the 20th of the month before each issue, and nothing sends until the team lead approves it. Every email the system sends uses the standard team template automatically (team photo header, signature cards, brokerage footer) — you never format an email yourself.",
    steps: [
      "One-time setup: Account → Connect Outlook, so your follow-ups send from your own mailbox.",
      "Work your Email Follow-ups card on the Dashboard like a queue: reply, or dismiss. Dismissal is final for that message.",
      "Know what drips do: they enroll automatically from the website and campaigns; Stop follow-ups pauses them; only a deliberate restart in Email Drips resumes them.",
      "Never promise a newsletter date — the issue sends only after the team lead approves it, in the window that opens on the 20th of the month before.",
      "Trust the template: every system email carries the team header, signature cards and brokerage footer automatically.",
    ],
    tryIt:
      "Connect your email in Account. Then look at your Email Follow-ups card and clear it to zero — reply or dismiss each one — so you can feel how the queue is meant to work.",
    watchOut: [
      "Deleting a contact ends their drip enrollments — use Stop follow-ups instead.",
      "Resuming a contact does not restart their drip; that is deliberate, not a bug.",
    ],
    link: "/dashboard/campaigns",
    linkLabel: "Open Email Campaigns",
    keywords: ["email", "drip", "drips", "follow-ups card", "newsletter", "connect outlook", "enrollment", "sequence", "approve"],
  },
  {
    id: "open-houses",
    title: "Open Houses",
    audience: "all",
    summary:
      "Each open house has a tablet sign-in link. The host is emailed their link automatically on weekend mornings; unrepresented visitors get Monday follow-up tasks.",
    body:
      "Open houses have a sign-in page — a link the host opens on a tablet at the house. Visitors sign themselves in, including whether they have their own agent.\n\nFor the office's MLS-advertised open houses, the system checks on Friday, Saturday and Sunday mornings and emails the host their sign-in link in advance, automatically — the host is the first agent named on the MLS listing, so the link is in the host's inbox before the weekend and nobody needs to chase it.\n\nVisitors who came without an agent get follow-up tasks created for the Monday. Visitors with an agent are left to their agent.",
    steps: [
      "Find the event under Open Houses; each event has its own sign-in link for the host's tablet.",
      "Rely on the automatic link: for MLS-advertised open houses, the host is emailed their sign-in link on Friday, Saturday and Sunday mornings.",
      "At the house, visitors sign in themselves and answer whether they have their own agent.",
      "After the weekend, check the sign-in list — the 'working with a realtor' answers decide who gets a Monday follow-up task.",
      "Work Monday follow-ups from Tasks like any other task.",
    ],
    tryIt:
      "Open the Open Houses section, find a past event, and look at its sign-in list. Notice the 'working with a realtor' answers — that's the field that decides who gets a Monday follow-up.",
    watchOut: [
      "Visitors with their own agent are never followed up by us — their agent handles them.",
    ],
    link: "/dashboard/open-houses",
    linkLabel: "Open Open Houses",
    keywords: ["open house", "sign-in", "sign in", "tablet", "host", "visitors", "mls"],
  },
  {
    id: "lead-campaigns",
    title: "Lead Campaigns & the Giveaway",
    audience: "all",
    summary:
      "Campaigns carry tracked links so arrivals are stamped with their source. Cards collapse to a slim row; deleting a campaign removes that run, not the idea.",
    body:
      "Lead Campaigns is the board for marketing campaigns (for example a home-worth campaign or a buyer quiz). Each campaign has a tracked link; people who arrive through it are stamped with the campaign on their contact, so the team can see what actually produces clients. Cards collapse to a slim row — click to expand. Campaigns are repeatable runs: deleting one removes that run, not the idea behind it.\n\nThe Giveaway page manages the current draw and its entries.\n\nSocial posts for campaigns go out on the team's group social account, with the team members invited as collaborators — your team's overlay names the exact accounts.",
    steps: [
      "Open Lead Campaigns and expand a card to see its tracked link and its pulled / contacted / clients / deals counts.",
      "Use the campaign's tracked link anywhere the campaign is promoted — that is how arrivals get stamped with the source.",
      "Remember deleting a campaign deletes the run only; the idea stays and can be run again.",
      "Check Giveaway for the current draw and its entries when someone asks about the contest.",
    ],
    tryIt:
      "Open Lead Campaigns, expand one card, and find its tracked link and its pulled / contacted / clients / deals counts.",
    watchOut: [
      "An untracked link produces clients you cannot attribute — always share the tracked link.",
    ],
    link: "/dashboard/lead-campaigns",
    linkLabel: "Open Lead Campaigns",
    keywords: ["campaign", "campaigns", "lead campaigns", "tracked link", "giveaway", "draw", "quiz", "marketing"],
  },
  {
    id: "hours-invoicing",
    title: "Hours & Invoicing",
    audience: "coordinator",
    summary:
      "For contractor coordinators: log hours the same day, entries stay editable until invoiced, and bundling uninvoiced hours every two weeks creates the invoice.",
    body:
      "This page exists for the team's contractor coordinator and the team lead. Log hours as you go — date, hours, and a few words on what you worked on; same-day entries are what make the invoices painless. Entries stay editable until they are invoiced; once hours are bundled into an invoice, those entries lock.\n\nEvery two weeks, bundle the uninvoiced hours into an invoice. Invoices are numbered and produce a clean PDF, billed to the team lead's corporation at the agreed hourly rate. If the coordinator has no HST number yet, invoices carry no HST; once the number is entered in the page's settings, invoices add HST automatically from then on. The team lead sees a running 'owing now' total and marks invoices paid. Your team's overlay carries the exact names, rate and tax state.",
    steps: [
      "Log today's hours today: date, hours, and a few words on the work.",
      "Fix mistakes while entries are uninvoiced — once bundled into an invoice, entries lock.",
      "At the end of each two-week pay period, bundle the uninvoiced hours into an invoice — it is numbered and produces the PDF.",
      "When you get an HST number, tell your team lead — they enter it in the settings and later invoices add HST automatically.",
      "Leave marking-paid to the team lead; your side is accurate, same-day entries.",
    ],
    tryIt:
      "Log today's hours properly (a real entry for real work). Then look at how an invoice would bundle your current uninvoiced entries — without creating one, unless a pay period has actually ended.",
    watchOut: [
      "Hours reconstructed from memory on Friday are where invoice errors come from — same-day logging is the whole system.",
      "An invoiced entry cannot be edited; check the bundle before creating the invoice.",
    ],
    link: "/dashboard/beth-hours",
    linkLabel: "Open Hours & Invoices",
    keywords: ["hours", "timesheet", "invoice", "invoicing", "contractor", "pay", "hst", "log time"],
  },
  {
    id: "brand-images",
    title: "Brand Images",
    audience: "admin",
    summary:
      "The team hero image and one headshot per member that appear on every system email. Uploads resize automatically; always use the real team photos.",
    body:
      "This page holds the photos the system puts on emails: the team hero image (the group header on every email) and one headshot per team member (used in signature cards).\n\nIf a headshot ever needs replacing, upload it here — the page resizes it for you before uploading, so a big phone photo is fine. These are the real team photos: never substitute a recreated or stock image, and if a photo looks wrong, flag it for your team lead.",
    steps: [
      "Open Brand Images to see the current hero image and headshots — recognize them from the emails you receive.",
      "To replace a headshot, upload the new photo on that member's card; the page resizes it automatically.",
      "Only ever upload real photos of the actual team members.",
    ],
    tryIt:
      "Just open the page and see the current hero and headshots, so you recognize them when they show up in emails.",
    watchOut: [
      "A wrong photo here appears on every email the system sends — double-check the person before uploading.",
    ],
    link: "/dashboard/brand-images",
    linkLabel: "Open Brand Images",
    keywords: ["brand images", "headshot", "photo", "hero image", "email header", "logo", "picture"],
  },
];

export function getHelpModule(id: string): HelpModule | undefined {
  return HELP_MODULES.find((m) => m.id === id);
}

// Plain keyword search over the modules — good enough at guide scale and
// shared by the chat's search_help tool and (indirectly) the help page's
// own client-side filter.
export function searchHelpModules(query: string, limit = 3): HelpModule[] {
  const terms = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (!terms.length) return [];
  const scored = HELP_MODULES.map((m) => {
    const title = m.title.toLowerCase();
    const summary = m.summary.toLowerCase();
    const body = m.body.toLowerCase();
    const keys = m.keywords.map((k) => k.toLowerCase());
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 6;
      if (keys.some((k) => k.includes(t) || t.includes(k))) score += 5;
      if (summary.includes(t)) score += 3;
      if (body.includes(t)) score += 1;
    }
    if (m.id.replace(/-/g, " ") === String(query).toLowerCase().trim()) score += 20;
    return { m, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.m);
}

// ---------------------------------------------------------------------------
// Team overlay — THIS team's rules, read together with the core modules.
// A buying team replaces everything below the line with their own rules.
// ---------------------------------------------------------------------------

export interface TeamOverlay {
  team: string;
  intro: string;
  rules: { title: string; text: string }[];
}

export const TEAM_OVERLAY: TeamOverlay = {
  team: "Fennessey Comeau Group — RE/MAX Hallmark First Group Realty Ltd.",
  intro:
    "These are the FC Group's own rules. They sit on top of the core guide: where the guide says 'your Broker' or 'your team lead', this overlay says who that is here.",
  rules: [
    {
      title: "Titles",
      text: "Tim Fennessey is a Broker. Aidan Comeau is a Sales Representative. Use exactly those titles on everything — website, emails, social posts, signatures, paperwork. Never style Tim as a sales representative, and never use a joint 'Sales Representatives' line for the two of them.",
    },
    {
      title: "Approvals",
      text: "Tim approves client-facing sends. Rea (the assistant) drafts only; Tim confirms and sends. CRM follow-ups sent from a person's own connected Outlook are the standing exception.",
    },
    {
      title: "Designated representation — always",
      text: "The FC Group is always designated representation: buyer agreement Form 371, tenant 372, seller 271, landlord 272. Never the brokerage versions (300 / 346 / 200 / 210).",
    },
    {
      title: "Signing sends",
      text: "All iinked (Syngrafii) signature sends go through Tim's iinked account, whoever clicks send — deliberate, so packages from Beth or Aidan are still created in Tim's account.",
    },
    {
      title: "Social posts",
      text: "Campaign and listing posts go on the group Instagram account @fennesseycomeaugroup, with Tim (@timfennesseyrealestate) and Aidan (@aidancomeaurealestate) invited as collaborators.",
    },
    {
      title: "Beth's hours",
      text: "Beth Nickle is the Client Care Coordinator and a contractor: she bills Tim Fennessey Personal Real Estate Corporation at $20/hour, invoiced every two weeks through the Beth's Hours page. She has no HST number yet, so invoices carry no HST; once Tim enters the number in the Hours settings, invoices add 13% HST.",
    },
    {
      title: "Newsletter timing",
      text: "The monthly newsletter's approval window opens on the 20th of the month before the issue, and Tim approves it before anything sends.",
    },
    {
      title: "Practice client",
      text: "The Portal Test Buyer is the safe practice client — its file exists for trying things. Exercises that say 'practise' mean that file, never a real client's.",
    },
    {
      title: "Standard signature block",
      text: "Fennessey Comeau Group — Tim Fennessey, Broker · Aidan Comeau, Sales Representative — RE/MAX HALLMARK FIRST GROUP REALTY LTD., 304 Brock St South, Whitby, ON L1N 4K7 — 905 493-7355 · info@thefcgroup.ca.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Role quick-start cards (Help & Training page)
// ---------------------------------------------------------------------------

export interface QuickStart {
  role: HelpAudience;
  title: string;
  blurb: string;
  steps: { label: string; link: string }[];
}

export const QUICK_STARTS: QuickStart[] = [
  {
    role: "agent",
    title: "Agent — your first morning",
    blurb: "Your book at a glance, then the habits that keep it moving.",
    steps: [
      { label: "Look at your Dashboard — it shows only your own items", link: "/dashboard" },
      { label: "Connect your email in Account so follow-ups send from you", link: "/dashboard/account" },
      { label: "Work your Tasks — the badge is your 3-day window", link: "/dashboard/tasks" },
      { label: "Check the leads that need your attention", link: "/dashboard/leads" },
      { label: "Note every follow-up on the lead, the same day", link: "/dashboard/leads" },
      { label: "Ask Rea (bottom-right): “What's due for me?”", link: "/dashboard/help" },
    ],
  },
  {
    role: "coordinator",
    title: "Coordinator — your first morning",
    blurb: "Paperwork, follow-ups and files: the coordinator's loop.",
    steps: [
      { label: "Clear your Email Follow-ups card on the Dashboard", link: "/dashboard" },
      { label: "Work today's Tasks, then scan Upcoming", link: "/dashboard/tasks" },
      { label: "Run a client file's checklist to complete", link: "/dashboard/checklists" },
      { label: "Generate the FINTRAC forms the file needs", link: "/dashboard/checklists" },
      { label: "Take the “Teach me client files” walkthrough in the chat", link: "/dashboard/help" },
      { label: "Log your hours the same day, every day", link: "/dashboard/beth-hours" },
    ],
  },
  {
    role: "admin",
    title: "Admin / Team Lead — setting up the team",
    blurb: "The one-time pieces that make everyone else's day work.",
    steps: [
      { label: "Confirm brokerage profile and team roles in Account", link: "/dashboard/account" },
      { label: "Upload the hero image and headshots in Brand Images", link: "/dashboard/brand-images" },
      { label: "Make sure every member has connected their email", link: "/dashboard/account" },
      { label: "Read the team overlay — it is your rules, in the product", link: "/dashboard/help" },
      { label: "Check What's New below whenever a change ships", link: "/dashboard/help" },
    ],
  },
];

// ---------------------------------------------------------------------------
// What's New (Help & Training page) — every shipped change explains itself.
// ---------------------------------------------------------------------------

export interface WhatsNewEntry {
  date: string;
  title: string;
  text: string;
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    date: "November 11, 2026",
    title: "Help & Training, and a Rea that can teach",
    text: "This page is new: the whole coaching guide is now searchable inside the CRM. The Rea chat (bottom-right) learned the guide too — ask “How do I generate a 635?” for steps plus a button to the page, or say “Teach me client files” and Rea walks you through it one step at a time.",
  },
  {
    date: "November 11, 2026",
    title: "FINTRAC one-click generation fixed",
    text: "The Generate 630 / 635 buttons on client files now fill the real form fields — they previously produced nearly blank forms that looked filed. Generated forms now carry the property address, the sales rep's name, the 630's residential-purpose answer, and the 635's provider section automatically, and a form that cannot fill properly now fails loudly instead of filing blank.",
  },
  {
    date: "November 10, 2026",
    title: "Stop follow-ups button",
    text: "Leads, contacts, the Leads list and Tasks now have a Stop follow-ups button: one click flags a person do-not-contact, clears their open follow-up tasks and pauses their drip. Resume turns the flag off (drips stay paused until restarted in Email Drips). The sidebar Leads badge no longer counts stopped people.",
  },
  {
    date: "November 10, 2026",
    title: "Open-house sign-in links, automatically",
    text: "On Friday, Saturday and Sunday mornings the CRM checks the MLS for our office's advertised open houses and emails the host — the first agent on the listing — their tablet sign-in link in advance. No more creating links by hand on open-house day.",
  },
  {
    date: "November 5, 2026",
    title: "Lead Campaigns board tidied",
    text: "Campaign cards now collapse to a slim row by default (name, goal, status, and pulled / contacted / clients / deals counts) — click a card to expand it.",
  },
];

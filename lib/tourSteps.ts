// Guided Tour — the look-and-learn walk through the real CRM
// (Tim, 2026-11-11: guided tour IN the real system, replacing the
// practice demo). The tour only navigates and points: it never
// clicks, submits, or sends anything. Step text stays short and
// matches the wording of the guide in lib/helpContent.ts — when the
// guide's language changes, update the matching step here.
//
// GuidedTour (app/components/GuidedTour.tsx) drives these steps;
// the Help & Training page starts the tour. `target` is a CSS
// selector to ring-highlight, or null to show the step card on its
// own — a step must never break because its target is missing.

export interface TourStep {
  id: string
  route: string
  target: string | null
  title: string
  body: string
  moduleId?: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/dashboard',
    target: null,
    title: 'Welcome to your CRM',
    body: 'This is your home base. Everything here is yours — your leads, your tasks, your deals. This tour just walks you around the real system; it never clicks, submits, or sends anything for you.',
    moduleId: 'getting-around',
  },
  {
    id: 'needs-attention',
    route: '/dashboard',
    target: null,
    title: 'Start with Needs Attention',
    body: 'Needs Attention is who needs you today: leads waiting on a follow-up and tasks that are overdue. Start every morning here and this list tells you what to do first.',
    moduleId: 'getting-around',
  },
  {
    id: 'leads',
    route: '/dashboard/leads',
    target: null,
    title: 'Your leads',
    body: 'Every lead lands on this list. Open one to see its history, notes, and follow-up tools. A lead flagged "working with another realtor" is hands-off — price-change emails only.',
    moduleId: 'leads',
  },
  {
    id: 'tasks',
    route: '/dashboard/tasks',
    target: null,
    title: 'Tasks',
    body: "Your to-dos live here. The badge in the sidebar counts only what's due in the next 3 days or overdue — so when that number isn't zero, it means act soon.",
    moduleId: 'tasks',
  },
  {
    id: 'client-files',
    route: '/dashboard/checklists',
    target: null,
    title: 'Client Files',
    body: "Client Files hold each client's documents. Open any file from this list and you'll see its checklist — the required documents are marked, and the progress count only counts those.",
    moduleId: 'client-files',
  },
  {
    id: 'inside-a-file',
    route: '/dashboard/checklists',
    target: null,
    title: 'Inside a client file',
    body: "Inside a file you can generate the forms it needs — the FINTRAC records, for example — and file signed copies. A signed copy always replaces the unsigned one. This tour won't press any of those buttons; they're one click when you're ready.",
    moduleId: 'fintrac',
  },
  {
    id: 'offers',
    route: '/dashboard/offers',
    target: null,
    title: 'Offers',
    body: 'Offer packages are built here. Open a package, answer the questions, and the forms fill in — saving refreshes every form in the package. Sending for signature happens inside the package.',
    moduleId: 'offers',
  },
  {
    id: 'lead-campaigns',
    route: '/dashboard/lead-campaigns',
    target: null,
    title: 'Lead Campaigns',
    body: 'Campaigns bring in new leads: each one gets a tracked link and its own designed post. Campaign posts go on the group Instagram account, with the team invited as collaborators.',
    moduleId: 'lead-campaigns',
  },
  {
    id: 'ask-rea',
    route: '/dashboard',
    target: 'button[aria-label="Chat with Rea"]',
    title: 'Ask Rea anything',
    body: 'Stuck on any screen? Rea is the chat button, bottom-right. Ask any "how do I…" question in plain words — she answers from the same guide this tour is based on.',
    moduleId: 'getting-around',
  },
  {
    id: 'finish',
    route: '/dashboard/help',
    target: null,
    title: "That's the tour",
    body: "You're on Help & Training — the full guide lives here, module by module, whenever you need it. You can restart this tour from here any time. Welcome aboard.",
    moduleId: 'golden-rules',
  },
]

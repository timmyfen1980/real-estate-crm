// FC Group client checklists — v1 (2026-10-15)
// Source of truth: ~/workspace/goals/turn-rea-into-my-complete-real-estate-assistant/files/checklists/
// Each checklist is organized by stage. Documents appear in the stage where they're first needed.

export type ChecklistType = 'buyer' | 'seller' | 'tenant' | 'landlord';

export interface DealInfoField {
  key: string;
  label: string;
  placeholder?: string;
}

export interface ChecklistItem {
  document: string;
  form?: string;
  required: 'required' | 'conditional' | 'recommended' | 'if-applicable';
  viewForm?: string;
  bethNote: string;
}

export interface ChecklistStage {
  title: string;
  description: string;
  items: ChecklistItem[];
}

export interface Checklist {
  type: ChecklistType;
  title: string;
  description: string;
  dealInfoFields: DealInfoField[];
  stages: ChecklistStage[];
  verifySteps?: string[];
  namingStandard?: string;
  footerNote?: string;
}

const FINTRAC_630 = 'https://github.com/timmyfen1980/REA/blob/main/Checklists%20and%20Fintrac%20Documents/12_FINTRAC%20-%20630%20Individual%20Identification%20Record%20(A)%20-%20PropTx-OREA_copy1.pdf';
const FINTRAC_635 = 'https://github.com/timmyfen1980/REA/blob/main/Checklists%20and%20Fintrac%20Documents/26_FINTRAC%20-%20635%20Receipt%20of%20Funds%20Record%20-%20PropTx-OREA_copy1.pdf';
const FORM_100 = 'https://github.com/timmyfen1980/REA/blob/main/Offer%20Documents/1_100%20Agreement%20of%20Purchase%20and%20Sale%20-%20PropTx-OREA.pdf';
const FORM_101 = 'https://github.com/timmyfen1980/REA/blob/main/Offer%20Documents/2_101%20Agreement%20of%20Purchase%20and%20Sale%20Condominium%20Resale%20-%20PropTx-OREA.pdf';
const FORM_124 = 'https://github.com/timmyfen1980/REA/blob/main/Offer%20Documents/36_124%20Notice%20of%20Fulfillment%20of%20Conditions%20-%20Agreement%20of%20Purchase%20and%20Sale%20-%20A%20-%20PropTx-OREA.pdf';
const SCHED_B = 'https://github.com/timmyfen1980/REA/blob/main/Offer%20Documents/7_105%20Schedule%20-%20Agreement%20of%20Purchase%20and%20Sale%20-%20B%20-%20PropTx-OREA.pdf';

export const CHECKLISTS: Record<ChecklistType, Checklist> = {
  buyer: {
    type: 'buyer',
    title: 'Buyer-Side Checklist',
    description: 'Use when FC Group is acting for the buyer in a purchase transaction.',
    dealInfoFields: [
      { key: 'client_names', label: 'Buyer name(s)' },
      { key: 'phone_email', label: 'Phone / Email' },
      { key: 'property_address', label: 'Property address' },
      { key: 'offer_date', label: 'Offer date' },
      { key: 'closing_date', label: 'Closing date' },
      { key: 'purchase_price', label: 'Purchase price' },
      { key: 'deposit', label: 'Deposit amount / held by' },
      { key: 'conditions', label: 'Conditions + deadlines' },
      { key: 'lawyer', label: "Client's lawyer (name, firm, phone/email)" },
      { key: 'coop', label: 'Listing agent / brokerage (co-operating side)' },
    ],
    stages: [
      {
        title: 'Stage 1 — Getting Started (pre-search)',
        description: 'Collect these before the home search begins.',
        items: [
          {
            document: 'Buyer Representation Agreement',
            form: 'OREA Form 371',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Buyer%20Documents/20_371%20Buyer%20Designated%20Representation%20Agreement%20-%20PropTx-OREA_copy1.pdf',
            bethNote: 'The signed contract between the buyer and us — it says we\'re their agent and how we get paid. Get this signed before writing any offers.',
          },
          {
            document: 'FINTRAC — Individual Identification Information Record',
            form: 'FINTRAC Form 630',
            required: 'required',
            viewForm: FINTRAC_630,
            bethNote: 'Federal anti-money-laundering form. We must verify the buyer\'s identity with photo ID when the offer goes in or a deposit is made. For corporate buyers, use the Corporation/Entity ID form instead.',
          },
          {
            document: 'Government photo ID (driver\'s licence)',
            required: 'required',
            bethNote: 'The buyer\'s driver\'s licence or passport — a clear copy (emailed or texted is fine). Needed to complete the FINTRAC identity verification above.',
          },
        ],
      },
      {
        title: 'Stage 2 — Offer (property found)',
        description: 'Collect these when an offer is being written and accepted.',
        items: [
          {
            document: 'Accepted Agreement of Purchase and Sale',
            form: 'OREA Form 100 (Form 101 for condos)',
            required: 'required',
            viewForm: FORM_100,
            bethNote: 'The actual purchase contract once both sides agree. "Accepted" means the seller signed it back. For condos use Form 101 instead of Form 100.',
          },
          {
            document: 'Schedule B',
            required: 'required',
            viewForm: SCHED_B,
            bethNote: 'Extra pages attached to the offer with additional terms, conditions, or clauses specific to this deal.',
          },
          {
            document: 'Confirmation of Co-operation and Representation',
            form: 'OREA Form 320',
            required: 'required',
            bethNote: 'Confirms who represents whom in the deal — us for the buyer, the other agent for the seller. (No blank copy in the repo yet.)',
          },
          {
            document: 'Amendment(s)',
            required: 'conditional',
            bethNote: 'Any changes to the accepted offer (price, dates, conditions). Each amendment gets its own form. Only if the deal was amended.',
          },
          {
            document: 'Full REALTOR MLS Printout',
            required: 'required',
            bethNote: 'BROKERAGE REQUIREMENT: The full MLS listing printout for the purchased property. Required by the brokerage for the deal file.',
          },
          {
            document: 'Deposit receipt',
            required: 'conditional',
            bethNote: 'Proof the buyer\'s deposit was received. Needed whenever a deposit is part of the deal (almost always).',
          },
          {
            document: 'FINTRAC — Receipt of Funds Record',
            form: 'FINTRAC Form 635',
            required: 'required',
            viewForm: FINTRAC_635,
            bethNote: 'Federal form recording any deposit money we receive. Not needed if the deposit goes straight to a lawyer/builder.',
          },
          {
            document: 'Offer Summary Document',
            form: 'OREA Form 801',
            required: 'recommended',
            bethNote: 'One-page summary of the key offer terms. Handy reference — not every deal has one. (No blank copy in the repo yet.)',
          },
        ],
      },
      {
        title: 'Stage 3 — Firm / Post-Sale (deal is firm)',
        description: 'Collect these once conditions are satisfied or waived and the deal firms up.',
        items: [
          {
            document: 'Notice of Fulfillment of Conditions (NOF)',
            form: 'OREA Form 124',
            required: 'conditional',
            viewForm: FORM_124,
            bethNote: 'Only needed if the offer had conditions (financing, inspection, etc.). One per condition.',
          },
          {
            document: 'Waiver(s)',
            form: 'OREA Form 123',
            required: 'conditional',
            bethNote: 'If the buyer waives a condition instead of fulfilling it, this form records the waiver. (No blank copy in the repo yet.)',
          },
          {
            document: 'REALM report',
            required: 'recommended',
            bethNote: 'Property data report — ownership history, lot details, comparable sales. Good backup for the file.',
          },
          {
            document: 'Final closing documents',
            required: 'required',
            bethNote: 'The lawyer\'s closing package — statement of adjustments, title documents, etc. Confirm the file is complete once the deal closes.',
          },
          {
            document: 'Trade Record Sheet (TRS) — Agent Signed',
            required: 'required',
            bethNote: 'BROKERAGE REQUIREMENT: RE/MAX Hallmark trade record sheet, signed by the agent. Required for commission release. The brokerage will not release commission without this.',
          },

        ],
      },
      {
        title: 'Stage 4 — Post-Closing',
        description: 'After the deal closes — gifts, reviews, and keeping the relationship warm.',
        items: [
          {
            document: 'Closing gift sent',
            required: 'recommended',
            bethNote: 'Send the closing gift to the buyer. Note what was sent and when, so we don\'t double up.',
          },
          {
            document: 'Utility transfer info sent',
            required: 'recommended',
            bethNote: 'Send the buyer our utility contact sheet (hydro, water, gas, internet providers with phone numbers and websites) so they can set up accounts for the new property.',
          },
          {
            document: 'Closing package emailed to client',
            required: 'required',
            bethNote: 'Email the buyer their complete closing package — all executed documents in one place for their records. Confirm they received it.',
          },
          {
            document: 'Google review requested',
            required: 'recommended',
            bethNote: 'Ask the buyer for a Google review. Best timed a week or two after move-in when the excitement is fresh. Send them the review link.',
          },
        ],
      },
    ],
    namingStandard: 'Use the exact OREA form names with (EXECUTED) suffix for signed copies. FINTRAC forms: FINTRAC - Individual Identification Information Record.pdf and FINTRAC - Receipt Of Funds Record.pdf.',
  },

  seller: {
    type: 'seller',
    title: 'Seller-Side Checklist',
    description: 'Use when FC Group is acting for the seller (listing agent) in a sale transaction.',
    dealInfoFields: [
      { key: 'client_names', label: 'Seller name(s)' },
      { key: 'phone_email', label: 'Phone / Email' },
      { key: 'property_address', label: 'Property address' },
      { key: 'listing_date', label: 'Listing date' },
      { key: 'list_price', label: 'List price' },
      { key: 'offer_date', label: 'Offer date' },
      { key: 'closing_date', label: 'Closing date' },
      { key: 'sale_price', label: 'Sale price' },
      { key: 'deposit', label: 'Deposit amount / held by' },
      { key: 'conditions', label: 'Conditions + deadlines' },
      { key: 'lawyer', label: "Client's lawyer (name, firm, phone/email)" },
      { key: 'coop', label: "Buyer's agent / brokerage (co-operating side)" },
    ],
    stages: [
      {
        title: 'Stage 1 — Listing (before the listing goes live)',
        description: 'Collect these before the property hits the market.',
        items: [
          {
            document: 'Listing Agreement — Seller Designated Representation Agreement',
            form: 'OREA Form 271',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Seller%20Documents/43_271%20Seller%20Designated%20Representation%20Agreement%20Authority%20to%20Offer%20for%20Sale%20-%20PropTx-OREA.pdf',
            bethNote: 'The signed contract between the seller and us — authorizes us to list and market their property. Get this signed before the listing goes live.',
          },
          {
            document: 'FINTRAC — Individual Identification Information Record',
            form: 'FINTRAC Form 630',
            required: 'required',
            viewForm: FINTRAC_630,
            bethNote: 'Federal anti-money-laundering form. Verify the seller\'s identity with photo ID. Usually filed with the seller\'s name as a prefix.',
          },
          {
            document: 'BrokerBay listing info sheet',
            required: 'required',
            bethNote: 'Showing instructions for other agents — booking, lockbox codes, access notes, alarm codes. Lives in Dropbox at Team Files/Seller File/brokerbay-new-listing-info-sheet.pdf.',
          },
          {
            document: 'MLS data sheet',
            form: 'OREA Form 290 (freehold) / 291 (condo)',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Seller%20Documents/46_290%20Freehold%20-%20Sale%20MLS%20Data%20Information%20Form%20-%20PropTx-OREA.pdf',
            bethNote: 'The property details sheet that feeds the MLS listing. The seller confirms the details are accurate.',
          },
          {
            document: 'Feature sheet',
            required: 'required',
            bethNote: 'The marketing one-pager for the property. Marketing prepares this — confirm it\'s in the file.',
          },
          {
            document: 'Property photos / marketing assets',
            required: 'required',
            bethNote: 'Photos, video, floor plans — marketing handles the shoot. Confirm the final assets are filed alongside the listing paperwork.',
          },
        ],
      },
      {
        title: 'Stage 2 — Offer Received',
        description: 'Collect these once the seller accepts a buyer\'s offer.',
        items: [
          {
            document: 'Accepted Agreement of Purchase and Sale',
            form: 'OREA Form 100 (Form 101 for condos)',
            required: 'required',
            viewForm: FORM_100,
            bethNote: 'The purchase contract once the seller accepts the buyer\'s offer.',
          },
          {
            document: 'Schedule B',
            required: 'required',
            viewForm: SCHED_B,
            bethNote: 'Extra pages with additional terms or clauses specific to this deal.',
          },
          {
            document: 'Confirmation of Co-operation and Representation',
            form: 'OREA Form 320',
            required: 'required',
            bethNote: 'Confirms who represents whom — us for the seller, the other agent for the buyer. (No blank copy in the repo yet.)',
          },
          {
            document: 'Amendment(s)',
            required: 'conditional',
            bethNote: 'Any changes to the accepted offer (price, dates, conditions). Each amendment gets its own form. Only if the deal was amended.',
          },
          {
            document: 'Full REALTOR MLS Printout',
            required: 'required',
            bethNote: 'BROKERAGE REQUIREMENT: The full MLS listing printout for the sold property. Required by the brokerage for the deal file.',
          },
          {
            document: 'Deposit receipt / deposit info',
            required: 'conditional',
            bethNote: 'Proof the buyer\'s deposit was received and where it\'s held.',
          },
        ],
      },
      {
        title: 'Stage 3 — Firm / Closed',
        description: 'Collect these once conditions are satisfied or waived and the deal moves to closing.',
        items: [
          {
            document: 'Notice of Fulfillment of Conditions (NOF)',
            form: 'OREA Form 124',
            required: 'conditional',
            viewForm: FORM_124,
            bethNote: 'Only if the accepted offer had conditions. Confirms each condition was satisfied.',
          },
          {
            document: 'Waiver(s)',
            form: 'OREA Form 123',
            required: 'conditional',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Offer%20Documents/33_123%20Waiver%20-%20Agreement%20of%20Purchase%20and%20Sale%20(Seller)%20A%20-%20PropTx-OREA.pdf',
            bethNote: 'If the buyer waives a condition, this form records it.',
          },
          {
            document: 'REALM report',
            required: 'recommended',
            bethNote: 'Property data report — ownership history, lot details, comparables. Good backup for the file.',
          },
          {
            document: 'Final closing documents',
            required: 'required',
            bethNote: 'The lawyer\'s closing package — statement of adjustments, title documents, etc.',
          },
          {
            document: 'Trade Record Sheet (TRS) — Agent Signed',
            required: 'required',
            bethNote: 'BROKERAGE REQUIREMENT: RE/MAX Hallmark trade record sheet, signed by the agent. Required for commission release. The brokerage will not release commission without this.',
          },

        ],
      },
      {
        title: 'Stage 4 — Post-Closing',
        description: 'After the deal closes — gifts, reviews, and keeping the relationship warm.',
        items: [
          {
            document: 'Closing gift sent',
            required: 'recommended',
            bethNote: 'Send the closing gift to the seller. Note what was sent and when.',
          },
          {
            document: 'Closing package emailed to client',
            required: 'required',
            bethNote: 'Email the seller their complete closing package — all executed documents in one place for their records. Confirm they received it.',
          },
          {
            document: 'Google review requested',
            required: 'recommended',
            bethNote: 'Ask the seller for a Google review. Best timed a week or two after closing. Send them the review link.',
          },
        ],
      },
    ],
    namingStandard: 'Use the exact OREA form names with (EXECUTED) suffix. FINTRAC forms prefixed with seller name. MLS data: MLS data.pdf. BrokerBay sheet: brokerbay-new-listing-info-sheet.pdf.',
  },

  tenant: {
    type: 'tenant',
    title: 'Tenant-Side Checklist',
    description: 'Use when FC Group is acting for the tenant in a lease transaction.',
    dealInfoFields: [
      { key: 'client_names', label: 'Tenant name(s) (all adult applicants)' },
      { key: 'phone_email', label: 'Phone / Email' },
      { key: 'property_address', label: 'Rental property address' },
      { key: 'lease_start', label: 'Lease start date' },
      { key: 'lease_end', label: 'Lease end date' },
      { key: 'monthly_rent', label: 'Monthly rent' },
      { key: 'deposit', label: "Deposit (last month's rent) amount / held by" },
      { key: 'lawyer', label: "Client's lawyer (name, firm, phone/email — if applicable)" },
      { key: 'coop', label: "Landlord's agent / brokerage (co-operating side)" },
    ],
    stages: [
      {
        title: 'Stage 1 — Pre-Search (collect before looking)',
        description: 'Get everything BEFORE the search starts — once the right property is found, things move fast.',
        items: [
          {
            document: 'Tenant Representation Agreement',
            form: 'OREA Form 372',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Buyer%20Documents/21_372%20Tenant%20Designated%20Representation%20Agreement%20-%20PropTx-OREA_copy1.pdf',
            bethNote: 'Our contract with the tenant — like the buyer rep agreement but for leases. Sign before the search starts.',
          },
          {
            document: 'Completed and signed Rental Application',
            form: 'OREA Form 410',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Leasing%20Documents/21_410%20Rental%20Application%20-%20Residential%20(BLANK)%20-%20PropTx-OREA.pdf',
            bethNote: 'The tenant fills this out with personal, employment, and rental history details. Must be signed.',
          },
          {
            document: 'Clear copy of government-issued photo ID',
            required: 'required',
            bethNote: 'Driver\'s licence or passport. A clear photo emailed or texted is fine.',
          },
          {
            document: 'Full Equifax credit report, including credit score',
            required: 'required',
            bethNote: 'The tenant pulls this themselves from Equifax. Must show their name, the report details, AND the score. Landlords rely on this heavily.',
          },
          {
            document: 'Current employment letter',
            required: 'required',
            bethNote: 'On company letterhead. Must include: job title/position, income, start date, and employer contact info.',
          },
          {
            document: 'Two most recent pay stubs',
            required: 'required',
            bethNote: 'Proves the income claimed in the employment letter. Must be the two latest.',
          },
          {
            document: 'Employment offer letter',
            required: 'if-applicable',
            bethNote: 'Only if the tenant was recently hired and doesn\'t have pay stubs yet.',
          },
          {
            document: 'Proof of additional income',
            required: 'if-applicable',
            bethNote: 'If the tenant is using other income to qualify (side business, rental income, etc.).',
          },
          {
            document: 'Self-employment income documents',
            required: 'if-applicable',
            bethNote: 'For self-employed tenants: Notices of Assessment (NOAs) or recent business financial records.',
          },
          {
            document: 'Pension, retirement, or benefit income documentation',
            required: 'if-applicable',
            bethNote: 'For tenants whose income is pension, retirement savings, or government benefits.',
          },
        ],
      },
      {
        title: 'Stage 2 — Lease Signing (property found)',
        description: 'Collect these when lease terms are agreed and the deal is being signed.',
        items: [
          {
            document: 'Agreement to Lease — Residential',
            form: 'OREA Form 400',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Leasing%20Documents/1_400%20Agreement%20to%20Lease%20-%20Residential%20-%20PropTx-OREA.pdf',
            bethNote: 'The lease offer/contract once terms are agreed. This is the "APS" of the rental world.',
          },
          {
            document: 'Ontario Standard Lease',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Checklists%20and%20Fintrac%20Documents/32_Ontario%20Residential%20Tenancy%20Agreement%20-%20PropTx-OREA_copy1.pdf',
            bethNote: 'The mandatory Ontario residential tenancy agreement. Required by law for most residential leases.',
          },
          {
            document: 'Schedule — Agreement to Lease (Residential)',
            form: 'OREA Form 401',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Leasing%20Documents/2_401%20Schedule%20-%20Agreement%20to%20Lease%20-%20Residential%20-%20A%20-%20PropTx-OREA.pdf',
            bethNote: 'Additional lease terms specific to this deal.',
          },
          {
            document: 'Confirmation of Co-operation and Representation (Tenant/Landlord)',
            form: 'OREA Form 324',
            required: 'required',
            bethNote: 'Confirms who represents whom — us for the tenant, the other agent for the landlord. (No blank copy in the repo yet.)',
          },
          {
            document: 'FINTRAC — Individual Identification Information Record',
            form: 'FINTRAC Form 630',
            required: 'required',
            viewForm: FINTRAC_630,
            bethNote: 'Federal anti-money-laundering ID verification for the tenant.',
          },
          {
            document: 'FINTRAC — Receipt of Funds Record',
            form: 'FINTRAC Form 635',
            required: 'required',
            viewForm: FINTRAC_635,
            bethNote: 'Federal form recording the deposit (usually last month\'s rent).',
          },
          {
            document: 'Deposit receipt',
            required: 'required',
            bethNote: 'Proof the deposit (typically last month\'s rent) was received.',
          },
        ],
      },
      {
        title: 'Stage 3 — Moved In / Complete',
        description: 'Collect these to round out the file once the tenant is in.',
        items: [
          {
            document: 'REALM report',
            required: 'recommended',
            bethNote: 'Property data report for the file.',
          },
          {
            document: 'Final documents',
            required: 'required',
            bethNote: 'Confirm the full lease package (executed lease, schedules, co-op, FINTRAC, deposit proof) is filed and complete.',
          },
        ],
      },
      {
        title: 'Stage 4 — Post Move-In',
        description: 'After the tenant is settled — follow-up and relationship.',
        items: [
          {
            document: 'Utility transfer info sent',
            required: 'recommended',
            bethNote: 'Send the tenant our utility contact sheet so they can set up hydro, water, gas, and internet for the rental.',
          },
          {
            document: 'Welcome package / lease copy emailed',
            required: 'required',
            bethNote: 'Email the tenant their complete signed lease package for their records. Confirm they received it.',
          },
          {
            document: 'Google review requested',
            required: 'recommended',
            bethNote: 'Ask the tenant for a Google review once they\'re settled in.',
          },
        ],
      },
    ],
    verifySteps: [
      'All documents are current and clearly readable',
      'Credit report shows the applicant\'s name, report details, and score',
      'Employment letter includes position, income, start date, and employer contact',
      'Files are clearly labelled with the applicant\'s name',
      'SIN and complete bank-account numbers have been removed or covered (privacy!)',
    ],
    footerNote: 'Where tenants send documents: tim@theFCgroup.ca or Aidan@theFCgroup.ca.',
  },

  landlord: {
    type: 'landlord',
    title: 'Landlord-Side Checklist',
    description: 'Use when FC Group is acting for the landlord (listing agent for a lease). Mirrors the seller-side checklist with lease-specific forms.',
    dealInfoFields: [
      { key: 'client_names', label: 'Landlord name(s)' },
      { key: 'phone_email', label: 'Phone / Email' },
      { key: 'property_address', label: 'Rental property address' },
      { key: 'listing_date', label: 'Listing date' },
      { key: 'monthly_rent', label: 'Monthly rent' },
      { key: 'lease_start', label: 'Lease start date' },
      { key: 'lease_end', label: 'Lease end date' },
      { key: 'deposit', label: 'Deposit amount / held by' },
      { key: 'lawyer', label: "Client's lawyer (name, firm, phone/email)" },
      { key: 'coop', label: "Tenant's agent / brokerage (co-operating side)" },
    ],
    stages: [
      {
        title: 'Stage 1 — Listing (before the lease listing goes live)',
        description: 'Collect these before the property is marketed for lease.',
        items: [
          {
            document: 'Landlord Representation Agreement',
            form: 'OREA Form 210 (or Form 272 for designated)',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Seller%20Documents/8_210%20Listing%20Agreement%20-%20Landlord%20Representation%20Agreement%20-%20Authority%20to%20Offer%20for%20Lease%20-%20PropTx-OR.pdf',
            bethNote: 'The signed contract between the landlord and us — authorizes us to market the property for lease. This replaces the seller\'s Form 271.',
          },
          {
            document: 'Schedule — Listing Agreement (Authority to Offer for Lease)',
            form: 'OREA Form 211',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Seller%20Documents/9_211%20Schedule%20-%20Listing%20Agreement%20-%20Authority%20to%20Offer%20for%20Lease%20-%20PropTx-OREA.pdf',
            bethNote: 'Additional terms attached to the landlord representation agreement.',
          },
          {
            document: 'FINTRAC — Individual Identification Information Record',
            form: 'FINTRAC Form 630',
            required: 'required',
            viewForm: FINTRAC_630,
            bethNote: 'Federal anti-money-laundering form. Verify the landlord\'s identity with photo ID.',
          },
          {
            document: 'MLS data sheet (lease)',
            form: 'Sub-Lease MLS Data Information Form',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Seller%20Documents/Sub-Lease%20MLS%20Data%20Information%20Form%20-%20PropTx-OREA.pdf',
            bethNote: 'Property details for the lease listing on MLS. Landlord confirms accuracy.',
          },
          {
            document: 'BrokerBay listing info sheet',
            required: 'required',
            bethNote: 'Showing instructions for other agents. Lives in Dropbox at Team Files/Seller File/brokerbay-new-listing-info-sheet.pdf.',
          },
          {
            document: 'Feature sheet',
            required: 'required',
            bethNote: 'Marketing one-pager for the rental property. Marketing prepares this.',
          },
          {
            document: 'Property photos / marketing assets',
            required: 'required',
            bethNote: 'Photos, video, floor plans — marketing handles the shoot.',
          },
        ],
      },
      {
        title: 'Stage 2 — Tenant Found',
        description: 'Collect these once the landlord accepts a tenant\'s terms.',
        items: [
          {
            document: 'Accepted Agreement to Lease',
            form: 'OREA Form 400',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Leasing%20Documents/1_400%20Agreement%20to%20Lease%20-%20Residential%20-%20PropTx-OREA.pdf',
            bethNote: 'The lease contract once the landlord accepts the tenant\'s terms.',
          },
          {
            document: 'Schedule A — Authority to Offer for Lease (tenants)',
            required: 'required',
            bethNote: 'Additional terms on the listing side for tenant placements. Lives in Dropbox at Team Files/Renters/tresa-schedule-a-for-tenants.docx.',
          },
          {
            document: 'Schedule — Agreement to Lease',
            form: 'OREA Form 401',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Leasing%20Documents/2_401%20Schedule%20-%20Agreement%20to%20Lease%20-%20Residential%20-%20A%20-%20PropTx-OREA.pdf',
            bethNote: 'Additional lease terms specific to this deal.',
          },
          {
            document: 'Confirmation of Co-operation and Representation (Tenant/Landlord)',
            form: 'OREA Form 324',
            required: 'required',
            bethNote: 'Confirms who represents whom — us for the landlord, the other agent for the tenant. (No blank copy in the repo yet.)',
          },
          {
            document: 'FINTRAC — Tenant ID + Receipt of Funds',
            form: 'FINTRAC Forms 630 / 635',
            required: 'required',
            viewForm: FINTRAC_630,
            bethNote: 'The tenant\'s FINTRAC paperwork — usually completed by the tenant\'s agent. Confirm copies are in our file.',
          },
          {
            document: 'Deposit receipt',
            required: 'conditional',
            bethNote: 'Proof the tenant\'s deposit (typically last month\'s rent) was received.',
          },
        ],
      },
      {
        title: 'Stage 3 — Leased / Complete',
        description: 'Collect these to round out the file once the lease is finalized.',
        items: [
          {
            document: 'Ontario Standard Lease (executed)',
            required: 'required',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Checklists%20and%20Fintrac%20Documents/32_Ontario%20Residential%20Tenancy%20Agreement%20-%20PropTx-OREA_copy1.pdf',
            bethNote: 'The mandatory Ontario residential tenancy agreement, fully signed. Required by law for most residential leases.',
          },
          {
            document: 'Notice of Fulfillment of Condition(s) — Lease (Landlord)',
            form: 'OREA Form 404',
            required: 'conditional',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Leasing%20Documents/14_404%20Notice%20of%20Fulfillment%20of%20Condition(s)%20-%20Agreement%20to%20Lease%20-%20Residential%20(Landlord)%20-%20%20PropTx-OR.pdf',
            bethNote: 'Only if the accepted lease had conditions.',
          },
          {
            document: 'Waiver — Agreement to Lease',
            form: 'OREA Form 403',
            required: 'conditional',
            viewForm: 'https://github.com/timmyfen1980/REA/blob/main/Leasing%20Documents/13_403%20Waiver%20-%20Agreement%20to%20Lease%20-%20Residential%20(Landlord)%20-%20%20PropTx-OREA.pdf',
            bethNote: 'If the tenant waives a lease condition, this records it.',
          },
          {
            document: 'REALM report',
            required: 'recommended',
            bethNote: 'Property data report for the file.',
          },
          {
            document: 'Final documents',
            required: 'required',
            bethNote: 'Confirm the full lease package (executed standard lease, schedules, co-op, FINTRAC, deposit proof) is filed and complete.',
          },
        ],
      },
      {
        title: 'Stage 4 — Post-Lease',
        description: 'After the lease is finalized — wrap-up and relationship.',
        items: [
          {
            document: 'Closing gift sent',
            required: 'recommended',
            bethNote: 'Send a closing gift to the landlord. Note what was sent and when.',
          },
          {
            document: 'Lease package emailed to client',
            required: 'required',
            bethNote: 'Email the landlord their complete signed lease package for their records. Confirm they received it.',
          },
          {
            document: 'Google review requested',
            required: 'recommended',
            bethNote: 'Ask the landlord for a Google review.',
          },
        ],
      },
    ],
    namingStandard: 'Use the exact OREA form names with (EXECUTED) suffix for signed copies. FINTRAC forms prefixed with landlord name.',
    footerNote: 'Note: drafted from the seller-side pattern per Tim\'s direction. Only one landlord transaction sample exists — review and adjust based on actual lease-listing experience.',
  },
};

export const CHECKLIST_TYPES: ChecklistType[] = ['buyer', 'seller', 'tenant', 'landlord'];

export const CHECKLIST_TYPE_LABELS: Record<ChecklistType, string> = {
  buyer: 'Buyer-side',
  seller: 'Seller-side',
  tenant: 'Tenant-side',
  landlord: 'Landlord-side',
};

export const REQUIRED_BADGE: Record<string, { label: string; className: string }> = {
  required: { label: 'Required', className: 'bg-red-100 text-red-800' },
  conditional: { label: 'Conditional', className: 'bg-amber-100 text-amber-800' },
  recommended: { label: 'Recommended', className: 'bg-blue-100 text-blue-800' },
  'if-applicable': { label: 'If applicable', className: 'bg-amber-100 text-amber-800' },
};

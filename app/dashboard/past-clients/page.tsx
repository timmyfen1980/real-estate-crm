// The Past Client Review was a one-time cleanup tool: Tim finished the
// review and the apply on 2026-11-13, and asked for the option to be
// removed on 2026-11-14. The sidebar entry is gone; this stub stays so an
// old bookmark lands on the dashboard instead of a 404 (the push tooling
// can't delete files). The review data in past_client_review_items is
// kept as the record of what was decided and applied.

import { redirect } from 'next/navigation'

export default function PastClientsPage() {
  redirect('/dashboard')
}

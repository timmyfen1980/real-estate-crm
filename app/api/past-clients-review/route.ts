// The Past Client Review was a one-time cleanup tool: Tim finished the
// review and the apply on 2026-11-13, and asked for the option to be
// removed on 2026-11-14. This stub stays so an old call gets a clear
// answer instead of a 404 (the push tooling can't delete files, so the
// route remains as a 410). The review data in past_client_review_items
// is kept as the record of what was decided and applied.

import { NextResponse } from 'next/server'

const GONE = { error: 'The Past Client Review has been removed.' }

export async function GET() {
  return NextResponse.json(GONE, { status: 410 })
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 })
}

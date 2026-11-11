// The practice demo was removed on 2026-11-11 at Tim's direction
// ("Tour in the real system, delete the demo") and replaced by the
// guided tour (lib/tourSteps.ts + app/components/GuidedTour.tsx,
// started from Help & Training). This stub stays so an old link or
// bookmark gets a clear answer instead of a 404. The push tooling
// can't delete files, so the route remains as a 410.

import { NextResponse } from 'next/server'

const GONE = { error: 'The practice demo has been removed.' }

export async function GET() {
  return NextResponse.json(GONE, { status: 410 })
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 })
}

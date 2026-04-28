import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get('contact_id')

  if (!contactId) {
    return new Response('Invalid unsubscribe link', { status: 400 })
  }

  await supabase
    .from('contact_subscriptions')
    .upsert({
      contact_id: contactId,
      unsubscribed: true,
    })

  return new Response('You have been unsubscribed.', { status: 200 })
}
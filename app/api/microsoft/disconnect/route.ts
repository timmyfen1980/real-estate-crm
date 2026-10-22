/* eslint-disable @typescript-eslint/no-explicit-any */
// Disconnects the signed-in user's Outlook connection: tokens are wiped
// and the row is marked revoked, so nothing can read the mailbox with
// them afterwards. (The user can also revoke the app any time from their
// Microsoft account page; this is the CRM-side switch.)

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { error } = await serviceClient()
    .from("user_mail_connections")
    .update({
      status: "revoked",
      refresh_token: null,
      access_token: null,
      access_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "microsoft");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

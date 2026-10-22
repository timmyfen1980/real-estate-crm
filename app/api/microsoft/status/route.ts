/* eslint-disable @typescript-eslint/no-explicit-any */
// Outlook connection status for the signed-in user (Account page card).
// Fail-soft: if the user_mail_connections table is not there yet, the
// card simply shows "not connected" instead of erroring the page.

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

export async function GET(req: NextRequest) {
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

  try {
    const { data } = await serviceClient()
      .from("user_mail_connections")
      .select("email, status, updated_at")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .maybeSingle();
    if (data && data.status === "connected") {
      return NextResponse.json({
        ok: true,
        connected: true,
        email: data.email || "",
        connected_at: data.updated_at || null,
      });
    }
    return NextResponse.json({ ok: true, connected: false });
  } catch {
    return NextResponse.json({ ok: true, connected: false });
  }
}

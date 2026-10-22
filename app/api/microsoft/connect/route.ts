/* eslint-disable @typescript-eslint/no-explicit-any */
// Starts the per-user Outlook (Microsoft 365) connect: a signed-in CRM
// user clicks "Connect Outlook" on the Account page and lands here; we
// bounce them to Microsoft's sign-in/consent for the "FC Group CRM" app.
// A random state value rides in an httpOnly cookie and is checked in the
// callback so a connection can only be completed by the same browser
// (and CRM session) that started it.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { msAuthorizeUrl } from "@/lib/microsoft";

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
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const state = randomUUID();
  const res = NextResponse.redirect(msAuthorizeUrl(state));
  res.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

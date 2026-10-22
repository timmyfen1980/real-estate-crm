/* eslint-disable @typescript-eslint/no-explicit-any */
// Microsoft OAuth callback — this path is the redirect URI registered on
// the "FC Group CRM" Entra app, so it must stay exactly
// /api/auth/microsoft/callback. Exchanges the code for tokens and stores
// the connection against the CRM user whose session started the flow.
// Tokens live in public.user_mail_connections and are only ever touched
// with the service role.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { msExchangeCode, msGraphMe } from "@/lib/microsoft";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function backToAccount(req: NextRequest, result: string) {
  const url = new URL("/dashboard/account", req.url);
  url.searchParams.set("outlook", result);
  const res = NextResponse.redirect(url);
  res.cookies.set("ms_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    return backToAccount(req, "error");
  }
  const code = params.get("code") || "";
  const state = params.get("state") || "";
  if (!code || !state) {
    return backToAccount(req, "error");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("ms_oauth_state")?.value || "";
  if (!expectedState || expectedState !== state) {
    return backToAccount(req, "error");
  }

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

  try {
    const tokens = await msExchangeCode(code);
    const me = await msGraphMe(tokens.accessToken);

    const supabase = serviceClient();
    const { data: membership } = await supabase
      .from("account_users")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) throw new Error("No account membership for this user.");

    const { error } = await supabase.from("user_mail_connections").upsert(
      {
        user_id: user.id,
        account_id: membership.account_id,
        provider: "microsoft",
        email: me.email,
        refresh_token: tokens.refreshToken,
        access_token: tokens.accessToken,
        access_expires_at: tokens.expiresAt,
        scopes: tokens.scope,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );
    if (error) throw new Error(error.message);

    return backToAccount(req, "connected");
  } catch (e: any) {
    console.error("MICROSOFT CALLBACK ERROR:", e?.message || e);
    return backToAccount(req, "error");
  }
}

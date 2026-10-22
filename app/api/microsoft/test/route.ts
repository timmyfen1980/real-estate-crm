/* eslint-disable @typescript-eslint/no-explicit-any */
// Live test of the signed-in user's Outlook connection: refreshes the
// stored token with Microsoft, then pulls the mailbox profile, the 3
// most recent emails and the next few calendar events from Microsoft
// Graph. Proves the whole chain (stored refresh token -> new access
// token -> Graph reads) works. Read-only against the mailbox.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { msRefreshTokens } from "@/lib/microsoft";

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

  const supabase = serviceClient();
  const { data: conn } = await supabase
    .from("user_mail_connections")
    .select("id, email, refresh_token, status")
    .eq("user_id", user.id)
    .eq("provider", "microsoft")
    .maybeSingle();
  if (!conn || conn.status !== "connected" || !conn.refresh_token) {
    return NextResponse.json({ ok: false, error: "No Outlook connection found for your account." });
  }

  try {
    // 1) Refresh — the stored refresh token must earn a new access token.
    const tokens = await msRefreshTokens(conn.refresh_token);
    await supabase
      .from("user_mail_connections")
      .update({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken || conn.refresh_token,
        access_expires_at: tokens.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);

    const headers = { Authorization: `Bearer ${tokens.accessToken}` };

    // 2) Mailbox identity.
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", { headers });
    const me: any = await meRes.json().catch(() => ({}));
    if (!meRes.ok) throw new Error(`Graph /me failed: ${meRes.status}`);

    // 3) Most recent emails.
    const mailRes = await fetch(
      "https://graph.microsoft.com/v1.0/me/messages?$top=3&$select=subject,receivedDateTime,from&$orderby=receivedDateTime%20desc",
      { headers }
    );
    const mail: any = await mailRes.json().catch(() => ({}));
    if (!mailRes.ok) throw new Error(`Graph messages failed: ${mailRes.status}`);
    const messages = (mail.value || []).map((m: any) => ({
      subject: m.subject || "(no subject)",
      from: m.from?.emailAddress?.address || "",
      received: m.receivedDateTime || "",
    }));

    // 4) Upcoming calendar events.
    const now = new Date().toISOString();
    const evRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${encodeURIComponent(
        now
      )}&endDateTime=${encodeURIComponent(
        new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString()
      )}&$top=3&$select=subject,start&$orderby=start/dateTime`,
      { headers: { ...headers, Prefer: 'outlook.timezone="America/Toronto"' } }
    );
    const ev: any = await evRes.json().catch(() => ({}));
    const events = evRes.ok
      ? (ev.value || []).map((e: any) => ({
          subject: e.subject || "(no subject)",
          start: e.start?.dateTime || "",
        }))
      : [];

    return NextResponse.json({
      ok: true,
      email: me.mail || me.userPrincipalName || conn.email || "",
      messages,
      events,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message || "The test pull failed.",
    });
  }
}

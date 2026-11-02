/* eslint-disable @typescript-eslint/no-explicit-any */
// Follow-up email sender — Outlook first, Resend fallback.
//
// Person-to-person follow-ups (drip campaign steps from the email
// processor, and the manual "Follow up" button on leads) should come
// from the sending team member's own mailbox: the recipient sees that
// person, replies thread back to them, and the message lands in their
// Outlook Sent Items. When the sender has a connected Outlook account
// that has consented to Mail.Send, we send through Microsoft Graph as
// that user. Otherwise — not connected, connected before Mail.Send was
// added and not yet re-consented, or a Graph failure — we fall back to
// the exact Resend path these emails used before, from the account
// default sender, so a follow-up is never lost to a mailbox problem.
//
// The chosen channel + actual From are returned to the caller for
// email_logs: a Resend send keeps its real Resend id; an Outlook send
// records resend_id as "outlook:<sender's mailbox address>" so the log
// shows where the email really came from with no schema change.
//
// Bulk mail (newsletter issues, broadcasts, test sends) does NOT use
// this helper — it stays on Resend as the team identity, unchanged.

import { Resend } from "resend";
import { msRefreshTokens, msGraphSendMail } from "@/lib/microsoft";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface FollowupSendResult {
  channel: "outlook" | "resend";
  // The From identity the recipient actually sees.
  from: string;
  // Resend message id, or "outlook:<mailbox>" for a Graph send.
  resendId: string | null;
  // Set only when every channel failed; callers keep their existing
  // "log it as failed" behaviour in that case.
  error: any | null;
}

export interface FollowupSendOptions {
  // Service-role Supabase client (the caller's own).
  supabase: any;
  accountId: string;
  // Whose mailbox to try first. Null means "the account owner".
  senderUserId: string | null;
  to: string;
  subject: string;
  html: string;
  // Optional plain-text part, used only by the Resend fallback
  // (Graph sends carry the HTML body).
  text?: string;
  // The Resend From to fall back to, exactly as the caller sends today.
  fallbackFrom: string;
  fallbackReplyTo?: string;
  // Sends with attachments keep today's Resend path untouched —
  // Graph follow-ups never carried attachments.
  attachments?: any[];
}

async function resolveSenderUserId(
  supabase: any,
  accountId: string,
  senderUserId: string | null
): Promise<string | null> {
  if (senderUserId) return senderUserId;
  const { data: owner } = await supabase
    .from("account_users")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("role", "owner")
    .maybeSingle();
  return owner?.user_id || null;
}

async function getConnection(supabase: any, userId: string) {
  const { data: conn } = await supabase
    .from("user_mail_connections")
    .select(
      "id, email, refresh_token, access_token, access_expires_at, scopes, status"
    )
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .maybeSingle();
  if (!conn || conn.status !== "connected" || !conn.refresh_token) return null;
  return conn;
}

// A connection only sends when its granted scopes include Mail.Send.
// Connections made before 2026-11-02 never consented to it; their
// stored scope list says so, and we skip Graph entirely rather than
// burn a doomed call — the Resend fallback covers them until the user
// clicks Connect once more. A missing scope list is given the benefit
// of the doubt and Graph decides.
function hasMailSend(conn: any): boolean {
  if (!conn.scopes) return true;
  return String(conn.scopes).split(/\s+/).includes("Mail.Send");
}

// The stored access token while it is comfortably valid; otherwise a
// refresh, persisted with the exact update the /api/microsoft/test
// route uses (rotated refresh token kept, expiry + updated_at stamped)
// so a send never strands the connection.
async function accessTokenFor(supabase: any, conn: any): Promise<string> {
  const expiresAt = conn.access_expires_at
    ? new Date(conn.access_expires_at).getTime()
    : 0;
  if (conn.access_token && expiresAt > Date.now() + 120_000) {
    return conn.access_token;
  }
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
  return tokens.accessToken;
}

async function tryOutlook(
  supabase: any,
  opts: FollowupSendOptions
): Promise<FollowupSendResult | null> {
  const userId = await resolveSenderUserId(
    supabase,
    opts.accountId,
    opts.senderUserId
  );
  if (!userId) return null;
  const conn = await getConnection(supabase, userId);
  if (!conn) return null;
  if (!hasMailSend(conn)) {
    console.log(
      `Outlook send skipped for ${conn.email}: Mail.Send not consented yet (reconnect needed) — using Resend fallback`
    );
    return null;
  }

  let token = await accessTokenFor(supabase, conn);
  try {
    await msGraphSendMail(token, {
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (e: any) {
    if (e?.status !== 401) throw e;
    // A cached token can look valid yet be rejected — refresh once and
    // retry before giving up on the mailbox.
    const fresh = await msRefreshTokens(conn.refresh_token);
    await supabase
      .from("user_mail_connections")
      .update({
        access_token: fresh.accessToken,
        refresh_token: fresh.refreshToken || conn.refresh_token,
        access_expires_at: fresh.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    token = fresh.accessToken;
    await msGraphSendMail(token, {
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  }

  return {
    channel: "outlook",
    from: conn.email as string,
    resendId: `outlook:${conn.email}`,
    error: null,
  };
}

export async function sendFollowupEmail(
  opts: FollowupSendOptions
): Promise<FollowupSendResult> {
  if (!opts.attachments?.length) {
    try {
      const via = await tryOutlook(opts.supabase, opts);
      if (via) return via;
    } catch (e: any) {
      console.error(
        `Outlook send failed (${e?.message || e}) — falling back to Resend`
      );
    }
  }

  try {
    const response: any = await resend.emails.send({
      from: opts.fallbackFrom,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
      ...(opts.fallbackReplyTo ? { replyTo: opts.fallbackReplyTo } : {}),
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    });
    if (response?.error) {
      return {
        channel: "resend",
        from: opts.fallbackFrom,
        resendId: null,
        error: response.error,
      };
    }
    return {
      channel: "resend",
      from: opts.fallbackFrom,
      resendId: response?.data?.id || null,
      error: null,
    };
  } catch (e: any) {
    return {
      channel: "resend",
      from: opts.fallbackFrom,
      resendId: null,
      error: e,
    };
  }
}

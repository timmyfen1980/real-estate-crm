/* eslint-disable @typescript-eslint/no-explicit-any */
// Microsoft 365 (Entra) OAuth helpers for the per-user Outlook connect.
// App "FC Group CRM" was registered 2026-10-21 in the team's own
// GoDaddy-managed thefcgroup.ca tenant. The client ID and tenant ID are
// public identifiers (safe in code); the client SECRET lives only in the
// MICROSOFT_CLIENT_SECRET environment variable and never in this repo.
//
// Flow: /api/microsoft/connect -> Microsoft sign-in + consent ->
// /api/auth/microsoft/callback (the registered redirect URI) -> tokens
// stored per user in public.user_mail_connections (service role only).

export const MS_TENANT_ID = "9508556b-d87a-4ab2-b760-c0895fa328dc";
export const MS_CLIENT_ID = "a24695ac-2797-4259-86c7-58e29d385cdb";
export const MS_REDIRECT_URI =
  "https://crm.thefcgroup.ca/api/auth/microsoft/callback";
// Read mail + calendar, see the profile, keep the connection alive with
// a refresh token — and, since 2026-11-02, send follow-up email as the
// user (Mail.Send, used by lib/outlookSend.ts). Connections made before
// Mail.Send was added do NOT hold it: they keep working for reads, and
// follow-up sends fall back to Resend until the user clicks Connect
// once more and consents to the new scope.
export const MS_SCOPES =
  "openid profile offline_access User.Read Mail.Read Calendars.Read Mail.Send";

const AUTHORITY = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0`;

export function msAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: MS_REDIRECT_URI,
    response_mode: "query",
    scope: MS_SCOPES,
    state,
    prompt: "select_account",
  });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

export interface MsTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO timestamp
  scope: string;
}

async function tokenRequest(params: Record<string, string>): Promise<MsTokens> {
  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!secret) throw new Error("MICROSOFT_CLIENT_SECRET is not set.");
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: secret,
      ...params,
    }).toString(),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Microsoft token request failed: ${data.error || res.status} ${
        data.error_description || ""
      }`.trim()
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    scope: data.scope || MS_SCOPES,
  };
}

export function msExchangeCode(code: string): Promise<MsTokens> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: MS_REDIRECT_URI,
    scope: MS_SCOPES,
  });
}

export function msRefreshTokens(refreshToken: string): Promise<MsTokens> {
  // No scope parameter on purpose: a refresh may only ever claim scopes
  // the user has already consented to. Naming MS_SCOPES here would make
  // every refresh fail for connections made before Mail.Send was added
  // (they never consented to it), breaking their mail/calendar reads
  // until they re-connect. With scope omitted, Microsoft issues a token
  // carrying exactly the granted scopes — and once a user re-consents,
  // the same refresh automatically carries Mail.Send too.
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

// The signed-in Microsoft account's identity (email used for display and
// for matching the connection to the right mailbox).
export async function msGraphMe(
  accessToken: string
): Promise<{ email: string; displayName: string }> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Microsoft Graph /me failed: ${res.status}`);
  }
  return {
    email: data.mail || data.userPrincipalName || "",
    displayName: data.displayName || "",
  };
}

// Send one email AS the token's user via Microsoft Graph. The message
// comes from that user's own mailbox and a copy lands in their Sent
// Items (saveToSentItems), so replies thread back to them naturally.
// Graph answers 202 Accepted with no body on success; anything else
// throws an error carrying the HTTP status so callers can decide
// whether to retry with a fresh token or fall back to another channel.
export async function msGraphSendMail(
  accessToken: string,
  msg: { to: string; subject: string; html: string }
): Promise<void> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: { contentType: "HTML", content: msg.html },
        toRecipients: [{ emailAddress: { address: msg.to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err: any = new Error(
      `Microsoft Graph sendMail failed: ${res.status} ${detail.slice(0, 300)}`.trim()
    );
    err.status = res.status;
    throw err;
  }
}

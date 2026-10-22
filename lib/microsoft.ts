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
// Read mail + calendar, see the profile, and keep the connection alive
// with a refresh token. No Mail.Send — the CRM never sends as the user.
export const MS_SCOPES =
  "openid profile offline_access User.Read Mail.Read Calendars.Read";

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
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MS_SCOPES,
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

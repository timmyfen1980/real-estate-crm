import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

// POST /api/admin/skyslope — Rea's doorway to the SkySlope API.
// Bearer-gated with the agent secret. The SkySlope keys themselves live ONLY
// in this project's Vercel environment variables (Tim pastes them there;
// they never pass through chat or Rea):
//   SKYSLOPE_CLIENT_ID (alias HALLMARK_SKYSLOPE_CLIENT),
//   SKYSLOPE_CLIENT_SECRET (alias SKYSLOPE_HALLMARK_SECRET),
//   SKYSLOPE_ACCESS_KEY, SKYSLOPE_SECRET_KEY (alias SKYSLOPE_ACCESS_SECRET)
//
// SkySlope auth (from SkySlope's own sample code):
//   timestamp = current UTC time, ISO, no milliseconds
//   hmac = base64(HMAC-SHA256(key = accessSecret,
//             msg = clientId + ":" + clientSecret + ":" + timestamp))
//   POST https://api.skyslope.com/auth/login
//     headers: Authorization: "ss " + accessKey + ":" + hmac,
//              Timestamp: timestamp, Content-Type: application/json
//     body: { ClientId, ClientSecret }
//   -> { Session }
// GraphQL: POST https://api.skyslope.com/api/graphql
//     headers: Session, Timestamp, Content-Type: application/json
//     body: { query, variables }
//
// Actions:
//   { action: "test" }  — sign in and report what the API offers
//                         (schema root fields + a sample listings pull).
//                         If only the access pair is configured, also tries
//                         the access pair in the client role and reports
//                         SkySlope's raw answer for each mode.
//   { action: "query", query, variables } — signed GraphQL passthrough.

const AUTH_URL = 'https://api.skyslope.com/auth/login';
const GQL_URL = 'https://api.skyslope.com/api/graphql';

function utcTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

interface CredSet {
  mode: string;
  clientId: string;
  clientSecret: string;
  accessKey: string;
  accessSecret: string;
}

function configuredCredSets(): { sets: CredSet[]; missing: string[] } {
  const clientId = process.env.SKYSLOPE_CLIENT_ID || process.env.HALLMARK_SKYSLOPE_CLIENT || '';
  const clientSecret = process.env.SKYSLOPE_CLIENT_SECRET || process.env.SKYSLOPE_HALLMARK_SECRET || '';
  const accessKey = process.env.SKYSLOPE_ACCESS_KEY || '';
  const accessSecret = process.env.SKYSLOPE_SECRET_KEY || process.env.SKYSLOPE_ACCESS_SECRET || '';
  const sets: CredSet[] = [];
  const missing: string[] = [];
  if (clientId && clientSecret && accessKey && accessSecret) {
    sets.push({ mode: 'full', clientId, clientSecret, accessKey, accessSecret });
  } else {
    if (!clientId) missing.push('SKYSLOPE_CLIENT_ID');
    if (!clientSecret) missing.push('SKYSLOPE_CLIENT_SECRET');
    if (!accessKey) missing.push('SKYSLOPE_ACCESS_KEY');
    if (!accessSecret) missing.push('SKYSLOPE_SECRET_KEY');
  }
  if (accessKey && accessSecret && !(clientId && clientSecret)) {
    // Fallback worth one honest try: some first-party setups use the
    // generated pair in both roles. SkySlope's answer decides.
    sets.push({
      mode: 'access-pair-as-client',
      clientId: accessKey,
      clientSecret: accessSecret,
      accessKey,
      accessSecret,
    });
  }
  return { sets, missing };
}

async function skyLogin(cred: CredSet): Promise<{ session: string | null; status: number; detail: string }> {
  const timestamp = utcTimestamp();
  const hmac = createHmac('sha256', cred.accessSecret)
    .update(`${cred.clientId}:${cred.clientSecret}:${timestamp}`)
    .digest('base64');
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ss ${cred.accessKey}:${hmac}`,
      Timestamp: timestamp,
    },
    body: JSON.stringify({ ClientId: cred.clientId, ClientSecret: cred.clientSecret }),
  });
  const text = await res.text();
  let session: string | null = null;
  try {
    const json = JSON.parse(text);
    if (json && typeof json.Session === 'string' && json.Session) session = json.Session;
  } catch {
    /* non-JSON error body — detail carries it */
  }
  return { session, status: res.status, detail: text.slice(0, 400) };
}

async function skyGraphQL(session: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Session: session,
      Timestamp: utcTimestamp(),
    },
    body: JSON.stringify({ query, variables: variables || {} }),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* leave null */
  }
  return { status: res.status, json, raw: text.slice(0, 1000) };
}

const SCHEMA_PROBE = `{
  __schema {
    queryType { fields { name } }
    mutationType { fields { name } }
  }
}`;

const SAMPLE_LISTINGS = `query GetBulkExport($modifiedAfter: DateTime) {
  listings(modifiedAfter: $modifiedAfter) {
    id
    objectType
    status
    createdOn
    modifiedOn
  }
}`;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.REA_AGENT_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'test';
    const { sets, missing } = configuredCredSets();

    if (!sets.length) {
      return NextResponse.json(
        { ok: false, error: 'SkySlope keys are not configured yet.', missing },
        { status: 200 }
      );
    }

    // Sign in with the first credential set that works; remember every answer.
    let session: string | null = null;
    let usedMode = '';
    const attempts: Array<{ mode: string; status: number; detail: string }> = [];
    for (const cred of sets) {
      const r = await skyLogin(cred);
      attempts.push({ mode: cred.mode, status: r.status, detail: r.session ? 'session issued' : r.detail });
      if (r.session) {
        session = r.session;
        usedMode = cred.mode;
        break;
      }
    }
    if (!session) {
      return NextResponse.json({ ok: false, error: 'SkySlope sign-in failed.', missing, attempts });
    }

    if (action === 'query') {
      if (!body.query || typeof body.query !== 'string') {
        return NextResponse.json({ error: 'query required' }, { status: 400 });
      }
      const r = await skyGraphQL(session, body.query, body.variables);
      return NextResponse.json({ ok: r.status === 200, mode: usedMode, status: r.status, data: r.json, raw: r.json ? undefined : r.raw });
    }

    // action === 'test': schema roots + a 90-day sample pull.
    const schema = await skyGraphQL(session, SCHEMA_PROBE);
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const sample = await skyGraphQL(session, SAMPLE_LISTINGS, { modifiedAfter: since });
    const listings = sample.json?.data?.listings;
    return NextResponse.json({
      ok: true,
      mode: usedMode,
      missing,
      attempts,
      schema: schema.json?.data?.__schema || null,
      schemaErrors: schema.json?.errors || undefined,
      sampleListings: Array.isArray(listings)
        ? { count: listings.length, first: listings.slice(0, 3) }
        : null,
      sampleErrors: sample.json?.errors || undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'SkySlope route failed' }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Offer packages — the document home for each offer (Offers tab).
// A package groups every form for one property (generated or uploaded),
// each document tracked signed / unsigned, ready to go out together
// when the iinked Sign hookup lands.
// Auth: signed-in team member (session + account membership) or the
// agent Bearer secret.
//   GET                          -> { ok, packages: [...] } (address order)
//   POST { action: 'file_url', id, path }        -> signed download URL
//   POST { action: 'set_status', id, status }    -> package status
//   POST { action: 'set_doc_signed', id, path, signed }
//   POST { action: 'delete', id }                -> row + storage files
//   POST multipart { action: 'add_file', id, file } -> upload + append

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const FC_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";
const BUCKET = "client-documents";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function authorized(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (token && token === process.env.REA_AGENT_SECRET) return true;
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
  if (!user) return false;
  const { data } = await serviceClient()
    .from("account_users")
    .select("user_id")
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
}

function tableMissing(error: any): boolean {
  const msg = String(error?.message || "");
  return msg.includes("offer_packages") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const supabase = serviceClient();
    const { data, error } = await supabase
      .from("offer_packages")
      .select("id,address,city,mls,status,partial,documents,created_at,updated_at")
      .eq("account_id", FC_ACCOUNT_ID)
      .order("address", { ascending: true });
    if (error) {
      if (tableMissing(error)) {
        return NextResponse.json({ ok: true, packages: [], table_missing: true });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, packages: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "List failed." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const supabase = serviceClient();
    const contentType = req.headers.get("content-type") || "";

    // --- multipart: add a file to a package ---
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const id = String(formData.get("id") || "");
      const file = formData.get("file") as File | null;
      if (!id || !file) {
        return NextResponse.json({ ok: false, error: "Need a package id and a file." }, { status: 400 });
      }
      const { data: pkg, error } = await supabase
        .from("offer_packages")
        .select("id,documents")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!pkg) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      const safeName = (file.name || "document.pdf").replace(/[^\w.\- ]+/g, "_");
      const path = `offers/${id}/${Date.now()}-${safeName}`;
      const bytes = await file.arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: file.type || "application/pdf", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const docs = Array.isArray(pkg.documents) ? [...pkg.documents] : [];
      docs.push({
        form: "file",
        filename: safeName,
        path,
        signed: false,
        added_at: new Date().toISOString(),
      });
      const { error: updErr } = await supabase
        .from("offer_packages")
        .update({ documents: docs })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      return NextResponse.json({ ok: true, documents: docs });
    }

    // --- JSON actions ---
    const body = (await req.json().catch(() => ({}))) as any;
    const id = String(body.id || "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Need a package id." }, { status: 400 });
    }

    if (body.action === "file_url") {
      const path = String(body.path || "");
      if (!path.startsWith(`offers/${id}/`)) {
        return NextResponse.json({ ok: false, error: "Bad file path." }, { status: 400 });
      }
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, url: data.signedUrl });
    }

    if (body.action === "set_status") {
      const { error } = await supabase
        .from("offer_packages")
        .update({ status: String(body.status || "draft") })
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_doc_signed") {
      const { data: pkg, error } = await supabase
        .from("offer_packages")
        .select("id,documents")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!pkg) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      const docs = (Array.isArray(pkg.documents) ? pkg.documents : []).map((d: any) =>
        d.path === body.path ? { ...d, signed: body.signed === true } : d
      );
      const { error: updErr } = await supabase
        .from("offer_packages")
        .update({ documents: docs })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      return NextResponse.json({ ok: true, documents: docs });
    }

    if (body.action === "delete") {
      const { data: pkg } = await supabase
        .from("offer_packages")
        .select("id,documents")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      const paths = (Array.isArray(pkg?.documents) ? pkg.documents : [])
        .map((d: any) => d.path)
        .filter(Boolean);
      if (paths.length) {
        await supabase.storage.from(BUCKET).remove(paths);
      }
      const { error } = await supabase
        .from("offer_packages")
        .delete()
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Package action failed." },
      { status: 500 }
    );
  }
}

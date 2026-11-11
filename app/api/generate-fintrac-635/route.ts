import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

// Field mapping for FINTRAC Form 635 (Receipt of Funds Record) — the
// values are the REAL widget names inside the stored blank template
// (forms/fintrac-635-blank.pdf), from field-mapping-fintrac.json.
// Fixed 2026-11-11: this route used to write friendly names that do not
// exist in the template, so every write missed (caught and skipped) and
// the generated form filed blank.
const FIELD_MAP: Record<string, string> = {
  transaction_property_address: 'form635.0.0',
  transaction_property_address_line2: 'form635.0.1',
  sales_rep_broker_name: 'form635.1.0',
  fund1_amount: 'form635.2.1',
  fund1_currency: 'form635.3.0',
  fund1_date_of_receipt: 'form635.3.1',
  fund1_purpose: 'form635.5.0',
  provider_full_legal_name: 'Text1',
  provider_address_line1: 'Text2.0',
  provider_address_line2: 'Text2.1',
  provider_date_of_birth: 'Text2.2',
  provider_occupation: 'Text2.3.0',
  provider_date_verified: 'Text2.3.1',
  d11_document_identifier_number: 'Text5',
  d11_issuing_jurisdiction: 'Text6',
  d11_issuing_country: 'Text7',
  d11_document_expiry_date: 'Text8',
};

// How the funds arrived (the checklist page prompts electronic /
// in_person / mail) → the form's "method of receipt" checkboxes
const METHOD_BOXES: Record<string, string> = {
  electronic: 'form635ch.4.1',
  in_person: 'form635ch.3.1',
  mail: 'form635ch.4.0',
};

// Provider identification section D.1.1 — driver's licence checkbox
const PROVIDER_LICENCE_BOX = 'Check Box3.0';

export async function POST(request: NextRequest) {
  try {
    const { contact_id, client_file_id, funds_amount, funds_method, funds_date } = await request.json();
    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contact_id)
      .single();

    if (contactErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const missing: string[] = [];
    if (!contact.first_name && !contact.last_name) missing.push('name');
    if (!funds_amount) missing.push('funds amount');
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const { data: formData, error: formErr } = await supabase.storage
      .from('client-documents')
      .download('forms/fintrac-635-blank.pdf');

    if (formErr || !formData) {
      return NextResponse.json(
        { error: 'Blank FINTRAC Form 635 not found in storage.' },
        { status: 404 }
      );
    }

    const formBytes = await formData.arrayBuffer();
    const pdfDoc = await PDFDocument.load(formBytes);
    const form = pdfDoc.getForm();

    // Context for the header block: the transaction property from the
    // client file (when generating from one) and the sales rep from the
    // contact's assigned user. Best-effort — a miss leaves the line
    // blank rather than failing the whole form.
    let propertyAddress = '';
    if (client_file_id) {
      const { data: cfHead } = await supabase
        .from('client_files')
        .select('property_address')
        .eq('id', client_file_id)
        .single();
      propertyAddress = (cfHead?.property_address || '').trim();
    }
    let repName = '';
    if (contact.assigned_user_id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', contact.assigned_user_id)
        .single();
      if (prof) {
        repName = (prof.full_name || `${prof.first_name || ''} ${prof.last_name || ''}`).trim();
      }
    }

    // Fill the form. Core writes are STRICT (no catch): if a widget
    // name ever stops matching the stored template, generation fails
    // loudly instead of filing a blank form.
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    const cityLine = `${contact.city || ''}, ${contact.province || ''} ${contact.postal_code || ''}`.replace(/^, /, '').trim();
    const addrLine1 = (contact.address || '').trim() || cityLine;
    const addrLine2 = (contact.address || '').trim() ? cityLine : '';
    const slashDate = (iso: any) => {
      const s = typeof iso === 'string' ? iso.slice(0, 10) : '';
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '/') : '';
    };
    const todayLong = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/Toronto',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const amountNum = parseFloat(String(funds_amount).replace(/[$,]/g, ''));
    const amountText = Number.isFinite(amountNum)
      ? amountNum.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(funds_amount);

    const setText = (key: string, value: string) => {
      if (!value) return;
      form.getTextField(FIELD_MAP[key]).setText(value);
    };

    setText('transaction_property_address', propertyAddress);
    setText('sales_rep_broker_name', repName);
    setText('fund1_amount', amountText);
    setText('fund1_currency', 'CAD');
    setText('fund1_date_of_receipt', funds_date || '');
    setText('fund1_purpose', propertyAddress ? `Deposit — purchase of ${propertyAddress}` : 'Deposit');

    // Provider of the funds (Part D) — the client themselves
    setText('provider_full_legal_name', fullName);
    setText('provider_address_line1', addrLine1);
    setText('provider_address_line2', addrLine2);
    setText('provider_date_of_birth', slashDate(contact.birthday || contact.date_of_birth || ''));
    setText('provider_occupation', contact.occupation || '');
    setText('provider_date_verified', todayLong);
    setText('d11_document_identifier_number', contact.licence_number || '');
    setText('d11_issuing_jurisdiction', contact.licence_province || 'Ontario');
    setText('d11_issuing_country', 'Canada');
    setText('d11_document_expiry_date', slashDate(contact.licence_expiry || ''));
    if (contact.licence_number) {
      try {
        form.getCheckBox(PROVIDER_LICENCE_BOX).check();
      } catch (e) {
        console.log('Provider licence checkbox not found, skipping');
      }
    }

    // Check the funds method (delivery) checkbox
    if (funds_method) {
      const checkboxName = METHOD_BOXES[String(funds_method).toLowerCase()];
      if (checkboxName) {
        form.getCheckBox(checkboxName).check();
      }
    }

    const pdfBytes = await pdfDoc.save();
    const fileName = `fintrac-635-${contact.first_name}-${contact.last_name}-${Date.now()}.pdf`.replace(/\s+/g, '-');
    const storagePath = `filled-forms/${contact_id}/${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from('client-documents')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json({ error: 'Failed to upload: ' + uploadErr.message }, { status: 500 });
    }

    // File the generated form into the client file's documents
    // (fixed 2026-10-23: this used to insert columns that don't
    // exist on client_documents — contact_id / document_name /
    // file_path — so the insert failed silently and no document
    // ever appeared in the file even though the route reported
    // success). Now it completes the file's FINTRAC 635 checklist
    // row when one exists, or appends a row to the file's last
    // stage when it doesn't.
    if (client_file_id) {
      const { data: cf } = await supabase
        .from('client_files')
        .select('checklist_types')
        .eq('id', client_file_id)
        .single();
      const primaryType = (cf?.checklist_types || [])[0] || null;
      const { data: rows } = await supabase
        .from('client_documents')
        .select('id, document, form, checklist_type, stage_index, doc_index')
        .eq('client_file_id', client_file_id);
      const all: any[] = rows || [];
      const match = all.find(
        (r: any) =>
          (r.form || '').includes('635') ||
          (r.document || '').includes('Receipt of Funds')
      );
      if (match) {
        const { error: updErr } = await supabase
          .from('client_documents')
          .update({
            status: 'received',
            file_url: storagePath,
            received_at: new Date().toISOString(),
            received_via: 'generated',
          })
          .eq('id', match.id);
        if (updErr) throw new Error('The form generated but could not be filed on the checklist: ' + updErr.message);
      } else if (primaryType) {
        const siblings = all.filter((r: any) => r.checklist_type === primaryType);
        const lastStage = siblings.reduce((m: number, r: any) => Math.max(m, r.stage_index || 0), 0);
        const stageSiblings = siblings.filter((r: any) => (r.stage_index || 0) === lastStage);
        const nextDocIndex = stageSiblings.reduce((m: number, r: any) => Math.max(m, (r.doc_index ?? -1) + 1), 0);
        const { error: insErr } = await supabase.from('client_documents').insert({
          client_file_id,
          checklist_type: primaryType,
          stage_index: lastStage,
          doc_index: nextDocIndex,
          document: `FINTRAC Form 635 - ${fullName}`,
          form: 'FINTRAC Form 635',
          required: 'required',
          status: 'received',
          file_url: storagePath,
          received_at: new Date().toISOString(),
          received_via: 'generated',
        });
        if (insErr) throw new Error('The form generated but could not be filed on the checklist: ' + insErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      file_path: storagePath,
      message: 'FINTRAC Form 635 generated successfully',
    });

  } catch (err: any) {
    console.error('FINTRAC 635 generation error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate form' },
      { status: 500 }
    );
  }
}

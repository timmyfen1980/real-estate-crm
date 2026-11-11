import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

// Field mapping for FINTRAC Form 630 (Individual ID Record) — the values
// are the REAL widget names inside the stored blank template
// (forms/fintrac-630-blank.pdf), from field-mapping-fintrac.json.
// Fixed 2026-11-11: this map used to point each key at a friendly name
// that does not exist in the template, so every write missed (caught and
// skipped) and the generated form filed blank.
const FIELD_MAP: Record<string, string> = {
  transaction_property_address: 'form630.0.0',
  transaction_property_address_line2: 'form630.0.1',
  sales_rep_broker_name: 'form630.1.0',
  date_information_verified: 'form630.1.1',
  individual_full_legal_name: 'form630.2.0',
  individual_address_line1: 'form630.2.1',
  individual_address_line2: 'form630.3.0',
  individual_date_of_birth: 'form630.3.1',
  individual_occupation: 'form630.4.0',
  a1_id_type_drivers_licence: 'Check Box2.0',
  a1_document_identifier_number: 'form630.4.1',
  a1_issuing_jurisdiction: 'form630.5.0',
  a1_issuing_country: 'form630.5.1',
  a1_document_expiry_date: 'form630.6.1',
};

// D.1 purpose of transaction — residential property (the standard case
// for this brokerage's buyer/seller files)
const PURPOSE_RESIDENTIAL_BOX = 'Check Box1.6.1.1.1.0.1';

// Risk questionnaire — all "No" (no issues) by default
// Field names from field-mapping-fintrac.json
// Risk questionnaire — zero-score answers
// Q1 and Q5 are INVERTED: Yes = 0 points (No = 2 points)
// All others: No = 0 points
const RISK_ZERO_CHECKBOXES = [
  'Check Box3',   // risk_q1_yes — "Prior relationship?" Yes=0
  'Check Box8',   // risk_q2_no
  'Check Box11',  // risk_q3_no
  'Check Box18',  // risk_q4_no
  'Check Box13',  // risk_q5_yes — "Canadian citizen/PR?" Yes=0
  'Check Box22',  // risk_q6_no
  'Check Box23',  // risk_q7_no
  'Check Box24',  // risk_q8_no
  'Check Box28',  // risk_q9_no
  'Check Box35',  // risk_q10_no
  'Check Box34',  // risk_q11_no
  'Check Box33',  // risk_q12_no
  'Check Box41',  // risk_q13_no
  'Check Box42',  // risk_q14_no
  'Check Box49',  // risk_q15_no
  'Check Box48',  // risk_q16_no
  'Check Box47',  // risk_q17_no
  'Check Box1.4.0', // b1_third_party_no
];

export async function POST(request: NextRequest) {
  try {
    const { contact_id, client_file_id } = await request.json();
    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get contact data
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contact_id)
      .single();

    if (contactErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Validate required fields. `missing` is machine-readable so the
    // client-file page can ask for exactly these fields inline and
    // save them to the contact, instead of a dead-end alert.
    const missing: string[] = [];
    if (!contact.first_name && !contact.last_name) missing.push('name');
    if (!contact.occupation) missing.push('occupation');
    if (!contact.licence_number) missing.push('licence number');
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required fields: ${missing.join(', ')}. These live on the contact — add them there and try again.`,
          missing,
        },
        { status: 400 }
      );
    }

    // Get blank Form 630 from Supabase storage
    // The blank forms are in the client-documents bucket under forms/
    const { data: formData, error: formErr } = await supabase.storage
      .from('client-documents')
      .download('forms/fintrac-630-blank.pdf');

    if (formErr || !formData) {
      return NextResponse.json(
        { error: 'Blank FINTRAC Form 630 not found in storage. Please upload it first.' },
        { status: 404 }
      );
    }

    const formBytes = await formData.arrayBuffer();
    const pdfDoc = await PDFDocument.load(formBytes);
    const form = pdfDoc.getForm();

    // Context for the form's header block: the transaction property from
    // the client file (when generating from one) and the sales rep from
    // the contact's assigned user. Both are best-effort — a miss leaves
    // that line blank rather than failing the whole form.
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

    // Fill the fields. Core writes are STRICT (no catch): if a widget
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

    const setText = (key: string, value: string) => {
      if (!value) return;
      form.getTextField(FIELD_MAP[key]).setText(value);
    };

    setText('transaction_property_address', propertyAddress);
    setText('sales_rep_broker_name', repName);
    setText('date_information_verified', todayLong);
    setText('individual_full_legal_name', fullName);
    setText('individual_address_line1', addrLine1);
    setText('individual_address_line2', addrLine2);
    setText('individual_date_of_birth', slashDate(contact.birthday || contact.date_of_birth || ''));
    setText('individual_occupation', contact.occupation || '');
    setText('a1_document_identifier_number', contact.licence_number || '');
    setText('a1_issuing_jurisdiction', contact.licence_province || 'Ontario');
    setText('a1_issuing_country', 'Canada');
    setText('a1_document_expiry_date', slashDate(contact.licence_expiry || ''));

    // Check the driver's licence checkbox + the D.1 residential purpose
    try {
      form.getCheckBox(FIELD_MAP['a1_id_type_drivers_licence']).check();
      form.getCheckBox(PURPOSE_RESIDENTIAL_BOX).check();
    } catch (e) {
      console.log('Checkbox not found, skipping');
    }

    // Auto-fill risk questionnaire — zero-score answers (Q1+Q5=Yes, rest=No)
    // Beth can manually change any answer on the generated PDF if needed
    for (const boxName of RISK_ZERO_CHECKBOXES) {
      try {
        form.getCheckBox(boxName).check();
      } catch (e) {
        console.log(`Risk checkbox ${boxName} not found, skipping`);
      }
    }

    const pdfBytes = await pdfDoc.save();

    // Upload to Supabase storage
    const fileName = `fintrac-630-${contact.first_name}-${contact.last_name}-${Date.now()}.pdf`.replace(/\s+/g, '-');
    const storagePath = `filled-forms/${contact_id}/${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from('client-documents')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json({ error: 'Failed to upload filled form: ' + uploadErr.message }, { status: 500 });
    }

    // File the generated form into the client file's documents
    // (fixed 2026-10-23: this used to insert columns that don't
    // exist on client_documents — contact_id / document_name /
    // file_path — so the insert failed silently and no document
    // ever appeared in the file even though the route reported
    // success). Now it completes the file's FINTRAC 630 checklist
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
          (r.form || '').includes('630') ||
          (r.document || '').includes('Individual Identification')
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
          document: `FINTRAC Form 630 - ${fullName}`,
          form: 'FINTRAC Form 630',
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
      message: 'FINTRAC Form 630 generated successfully',
    });

  } catch (err: any) {
    console.error('FINTRAC 630 generation error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate form' },
      { status: 500 }
    );
  }
}

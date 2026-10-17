import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

// Field mapping for FINTRAC Form 630 Page 0 (Individual ID Record)
// Based on field-mapping-fintrac.json
const FIELD_MAP: Record<string, string> = {
  individual_full_legal_name: 'individual_full_legal_name',
  individual_address_line1: 'individual_address_line1',
  individual_date_of_birth: 'individual_date_of_birth',
  individual_occupation: 'individual_occupation',
  a1_id_type_drivers_licence: 'a1_id_type_drivers_licence',
  a1_document_identifier_number: 'a1_document_identifier_number',
  a1_issuing_jurisdiction: 'a1_issuing_jurisdiction',
  a1_issuing_country: 'a1_issuing_country',
  a1_document_expiry_date: 'a1_document_expiry_date',
};

// Risk questionnaire — all "No" (no issues) by default
// Field names from field-mapping-fintrac.json
const RISK_NO_CHECKBOXES = [
  'Check Box4',   // risk_q1_no
  'Check Box8',   // risk_q2_no
  'Check Box11',  // risk_q3_no
  'Check Box18',  // risk_q4_no
  'Check Box17',  // risk_q5_no
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

    // Validate required fields
    const missing: string[] = [];
    if (!contact.first_name && !contact.last_name) missing.push('name');
    if (!contact.occupation) missing.push('occupation');
    if (!contact.licence_number) missing.push('licence number');
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}. Please fill in the Driver's Licence section.` },
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

    // Fill the fields
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    const address = `${contact.address || ''}, ${contact.city || ''}, ${contact.province || ''} ${contact.postal_code || ''}`.trim();

    const fieldValues: Record<string, string> = {
      individual_full_legal_name: fullName,
      individual_address_line1: address,
      individual_date_of_birth: contact.birthday || contact.date_of_birth || '',
      individual_occupation: contact.occupation || '',
      a1_document_identifier_number: contact.licence_number || '',
      a1_issuing_jurisdiction: contact.licence_province || 'Ontario',
      a1_issuing_country: 'Canada',
      a1_document_expiry_date: contact.licence_expiry || '',
    };

    for (const [fieldName, value] of Object.entries(fieldValues)) {
      try {
        const field = form.getTextField(FIELD_MAP[fieldName]);
        field.setText(value);
      } catch (e) {
        console.log(`Field ${fieldName} not found, skipping`);
      }
    }

    // Check the driver's licence checkbox
    try {
      const checkbox = form.getCheckBox(FIELD_MAP['a1_id_type_drivers_licence']);
      checkbox.check();
    } catch (e) {
      console.log('Drivers licence checkbox not found');
    }

    // Auto-fill risk questionnaire — all "No" (no issues identified)
    // Beth can manually change any answer on the generated PDF if needed
    for (const boxName of RISK_NO_CHECKBOXES) {
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

    // Create document record
    const docRecord: any = {
        contact_id: contact_id,
        document_name: `FINTRAC Form 630 - ${fullName}`,
        file_path: storagePath,
        document_type: 'fintrac_630',
      };
    if (client_file_id) {
      docRecord.client_file_id = client_file_id;
    }
    const { error: docErr } = await supabase
      .from('client_documents')
      .insert(docRecord);

    if (docErr) {
      console.log('Document record creation failed:', docErr.message);
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

import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

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

    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    const address = `${contact.address || ''}, ${contact.city || ''}, ${contact.province || ''} ${contact.postal_code || ''}`.trim();

    // Fill individual info (field names from mapping)
    const fieldValues: Record<string, string> = {
      'individual_full_legal_name': fullName,
      'individual_address_line1': address,
      'individual_date_of_birth': contact.birthday || contact.date_of_birth || '',
      'fund1_amount': funds_amount || '',
    };

    // Add funds date if provided
    if (funds_date) {
      // Try common date field names
      for (const dateField of ['fund1_date', 'date_funds_received', 'funds_received_date']) {
        try {
          form.getTextField(dateField).setText(funds_date);
          break;
        } catch (e) { /* try next */ }
      }
    }

    for (const [fieldName, value] of Object.entries(fieldValues)) {
      try {
        form.getTextField(fieldName).setText(value);
      } catch (e) {
        console.log(`Field ${fieldName} not found, skipping`);
      }
    }

    // Check funds method checkbox
    if (funds_method) {
      const methodMap: Record<string, string> = {
        'electronic': 'fund1_method_electronically',
        'in_person': 'fund1_method_in_person',
        'mail': 'fund1_method_mail',
      };
      const checkboxName = methodMap[funds_method.toLowerCase()];
      if (checkboxName) {
        try {
          form.getCheckBox(checkboxName).check();
        } catch (e) {
          console.log(`Checkbox ${checkboxName} not found`);
        }
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

    const docRecord: any = {
      contact_id: contact_id,
      document_name: `FINTRAC Form 635 - ${fullName}`,
      file_path: storagePath,
      document_type: 'fintrac_635',
    };
    if (client_file_id) docRecord.client_file_id = client_file_id;

    await supabase.from('client_documents').insert(docRecord);

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

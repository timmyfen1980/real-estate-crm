import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Send the licence photo to Rea in chat and she will fill in the details.' },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // Call OpenAI Vision.
    // - response_format json_object guarantees parseable JSON (no more refusals breaking JSON.parse)
    // - detail high helps with blurry/tilted phone photos
    // - temperature 0 keeps extraction deterministic
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are reading an Ontario driver's licence photo. The photo may be blurry, tilted, taken at an angle, or partially shadowed — do your best to read every visible field. Look carefully at each line of text on the card.

Return ONLY a JSON object with these exact keys. Use null only for a field you truly cannot read at all — never invent a value you cannot see.
{
  "first_name": "string or null",
  "last_name": "string or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "licence_number": "string or null (looks like F2560-74228-01006)",
  "address": "street address or null",
  "city": "string or null",
  "province": "string or null",
  "postal_code": "string or null",
  "expiry_date": "YYYY-MM-DD or null",
  "issue_date": "YYYY-MM-DD or null"
}
Read dates carefully and double-check each digit. If no text on the card is readable, return all nulls.`
              },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' }
              }
            ]
          }
        ],
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI error:', err);
      return NextResponse.json({ error: 'AI extraction failed. Please enter the details manually.' }, { status: 500 });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '{}';

    let extracted: Record<string, string | null>;
    try {
      // json_object mode guarantees JSON, but strip markdown fences just in case
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error('Could not parse model output:', content);
      return NextResponse.json({ error: 'Could not read licence. Please enter the details manually.' }, { status: 422 });
    }

    // If the model read nothing at all, say so plainly instead of "success" with blanks
    const values = Object.values(extracted || {});
    const gotAnything = values.some((v) => v !== null && v !== undefined && String(v).trim() !== '');
    if (!gotAnything) {
      return NextResponse.json({ error: 'Could not read licence. Please enter the details manually.' }, { status: 422 });
    }

    return NextResponse.json({ extracted });
  } catch (error) {
    console.error('Extract ID error:', error);
    return NextResponse.json({ error: 'Extraction failed. Please enter the details manually.' }, { status: 500 });
  }
}

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
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // Call OpenAI Vision
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract the following from this Ontario driver's licence photo. Return ONLY valid JSON with these exact keys (use null for any field not visible):
{
  "first_name": "string or null",
  "last_name": "string or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "licence_number": "string or null",
  "address": "street address or null",
  "city": "string or null",
  "province": "string or null",
  "postal_code": "string or null",
  "expiry_date": "YYYY-MM-DD or null",
  "issue_date": "YYYY-MM-DD or null"
}`
              },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64}` }
              }
            ]
          }
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI error:', err);
      return NextResponse.json({ error: 'AI extraction failed' }, { status: 500 });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '{}';
    
    // Parse the JSON (handle markdown code blocks)
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const extracted = JSON.parse(jsonStr);

    return NextResponse.json({ extracted });
  } catch (error) {
    console.error('Extract ID error:', error);
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });
  }
}

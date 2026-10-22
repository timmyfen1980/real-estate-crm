// Content-image discipline shared by BOTH email templates
// (Tim, 2026-10-22): Outlook's renderer ignores CSS max-width and
// prints under-specified images at natural size — a 1400px stock
// photo styled only "width:100%" renders at full size, forces the
// whole layout wide and adds a horizontal scrollbar, while the
// browser preview shrinks it to fit and looks fine. The fix that
// made the drip emails match their preview: every content image
// ends up with (a) a width attribute no larger than the content
// column, and (b) max-width + height:auto in its inline style.
// Images already carrying a sane width are left as authored.
function constrainContentImages(content: string, columnWidth: number): string {
  return String(content || '').replace(/<img[^>]*>/gi, (tag: string) => {
    let out = tag;
    let sized = false;
    // (a) width attribute — add when missing, clamp when oversized.
    const w = out.match(/\bwidth=(?:"(\d+)"|'(\d+)'|(\d+))/i);
    if (!w) {
      out = out.replace(/<img/i, `<img width="${columnWidth}"`);
      sized = true;
    } else {
      const n = Number(w[1] || w[2] || w[3]);
      if (n > columnWidth) {
        out = out.replace(
          w[0],
          w[1] ? `width="${columnWidth}"` : w[2] ? `width='${columnWidth}'` : `width=${columnWidth}`
        );
        sized = true;
      }
    }
    if (!sized) return out;
    // (b) inline style — add the constraining style when there is
    // none; append the cap when a style exists without one.
    const s = out.match(/\bstyle=("([^"]*)"|'([^']*)')/i);
    if (!s) {
      out = out.replace(
        /<img/i,
        `<img style="width:100%; max-width:${columnWidth}px; height:auto;"`
      );
    } else {
      const inner = s[2] !== undefined ? s[2] : s[3] || '';
      if (!/max-width/i.test(inner)) {
        const q = s[2] !== undefined ? '"' : "'";
        out = out.replace(s[0], `style=${q}${inner}; max-width:${columnWidth}px; height:auto;${q}`);
      }
    }
    return out;
  });
}

export function buildEmailTemplate({
  content,
  firstName,
  agentName,
  agentEmail,
  agentPhone,
  agentPhoto,
  teamLogo,
  brokerageLogo,
  brokerageName,
  unsubscribeLink,
  ctaLink,
  ctaText,
  emailHeaderImage,
}: any) {
  const safeContent = constrainContentImages(content || '', 544);
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#e5e7eb; font-family: Arial, sans-serif;">
<center>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e5e7eb;">
<tr><td align="center" style="padding:40px 0;">

  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; max-width:600px;">
    <tr><td height="10" style="background-color:#0f2a44; font-size:0; line-height:0;">&nbsp;</td></tr>
    ${emailHeaderImage ? `
    <tr><td>
      <img src="${emailHeaderImage}" width="600" alt="" style="width:100%; max-width:600px; height:auto; display:block; border:0;" />
    </td></tr>` : ''}
    <tr><td height="10" style="background-color:#0f2a44; font-size:0; line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:30px 28px 32px; font-size:16px; line-height:1.6; color:#111111;">
      <p style="font-size:20px; margin:0 0 20px 0; font-weight:600;">Hi ${firstName},</p>
      <div style="font-size:16px; line-height:1.8; color:#111111;">
        ${safeContent
          .replaceAll('{{first_name}}', firstName || '')
          .replaceAll('{{agent_name}}', agentName || '')}
      </div>
      ${ctaLink && ctaText ? `
      <table cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;">
        <tr><td style="background-color:#000000; border-radius:6px; padding:14px 24px;">
          <a href="${ctaLink}" style="color:#ffffff; text-decoration:none; font-weight:600; font-size:16px;">${ctaText}</a>
        </td></tr>
      </table>` : ''}
    </td></tr>
    <tr><td style="border-top:1px solid #eeeeee; padding:28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${agentPhoto ? `<td valign="middle" style="padding-right:12px;">
                  <img src="${agentPhoto}" width="28" height="28" alt="" style="width:28px; height:28px; display:block; border:0;" />
                </td>` : ''}
                <td valign="middle" style="font-size:15px; line-height:1.5; color:#111111;">
                  <div style="font-weight:700; font-size:16px;">${agentName}</div>
                  <div>${agentEmail}</div>
                  <div>${agentPhone}</div>
                  <div style="margin-top:4px; color:#555555;">${brokerageName}</div>
                </td>
              </tr>
            </table>
          </td>
          ${brokerageLogo ? `<td valign="middle" align="right" style="padding-left:20px;">
            <img src="${brokerageLogo}" width="120" height="40" alt="RE/MAX" style="width:120px; height:40px; display:block; border:0;" />
          </td>` : ''}
        </tr>
      </table>
    </td></tr>
    <tr><td style="background-color:#f5f5f5; text-align:center; padding:20px; font-size:12px; color:#666666;">
      <a href="${unsubscribeLink}" style="color:#666666; text-decoration:none;">Unsubscribe</a>
    </td></tr>
  </table>

</td></tr>
</table>
</center>
</body>
</html>
  `
}


export function buildNewsletterEmail({
  content,
  firstName,
  headline,
  teamName,
  teamEmail,
  teamPhone,
  brokerageName,
  brokerageLogoUrl,
  unsubscribeLink,
  ctaLink,
  ctaText,
}: any) {
  // Content images: the shared Outlook-proof constraining (see
  // constrainContentImages above), at this template's 544 column.
  const safeContent = constrainContentImages(content, 544);

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#e5e7eb; font-family: Arial, Helvetica, sans-serif;">
<center>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e5e7eb;">
<tr><td align="center" style="padding:40px 0;">

  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; max-width:600px;">
    <tr><td>
      <img src="cid:newsletter-hero" width="600" alt="Fennessey Comeau Group" style="width:100%; max-width:600px; height:auto; display:block; border:0;" />
    </td></tr>
    <tr><td height="6" style="background-color:#d22630; font-size:0; line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:30px 28px 6px;">
      <div style="font-family: Georgia, 'Times New Roman', serif; font-size:32px; font-weight:700; color:#0f2a44; line-height:1.2;">
        ${headline || ''}
      </div>
      <div style="font-size:13px; color:#888888; margin-top:10px; letter-spacing:1px;">
        BY THE FENNESSEY COMEAU GROUP
      </div>
      <table cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
        <tr><td width="60" height="3" style="background-color:#d22630; font-size:0; line-height:0;">&nbsp;</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 28px 30px; font-size:16px; line-height:1.75; color:#222222;">
      ${safeContent
        .replaceAll('{{first_name}}', firstName || '')
        .replaceAll('{{agent_name}}', 'Fennessey Comeau Group')}
      ${ctaLink && ctaText ? `
      <center>
      <table cellpadding="0" cellspacing="0" border="0" style="margin:30px auto 10px;">
        <tr><td style="background-color:#d22630; border-radius:4px; padding:16px 38px;">
          <a href="${ctaLink}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:15px; letter-spacing:1px;">${ctaText.toUpperCase()}</a>
        </td></tr>
      </table>
      </center>` : ''}
    </td></tr>
    <tr><td style="padding:0 28px 34px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e0dede; background-color:#fafafa;">
        <tr><td height="4" style="background-color:#d22630; font-size:0; line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:26px;">
          <div style="font-size:11px; letter-spacing:3px; color:#d22630; font-weight:700; margin-bottom:14px;">YOUR TEAM</div>
          <img src="cid:team-photo" width="150" alt="The Fennessey Comeau Group team" style="width:150px; height:auto; display:block; margin:0 auto; border:0;" />
          <div style="font-family: Georgia, 'Times New Roman', serif; font-weight:700; font-size:19px; margin-top:14px; color:#0f2a44;">Fennessey Comeau Group</div>
          <div style="font-size:14px; color:#444444; margin-top:6px;">${teamEmail}${teamPhone ? ` &nbsp;•&nbsp; ${teamPhone}` : ''}</div>
          <div style="font-size:13px; color:#777777; margin-top:4px;">RE/MAX HALLMARK FIRST GROUP REALTY LTD.</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="background-color:#0f2a44; text-align:center; padding:26px 30px; font-size:12px; color:#a9b6c4; line-height:1.7;">
      <div style="color:#ffffff; font-weight:700; letter-spacing:2px; font-size:13px; margin-bottom:8px;">FENNESSEY COMEAU GROUP</div>
      <div>RE/MAX HALLMARK FIRST GROUP REALTY LTD.</div>
      <div style="margin-top:10px;">
        <a href="${unsubscribeLink}" style="color:#d22630; text-decoration:underline;">Unsubscribe</a>
      </div>
    </td></tr>
  </table>

</td></tr>
</table>
</center>
</body>
</html>
  `
}

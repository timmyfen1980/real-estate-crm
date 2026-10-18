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
  return `
  <div style="background:#e5e7eb; padding:40px 0; font-family: Arial, sans-serif;">

    <!-- EMAIL CARD -->
    <div style="max-width:600px; margin:0 auto; background:#ffffff; overflow:hidden;">

      <!-- TOP BLUE BAR -->
<div style="height:10px; background:#0f2a44;"></div>

<!-- HERO IMAGE -->
${
  emailHeaderImage
    ? `<img 
          src="${emailHeaderImage}" 
          style="
            width:100%;
            height:auto;
            display:block;
          "
        />`
    : ''
}

<!-- BOTTOM BLUE BAR -->
<div style="height:10px; background:#0f2a44;"></div>

      <!-- BODY -->
      <div style="padding:30px 28px 32px; font-size:16px; line-height:1.6; color:#111;">
        
        <p style="font-size:20px; margin-bottom:20px; font-weight:600;">Hi ${firstName},</p>

        <div style="
  font-size:16px;
  line-height:1.8;
  color:#111;
">

  ${content
    .replaceAll('{{first_name}}', firstName || '')
    .replaceAll('{{agent_name}}', agentName || '')}

</div>

<style>
  p {
    margin: 0 0 18px 0;
  }

 ul {
  margin: 0 0 22px 20px;
  padding-left: 20px;
  list-style-type: disc;
}

li {
  margin-bottom: 10px;
  display: list-item;
}

  li {
    margin-bottom: 10px;
  }
</style>

        ${
          ctaLink && ctaText
            ? `<div style="margin-top:30px;">
                 <a href="${ctaLink}" style="
                   background:#000;
                   color:#fff;
                   padding:14px 24px;
                   text-decoration:none;
                   border-radius:6px;
                   display:inline-block;
                   font-weight:600;
                 ">
                   ${ctaText}
                 </a>
               </div>`
            : ''
        }

      </div>

      <!-- AGENT SECTION -->
      <div style="border-top:1px solid #eee; padding:28px; display:flex; justify-content:space-between; align-items:center;">
        
        <div style="display:flex; align-items:center;">
          ${
            agentPhoto
              ? `<img src="${agentPhoto}" style="width:70px; height:70px; border-radius:50%; margin-right:16px;" />`
              : ''
          }

          <div style="font-size:15px; line-height:1.5;">
            <div style="font-weight:700; font-size:16px;">${agentName}</div>
            <div>${agentEmail}</div>
            <div>${agentPhone}</div>
            <div style="margin-top:4px; color:#555;">${brokerageName}</div>
          </div>
        </div>

        ${
          brokerageLogo
            ? `<img src="${brokerageLogo}" style="height:70px;" />`
            : ''
        }

      </div>

      <!-- FOOTER -->
      <div style="background:#f5f5f5; text-align:center; padding:20px; font-size:12px; color:#666;">
        <a href="${unsubscribeLink}" style="color:#666; text-decoration:none;">
          Unsubscribe
        </a>
      </div>

    </div>
  </div>
  `
}

export function buildNewsletterEmail({
  content,
  firstName,
  headline,
  issueDate,
  teamName,
  teamEmail,
  teamPhone,
  brokerageName,
  brokerageLogoUrl,
  unsubscribeLink,
  ctaLink,
  ctaText,
}: any) {
  // Constrain oversized content images (Outlook renders width:100% at natural
  // size, so an explicit width attribute keeps them inside the column).
  const safeContent = String(content || '').replace(
    /<img(?![^>]*\bwidth=)/gi,
    '<img width="560"'
  );

  return `
  <div style="background:#ece8e1; padding:0; font-family: Arial, Helvetica, sans-serif;">

    <!-- GOLD ACCENT BAR -->
    <div style="height:6px; background:#c9a86a; font-size:0; line-height:0;">&nbsp;</div>

    <!-- NEWSLETTER BODY -->
    <div style="max-width:640px; margin:0 auto; background:#ffffff;">

      <!-- MASTHEAD -->
      <div style="text-align:center; padding:30px 30px 22px; border-bottom:4px solid #0f2a44;">
        <div style="font-size:11px; letter-spacing:4px; color:#c9a86a; font-weight:700;">
          THE FC GROUP &nbsp;•&nbsp; MONTHLY MARKET BRIEF
        </div>
        <div style="font-family: Georgia, 'Times New Roman', serif; font-size:40px; font-weight:700; color:#0f2a44; margin:10px 0 6px; line-height:1.1;">
          Fennessey &amp; Comeau
        </div>
        <div style="font-size:12px; color:#777; letter-spacing:2px;">
          ${(issueDate || '').toUpperCase()}
        </div>
      </div>

      <!-- HERO (team banner, CID-embedded so it always renders) -->
      <img src="cid:newsletter-hero" width="640" alt="${teamName || 'Fennessey & Comeau Real Estate Group'}" style="width:100%; max-width:640px; height:auto; display:block; border:0;" />

      <!-- COVER STORY HEADER -->
      <div style="padding:34px 44px 6px;">
        <div style="font-size:11px; letter-spacing:3px; color:#c9a86a; font-weight:700; margin-bottom:10px;">
          COVER STORY
        </div>
        <div style="font-family: Georgia, 'Times New Roman', serif; font-size:32px; font-weight:700; color:#0f2a44; line-height:1.2;">
          ${headline || ''}
        </div>
        <div style="font-size:13px; color:#888; margin-top:10px; letter-spacing:1px;">
          BY THE ${String(teamName || '').toUpperCase()} TEAM
        </div>
        <div style="width:60px; height:3px; background:#c9a86a; margin-top:14px; font-size:0; line-height:0;">&nbsp;</div>
      </div>

      <!-- ARTICLE BODY -->
      <div style="padding:20px 44px 30px; font-size:16px; line-height:1.75; color:#222;">
        ${safeContent
          .replaceAll('{{first_name}}', firstName || '')
          .replaceAll('{{agent_name}}', teamName || '')}
        <style>
          p { margin: 0 0 18px 0; }
          ul { margin: 0 0 22px 20px; padding-left: 20px; list-style-type: disc; }
          li { margin-bottom: 10px; display: list-item; }
          img { max-width: 100%; height: auto; display:block; margin: 22px auto; border-radius:4px; }
          h2, h3 { font-family: Georgia, 'Times New Roman', serif; color:#0f2a44; }
        </style>
        ${
          ctaLink && ctaText
            ? `<div style="margin:30px 0 10px; text-align:center;">
                 <a href="${ctaLink}" style="
                   background:#0f2a44;
                   color:#ffffff;
                   padding:16px 38px;
                   text-decoration:none;
                   border-radius:4px;
                   display:inline-block;
                   font-weight:700;
                   font-size:15px;
                   letter-spacing:1px;
                 ">
                   ${ctaText.toUpperCase()}
                 </a>
               </div>`
            : ''
        }
      </div>

      <!-- TEAM BOX -->
      <div style="margin:0 44px 34px; border:1px solid #e2ddd2; border-top:4px solid #c9a86a; padding:26px; text-align:center; background:#faf8f4;">
        <div style="font-size:11px; letter-spacing:3px; color:#c9a86a; font-weight:700; margin-bottom:14px;">
          YOUR TEAM
        </div>
        <img src="cid:team-photo" width="150" alt="The FC Group team" style="width:150px; max-width:150px; height:auto; display:block; margin:0 auto; border:0; border-radius:10px;" />
        <div style="font-family: Georgia, 'Times New Roman', serif; font-weight:700; font-size:19px; margin-top:14px; color:#0f2a44;">${teamName}</div>
        <div style="font-size:14px; color:#444; margin-top:6px;">${teamEmail}${
    teamPhone ? ` &nbsp;•&nbsp; ${teamPhone}` : ''
  }</div>
        <div style="font-size:13px; color:#777; margin-top:4px;">${brokerageName || ''}</div>
      </div>

      <!-- FOOTER -->
      <div style="background:#0f2a44; text-align:center; padding:26px 30px; font-size:12px; color:#a9b6c4; line-height:1.7;">
        <div style="color:#ffffff; font-weight:700; letter-spacing:2px; font-size:13px; margin-bottom:8px;">
          FENNESSEY &amp; COMEAU REAL ESTATE GROUP
        </div>
        <div>${brokerageName || ''}</div>
        <div style="margin-top:10px;">
          <a href="${unsubscribeLink}" style="color:#c9a86a; text-decoration:underline;">
            Unsubscribe
          </a>
        </div>
      </div>

    </div>

    <!-- GOLD ACCENT BAR -->
    <div style="height:6px; background:#c9a86a; font-size:0; line-height:0;">&nbsp;</div>

  </div>
  `
}

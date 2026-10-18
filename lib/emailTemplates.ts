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
  // size, so an explicit width attribute keeps them inside the 600px card).
  const safeContent = String(content || '').replace(
    /<img(?![^>]*\bwidth=)/gi,
    '<img width="600"'
  );

  return `
  <div style="background:#e5e7eb; padding:40px 0; font-family: Arial, sans-serif;">

    <!-- EMAIL CARD -->
    <div style="max-width:600px; margin:0 auto; background:#ffffff; overflow:hidden;">

      <!-- TOP NAVY BAR -->
      <div style="height:10px; background:#0f2a44;"></div>

      <!-- HERO (team banner, CID-embedded so it always renders) -->
      <img src="cid:newsletter-hero" width="600" alt="${
        teamName || 'Fennessey & Comeau Real Estate Group'
      }" style="width:100%; max-width:600px; height:auto; display:block; border:0;" />

      <!-- BOTTOM NAVY BAR -->
      <div style="height:10px; background:#0f2a44;"></div>

      <!-- BODY -->
      <div style="padding:30px 28px 32px; font-size:16px; line-height:1.6; color:#111;">

        <p style="font-size:20px; margin-bottom:20px; font-weight:600;">Hi ${firstName},</p>

        <div style="font-size:16px; line-height:1.8; color:#111;">
          ${safeContent
            .replaceAll('{{first_name}}', firstName || '')
            .replaceAll('{{agent_name}}', teamName || '')}
        </div>

        <style>
          p { margin: 0 0 18px 0; }
          ul { margin: 0 0 22px 20px; padding-left: 20px; list-style-type: disc; }
          li { margin-bottom: 10px; display: list-item; }
          img { max-width: 100%; height: auto; }
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

      <!-- TEAM SIGNATURE -->
      <div style="border-top:1px solid #eee; padding:28px 28px 24px; text-align:center;">
        <img src="cid:team-photo" width="170" alt="The FC Group team" style="width:170px; max-width:170px; height:auto; display:block; margin:0 auto; border:0; border-radius:12px;" />
        <div style="font-weight:700; font-size:18px; margin-top:14px; color:#0f2a44;">${teamName}</div>
        <div style="font-size:15px; color:#333; margin-top:6px;">${teamEmail}${
    teamPhone ? ` &nbsp;•&nbsp; ${teamPhone}` : ''
  }</div>
        <div style="font-size:14px; color:#555; margin-top:4px;">${brokerageName || ''}</div>
        ${
          brokerageLogoUrl
            ? `<img src="${brokerageLogoUrl}" width="130" alt="" style="width:130px; max-width:130px; height:auto; display:block; margin:12px auto 0; border:0;" />`
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

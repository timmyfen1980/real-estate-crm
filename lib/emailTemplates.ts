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
}: any) {
  return `
  <div style="font-family: Arial, sans-serif; color:#111;">

    <!-- HEADER -->
    <div style="background:#000; padding:20px 24px; display:flex; justify-content:space-between; align-items:center;">
      
      <!-- LEFT LOGO -->
      ${
        teamLogo
          ? `<div style="background:#fff; padding:8px; border-radius:6px;">
               <img src="${teamLogo}" style="height:40px;" />
             </div>`
          : ''
      }

      <!-- RIGHT LOGO -->
      ${
        brokerageLogo
          ? `<img src="${brokerageLogo}" style="height:40px;" />`
          : ''
      }
    </div>

    <!-- BODY -->
    <div style="padding:24px;">
      <p style="font-size:18px;">Hi ${firstName},</p>

      <div style="margin-top:20px;">
        ${content}
      </div>

      ${
        ctaLink && ctaText
          ? `<div style="margin-top:30px;">
               <a href="${ctaLink}" style="
                 background:#000;
                 color:#fff;
                 padding:12px 20px;
                 text-decoration:none;
                 border-radius:4px;
                 display:inline-block;
               ">
                 ${ctaText}
               </a>
             </div>`
          : ''
      }
    </div>

    <!-- AGENT SECTION -->
    <div style="border-top:1px solid #eee; padding:20px 24px; display:flex; justify-content:space-between; align-items:center;">
      
      <!-- LEFT: AGENT -->
      <div style="display:flex; align-items:center;">
        ${
          agentPhoto
            ? `<img src="${agentPhoto}" style="width:60px; height:60px; border-radius:50%; margin-right:12px;" />`
            : ''
        }

        <div>
          <div style="font-weight:700;">${agentName}</div>
          <div>${agentEmail}</div>
          <div>${agentPhone}</div>
          <div>${brokerageName}</div>
        </div>
      </div>

      <!-- RIGHT: BIG LOGO -->
      ${
        brokerageLogo
          ? `<img src="${brokerageLogo}" style="height:80px;" />`
          : ''
      }

    </div>

    <!-- FOOTER -->
    <div style="background:#f5f5f5; text-align:center; padding:16px; font-size:12px; color:#666;">
      <a href="${unsubscribeLink}" style="color:#666;">Unsubscribe</a>
    </div>

  </div>
  `
}
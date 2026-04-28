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
  <div style="background:#e5e7eb; padding:40px 0; font-family: Arial, sans-serif;">

    <!-- EMAIL CARD -->
    <div style="max-width:600px; margin:0 auto; background:#ffffff;">

      <!-- HEADER -->
      <div style="background:#000; padding:24px; display:flex; justify-content:space-between; align-items:center;">
        
        <!-- LEFT LOGO -->
        ${
          teamLogo
            ? `<div style="background:#fff; padding:10px 14px; border-radius:6px;">
                 <img src="${teamLogo}" style="height:50px; display:block;" />
               </div>`
            : ''
        }

      
      </div>

      <!-- BODY -->
      <div style="padding:32px 28px; font-size:16px; line-height:1.6; color:#111;">
        
        <p style="font-size:18px; margin-bottom:20px;">Hi ${firstName},</p>

        <div>
          ${content}
        </div>

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
        
        <!-- LEFT SIDE -->
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

        <!-- RIGHT SIDE BIG LOGO -->
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
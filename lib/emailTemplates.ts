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

    <div style="max-width:600px; margin:0 auto; background:#ffffff; position:relative;">

      <!-- BLACK HEADER -->
      <div style="
        background:#000;
        height:120px;
        position:relative;
        padding:0 28px;
        display:flex;
        align-items:center;
      ">
        
        ${
          teamLogo
            ? `<div style="background:#fff; padding:14px 18px; border-radius:8px;">
                 <img src="${teamLogo}" style="height:70px; display:block;" />
               </div>`
            : ''
        }

        ${
          emailHeaderImage
            ? `<img 
                  src="${emailHeaderImage}" 
                  style="
                    position:absolute;
                    right:28px;
                    top:10px;
                    height:180px;
                    width:auto;
                    display:block;
                  "
                />`
            : ''
        }

      </div> <!-- ✅ THIS WAS MISSING -->

      <!-- BODY -->
      <div style="padding:30px 28px 32px; font-size:16px; line-height:1.6; color:#111;">
        
        <p style="font-size:20px; margin-bottom:20px; font-weight:600;">Hi ${firstName},</p>

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
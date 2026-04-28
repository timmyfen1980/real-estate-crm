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
  height:180px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 32px;
">
  
  <!-- LOGO -->
  ${
    teamLogo
      ? `<div style="background:#fff; padding:16px 20px; border-radius:8px;">
           <img src="${teamLogo}" style="height:90px; display:block;" />
         </div>`
      : ''
  }

  <!-- TEAM IMAGE (LESS AGGRESSIVE CROP) -->
  ${
    emailHeaderImage
      ? `<div style="
            width:260px;
            height:180px;
            overflow:hidden;
            display:flex;
            align-items:flex-end;
          ">
            <img 
              src="${emailHeaderImage}" 
              style="
                width:100%;
                height:auto;
                display:block;
              "
            />
          </div>`
      : ''
  }

</div>

</div>
</div>
      <!-- BODY -->
      <div style="padding:60px 28px 32px; font-size:16px; line-height:1.6; color:#111;">
        
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
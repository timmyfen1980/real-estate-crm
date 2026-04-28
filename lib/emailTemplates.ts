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
}: {
  content: string
  firstName?: string
  agentName?: string
  agentEmail?: string
  agentPhone?: string
  agentPhoto?: string
  teamLogo?: string
  brokerageLogo?: string
  brokerageName?: string
  unsubscribeLink?: string
  ctaLink?: string
  ctaText?: string
}) {
  return `
  <div style="background:#f4f4f4;padding:20px;font-family:Arial;">
    <table width="600" align="center" style="background:#fff;border-radius:8px;overflow:hidden;">
      
      <tr>
        <td style="background:#000;padding:20px;text-align:center;">
          ${
            teamLogo
              ? `<img src="${teamLogo}" style="max-height:60px;" />`
              : `<span style="color:#fff;font-size:20px;">The FC Group</span>`
          }
        </td>
      </tr>

      <tr>
        <td style="padding:30px;">
          ${firstName ? `<p>Hi ${firstName},</p>` : ''}
          ${content}

          ${
            ctaLink
              ? `<div style="margin-top:20px;text-align:center;">
                  <a href="${ctaLink}" style="background:#000;color:#fff;padding:12px 20px;border-radius:5px;text-decoration:none;">
                    ${ctaText || 'Learn More'}
                  </a>
                </div>`
              : ''
          }
        </td>
      </tr>

      <tr>
        <td style="padding:20px;border-top:1px solid #eee;">
          <table>
            <tr>
              ${
                agentPhoto
                  ? `<td style="padding-right:15px;">
                      <img src="${agentPhoto}" width="70" style="border-radius:50%;" />
                    </td>`
                  : ''
              }
              <td>
                <strong>${agentName || ''}</strong><br/>
                ${agentEmail || ''}<br/>
                ${agentPhone || ''}<br/>
                ${brokerageName || ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="text-align:center;padding:20px;background:#f9f9f9;">
          ${brokerageLogo ? `<img src="${brokerageLogo}" style="max-height:40px;" />` : ''}

          ${
            unsubscribeLink
              ? `<p style="margin-top:10px;">
                  <a href="${unsubscribeLink}" style="color:#888;font-size:12px;">
                    Unsubscribe
                  </a>
                </p>`
              : ''
          }
        </td>
      </tr>

    </table>
  </div>
  `
}
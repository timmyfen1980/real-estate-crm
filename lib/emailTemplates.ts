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
}) {
  return `
  <div style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
      <tr>
        <td align="center">
          <table width="600" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            
            <!-- HEADER -->
            <tr>
              <td style="background:#000;padding:20px;text-align:center;">
                ${
                  teamLogo
                    ? `<img src="${teamLogo}" style="max-height:60px;" />`
                    : `<span style="color:#fff;font-size:20px;font-weight:bold;">The FC Group</span>`
                }
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:30px;color:#333;font-size:16px;line-height:1.6;">
                ${firstName ? `<p>Hi ${firstName},</p>` : ''}
                ${content}
              </td>
            </tr>

            <!-- SIGNATURE -->
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
                    <td style="font-size:14px;color:#333;">
                      <strong>${agentName || ''}</strong><br/>
                      ${agentEmail || ''}<br/>
                      ${agentPhone || ''}<br/>
                      ${brokerageName || ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="background:#f9f9f9;padding:20px;text-align:center;">
                ${
                  brokerageLogo
                    ? `<img src="${brokerageLogo}" style="max-height:40px;" />`
                    : ''
                }

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
        </td>
      </tr>
    </table>
  </div>
  `
}
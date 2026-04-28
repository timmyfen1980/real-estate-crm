export function buildEmailTemplate({
  content,
  firstName,
}: {
  content: string
  firstName?: string
}) {
  return `
  <div style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
      <tr>
        <td align="center">
          <table width="600" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            
            <!-- HEADER -->
            <tr>
              <td style="background:#000000;color:#ffffff;padding:20px;text-align:center;font-size:20px;font-weight:bold;">
                The FC Group
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:30px;color:#333333;font-size:16px;line-height:1.5;">
                ${firstName ? `<p>Hi ${firstName},</p>` : ''}

                ${content}
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="background:#f9f9f9;padding:20px;text-align:center;font-size:12px;color:#888;">
                The Fennessey Real Estate Group<br/>
                RE/MAX Hallmark First Group Realty
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
  `
}
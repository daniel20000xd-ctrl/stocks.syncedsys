import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface AlertEmailPayload {
  to: string
  ticker: string
  companyName?: string | null
  condition: string
  threshold: number
  currentPrice: number
  changePercent: number
  triggeredAt: Date
}

function conditionSentence(condition: string, threshold: number): string {
  switch (condition) {
    case 'price_above':      return `price rose above $${threshold}`
    case 'price_below':      return `price fell below $${threshold}`
    case 'change_pct_above': return `daily gain exceeded +${threshold}%`
    case 'change_pct_below': return `daily loss exceeded ${threshold}%`
    default:                 return `alert condition met`
  }
}

export async function sendAlertEmail(p: AlertEmailPayload): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping')
    return false
  }

  const isUp       = p.changePercent >= 0
  const changeClr  = isUp ? '#16a34a' : '#dc2626'
  const changeSign = isUp ? '▲ +' : '▼ '
  const label      = p.companyName ? `${p.companyName} (${p.ticker})` : p.ticker
  const subject    = `📈 ${p.ticker}: ${conditionSentence(p.condition, p.threshold)}`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="background:#fff;border-radius:14px;padding:36px;max-width:480px;margin:0 auto;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.08em;text-transform:uppercase">Stock Alert · Syncedsys</p>
    <h1 style="margin:0 0 2px;font-size:20px;font-weight:800;color:#111827">${label}</h1>
    <p style="margin:0 0 24px;font-size:34px;font-weight:800;color:#111827;font-variant-numeric:tabular-nums;letter-spacing:-.5px">$${p.currentPrice.toFixed(2)}</p>
    <p style="margin:0 0 24px;font-size:15px;font-weight:600;color:${changeClr}">${changeSign}${Math.abs(p.changePercent).toFixed(2)}% today</p>
    <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:28px">
      <p style="margin:0;font-size:14px;color:#78350f;line-height:1.5">
        <strong>Triggered:</strong> ${conditionSentence(p.condition, p.threshold)}
      </p>
    </div>
    <a href="https://stocks.syncedsys.com?ticker=${encodeURIComponent(p.ticker)}"
       style="display:inline-block;background:#111827;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">
      View ${p.ticker} on Syncedsys →
    </a>
    <p style="margin:28px 0 0;font-size:11px;color:#9ca3af">
      Triggered at ${p.triggeredAt.toUTCString()}
    </p>
  </div>
</body>
</html>`

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'alerts@syncedsys.com',
      to:   p.to,
      subject,
      html,
    })
    if (error) { console.error('[email] Resend error:', error); return false }
    return true
  } catch (err) {
    console.error('[email] send failed:', err)
    return false
  }
}

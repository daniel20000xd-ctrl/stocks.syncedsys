import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAlertEmail } from '@/lib/email'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Module-level crumb cache (reused within the same edge/serverless instance)
let _auth: { cookie: string; crumb: string } | null = null
let _authAt = 0

async function getYahooAuth() {
  if (_auth && Date.now() - _authAt < 55 * 60 * 1000) return _auth
  try {
    const r1 = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      redirect: 'manual',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setCookies: string[] = (r1.headers as any).getSetCookie?.()
      ?? (r1.headers.get('set-cookie') ? [r1.headers.get('set-cookie')!] : [])
    const cookie = setCookies.map((c: string) => c.split(';')[0]).filter(Boolean).join('; ')
    if (!cookie) return null

    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Accept': '*/*', 'Cookie': cookie },
    })
    const crumb = (await r2.text()).trim()
    if (!crumb || crumb.includes('<') || crumb.length > 40) return null

    _auth = { cookie, crumb }
    _authAt = Date.now()
    return _auth
  } catch { return null }
}

async function fetchQuote(
  ticker: string,
  auth: { cookie: string; crumb: string } | null,
): Promise<{ price: number; changePercent: number; companyName: string | null } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}${auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : ''}`
    const headers: Record<string, string> = { 'User-Agent': UA, 'Accept': 'application/json' }
    if (auth) headers.Cookie = auth.cookie
    const res = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    const q = data?.quoteResponse?.result?.[0]
    if (!q?.regularMarketPrice) return null
    return {
      price:         q.regularMarketPrice        as number,
      changePercent: (q.regularMarketChangePercent as number) ?? 0,
      companyName:   (q.shortName ?? q.longName ?? null) as string | null,
    }
  } catch { return null }
}

export async function GET(req: NextRequest) {
  // Vercel sends CRON_SECRET as Authorization: Bearer <secret>
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Trading-hours gate ────────────────────────────────────────────────────
  // NYSE pre-market opens 4am ET, post-market closes 8pm ET.
  // In UTC that's 08:00–00:00 (EDT, UTC-4) or 09:00–01:00 (EST, UTC-5).
  // Dead zone between those windows: 02:00–07:59 UTC is always outside any
  // market session regardless of DST, so we skip it. Weekends too.
  {
    const now = new Date()
    const day = now.getUTCDay()           // 0=Sun 6=Sat
    const h   = now.getUTCHours()
    if (day === 0 || day === 6) {
      return NextResponse.json({ skipped: 'weekend' })
    }
    if (h >= 2 && h < 8) {
      return NextResponse.json({ skipped: 'outside market hours' })
    }
  }

  const admin      = createAdminClient()
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'daniel20000xd@gmail.com'

  // All active alerts (admin client bypasses RLS)
  const { data: alerts, error } = await admin
    .from('stock_alerts')
    .select('*')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!alerts?.length) return NextResponse.json({ checked: 0, triggered: 0 })

  // Fetch Yahoo auth once, then prices for each unique ticker in parallel
  const auth     = await getYahooAuth()
  const tickers  = [...new Set(alerts.map(a => a.ticker as string))]
  const quotes   = new Map<string, { price: number; changePercent: number; companyName: string | null }>()

  await Promise.all(tickers.map(async t => {
    const q = await fetchQuote(t, auth)
    if (q) quotes.set(t, q)
  }))

  const now       = new Date()
  let   triggered = 0

  for (const alert of alerts) {
    const quote = quotes.get(alert.ticker as string)
    if (!quote) continue

    // Respect cooldown
    if (alert.last_triggered_at) {
      const elapsedMin = (now.getTime() - new Date(alert.last_triggered_at as string).getTime()) / 60_000
      if (elapsedMin < ((alert.cooldown_minutes as number) ?? 60)) continue
    }

    // Evaluate condition
    const t = alert.threshold as number
    let hit = false
    switch (alert.condition as string) {
      case 'price_above':      hit = quote.price         > t; break
      case 'price_below':      hit = quote.price         < t; break
      case 'change_pct_above': hit = quote.changePercent > t; break
      case 'change_pct_below': hit = quote.changePercent < t; break
    }
    if (!hit) continue

    const sent = await sendAlertEmail({
      to:           ADMIN_EMAIL,
      ticker:       alert.ticker as string,
      companyName:  quote.companyName,
      condition:    alert.condition as string,
      threshold:    t,
      currentPrice: quote.price,
      changePercent: quote.changePercent,
      triggeredAt:  now,
    })

    if (sent) {
      triggered++
      await admin
        .from('stock_alerts')
        .update({
          last_triggered_at: now.toISOString(),
          triggered_count:   ((alert.triggered_count as number) ?? 0) + 1,
        })
        .eq('id', alert.id as string)
    }
  }

  return NextResponse.json({ checked: alerts.length, triggered, tickers })
}

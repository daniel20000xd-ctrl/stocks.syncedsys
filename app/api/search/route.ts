import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ quotes: [] })

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0&enableFuzzyQuery=true&quotesQueryId=tss_match_phrase_query`
    const res = await fetch(url, { headers: YF_HEADERS, cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ quotes: [] })
    const data = await res.json()

    const quotes = ((data?.quotes ?? []) as Record<string, unknown>[])
      .filter((item) => item.quoteType === 'EQUITY' || item.quoteType === 'ETF')
      .slice(0, 6)
      .map((item) => ({
        symbol: item.symbol as string,
        name: ((item.shortname ?? item.longname ?? '') as string),
        exchange: (item.exchange as string | undefined) ?? '',
      }))

    return NextResponse.json({ quotes })
  } catch {
    return NextResponse.json({ quotes: [] })
  }
}

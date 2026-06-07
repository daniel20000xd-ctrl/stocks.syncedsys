import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchRankedNews, type NewsItem } from '@/lib/news'

// Lightweight live-news endpoint polled by the client while the page is being
// watched (tab visible + user active). Kept separate from /api/stocks so the
// heavy fundamentals stay on their 6h cache while news refreshes on the minute.

// Short in-memory cache so multiple tabs / rapid polls don't hammer Yahoo.
const cache = new Map<string, { at: number; news: NewsItem[] }>()
const TTL_MS = 30 * 1000

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker')?.toUpperCase().trim()
  const name   = searchParams.get('name')?.trim() || null
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })

  const hit = cache.get(ticker)
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ news: hit.news, cached: true })
  }

  const news = await fetchRankedNews(ticker, name)
  if (news.length) cache.set(ticker, { at: Date.now(), news })

  return NextResponse.json({ news, updatedAt: new Date().toISOString() })
}

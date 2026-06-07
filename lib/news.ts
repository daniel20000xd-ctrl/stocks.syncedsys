// Shared news fetching + ticker-relevance ranking, used by both /api/stocks
// (initial payload) and /api/news (the live poll while the page is being watched).
// The Yahoo v1/finance/search news endpoint needs no cookie/crumb auth.

const YF1 = 'https://query1.finance.yahoo.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface NewsItem {
  title: string
  source: string
  link: string
  publishedAt: string
  sentiment: 'positive' | 'negative' | 'neutral'
  imageUrl: string | null
}

const POSITIVE = /\b(rise[sd]?|gain[sed]?|beats?|rallies?|rally|surge[sd]?|upgrades?|positive|profit|record|soar[sed]?|jump[sed]?|climb[sed]?)\b/i
const NEGATIVE = /\b(fall[sn]?|fell|drop[sped]?|misses?|missed|slide[sd]?|plunge[sd]?|downgrade[sd]?|negative|loss|warn[sed]?|decline[sd]?|tumble[sd]?)\b/i
function sentiment(t: string): 'positive' | 'negative' | 'neutral' {
  return POSITIVE.test(t) ? 'positive' : NEGATIVE.test(t) ? 'negative' : 'neutral'
}

type RawNews = Record<string, unknown>

async function yfNews(url: string): Promise<RawNews[]> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Yahoo news ${res.status}`)
  const data = await res.json()
  return (data?.news ?? []) as RawNews[]
}

export async function fetchRankedNews(ticker: string, companyName: string | null, limit = 12): Promise<NewsItem[]> {
  const base = `${YF1}/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=20&quotesCount=0&enableFuzzyQuery=false`

  // news_cie_vespa returns genuinely ticker-focused stories rather than generic
  // market news that merely tags the ticker in relatedTickers. Fall back to the
  // plain search if it yields nothing.
  let rawNews: RawNews[] = []
  try { rawNews = await yfNews(`${base}&newsQueryId=news_cie_vespa`) } catch { /* fall through */ }
  if (!rawNews.length) {
    try { rawNews = await yfNews(base) } catch { return [] }
  }

  // Company-name root for title matching, e.g. "NVIDIA Corporation" → "nvidia"
  const nameRoot = (companyName ?? '')
    .toLowerCase()
    .replace(/[,.]/g, ' ')
    .replace(/\b(corp|corporation|inc|incorporated|co|company|ltd|limited|plc|holdings?|group|the|class\s+[a-c])\b/g, ' ')
    .trim()
    .split(/\s+/)[0] ?? ''
  const tk = ticker.toLowerCase()

  const score = (item: RawNews): number => {
    const title = ((item.title as string) ?? '').toLowerCase()
    const rel = (item.relatedTickers as string[]) ?? []
    let s = 0
    if (nameRoot.length >= 3 && title.includes(nameRoot)) s += 5
    if (title.includes(tk)) s += 4
    if (rel[0] === ticker) s += 3
    else if (rel.includes(ticker)) s += 2
    s -= Math.min(rel.length, 10) * 0.15  // fewer related tickers ⇒ more focused
    return s
  }

  return rawNews
    .map(item => ({ item, s: score(item) }))
    .sort((a, b) => b.s !== a.s
      ? b.s - a.s
      : ((b.item.providerPublishTime as number) ?? 0) - ((a.item.providerPublishTime as number) ?? 0))
    .slice(0, limit)
    .map(({ item }) => {
      const title = (item.title as string) ?? ''
      const thumbResolutions = (item.thumbnail as { resolutions?: { url: string; width: number }[] } | undefined)?.resolutions ?? []
      const imageUrl = thumbResolutions.find(r => r.width >= 140)?.url ?? thumbResolutions[0]?.url ?? null
      return {
        title,
        source: (item.publisher as string) ?? 'Unknown',
        link: (item.link as string) ?? '#',
        publishedAt: item.providerPublishTime ? new Date((item.providerPublishTime as number) * 1000).toISOString() : new Date().toISOString(),
        sentiment: sentiment(title),
        imageUrl,
      }
    })
}

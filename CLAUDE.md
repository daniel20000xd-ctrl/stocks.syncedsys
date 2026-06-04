# stocks-satellite

Standalone Next.js stock viewer. Single-purpose: authenticated users can look up any stock ticker and see price charts, technical indicators, fundamentals, financials, analyst consensus, insider transactions, and news.

## Stack

- **Framework:** Next.js 16 (App Router, React 19)
- **Auth:** Supabase SSR (`@supabase/ssr`) — same Supabase project as the hub (Syncedsys)
- **Charts:** `lightweight-charts` v4 — candlestick series, volume histogram, SMA line overlays
- **Indicators:** `technicalindicators` — RSI(14), MACD(12/26/9), Bollinger Bands(20,2), SMA(50), SMA(200)
- **Styling:** Tailwind CSS v4 via `@tailwindcss/postcss`

## File layout

```
app/
  page.tsx                  — auth guard → StockViewerWrapper
  StockViewerWrapper.tsx    — 'use client' shell for dynamic(ssr:false) import
  StockViewer.tsx           — full UI component (charts, all data sections)
  layout.tsx                — root layout with globals.css
  globals.css               — Tailwind import + body font
  login/page.tsx            — email+password + Google OAuth login
  api/
    stocks/route.ts         — main data endpoint (see API contract below)
    auth/callback/route.ts  — OAuth code exchange → redirect /
lib/
  supabase/
    client.ts               — browser client (createBrowserClient)
    server.ts               — server client (createServerClient + cookie adapter)
    admin.ts                — service-role client for stock_cache reads/writes
  avanza.ts                 — unofficial Avanza API wrapper for Swedish tickers
```

## Data flow

### `/api/stocks?ticker=AAPL&interval=1Y`

1. **Auth check** — rejects unauthenticated requests with 401.
2. **Cache lookup** — reads `stock_cache` table via admin client. If a row exists and is less than 6 hours old, returns it immediately.
3. **Yahoo Finance fetch** — three concurrent requests:
   - `v8/finance/chart` — 3 years of daily OHLCV (always 3y, so SMA200 has enough history)
   - `v10/finance/quoteSummary` batch 1 — price, summaryDetail, keyStatistics, financialData, assetProfile, calendarEvents, majorHoldersBreakdown
   - `v10/finance/quoteSummary` batch 2 — income statements, balance sheets, cash flows, earnings history, earnings trend, recommendation trend, upgrade/downgrade history, insider transactions
4. **Technical indicators** — computed server-side over the full 3y close series, then filtered to the requested interval for the chart. Current-value snapshot (last bar) shipped for RSI, MACD, BB.
5. **Avanza supplement** (Swedish `.ST` tickers only) — `lib/avanza.ts` queries Avanza's undocumented REST API. Returns `null` silently on any failure. When present, fills only fields Yahoo left `null` (Yahoo always wins).
6. **News** — `v1/finance/search` with `newsCount=10`, sentiment-tagged by keyword regex.
7. **Cache write** — upserts into `stock_cache` with current timestamp.
8. **Response** — `NextResponse.json(result)` — see shape below.

### Avanza (`lib/avanza.ts`)

- Hits `/_api/search/filtered-search` (POST) to resolve ticker → `orderBookId`
- Hits `/_api/market-guide/stock/{orderBookId}` (GET) for fundamentals
- Hard timeouts: 3500ms search, 4000ms guide
- Never throws — every code path returns `null` on any error
- Only called for tickers matching `/\.ST$/i`

## API contract

`GET /api/stocks?ticker=<TICKER>&interval=<1M|3M|6M|1Y>`

**Auth:** Supabase session cookie required. Returns `401` if absent.

**Response shape** (all optional numeric fields are `number | null`):

```ts
{
  ticker: string
  interval: string
  currentPrice: number
  change: number
  changePercent: number

  // Valuation
  marketCap, peRatio, dividendYield, high52w, low52w, eps
  forwardEps, priceToBook, enterpriseValue, enterpriseToRevenue, enterpriseToEbitda
  beta, shortRatio, payoutRatio, bookValue
  heldPercentInsiders, heldPercentInstitutions   // stored as 0–1 ratio

  // Analyst targets
  targetMeanPrice, targetHighPrice, targetLowPrice, numberOfAnalysts
  recommendationKey: string | null
  recommendationMean

  // Margins / returns (stored as 0–1 ratio)
  revenueGrowth, earningsGrowth, grossMargins, operatingMargins
  profitMargins, returnOnEquity, returnOnAssets

  // Balance
  debtToEquity, currentRatio, quickRatio
  totalCash, totalDebt, freeCashflow, operatingCashflow
  totalRevenue, grossProfits, ebitda

  // Profile
  description: string | null
  sector, industry, country, website: string | null
  employees: number | null
  nextEarningsDate: string | null   // ISO date

  // Chart / TA
  ohlcv: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>
  sma50:  Array<{ time: string; value: number }>
  sma200: Array<{ time: string; value: number }>
  indicators: {
    rsi, macd, macdSignal, macdHistogram
    bbUpper, bbMiddle, bbLower, bbWidth
  }

  // Financial statements (arrays, annual or quarterly)
  incomeAnnual, incomeQuarterly    // { date, totalRevenue, grossProfit, ebit, netIncome, ebitda, totalOperatingExpenses }
  balanceAnnual                    // { date, totalAssets, totalLiab, equity, cash, shortDebt, longDebt }
  cashflowAnnual                   // { date, operatingCF, capex, freeCF, investingCF, financingCF }

  // Earnings
  earningsHistory   // { date, epsActual, epsEstimate, surprisePct }
  earningsTrend     // { period, endDate, epsEst, revEst, numAnalysts }

  // Analyst
  recommendationTrend       // { period, strongBuy, buy, hold, sell, strongSell }
  upgradeDowngradeHistory   // { date, firm, toGrade, fromGrade, action }  — last 15

  // Insiders
  insiderTransactions   // { date, name, shares, value, description }  — last 15

  // News
  news: Array<{ title, source, link, publishedAt: string (ISO), sentiment: 'positive'|'negative'|'neutral' }>

  // Nordic supplement (null for non-.ST tickers)
  avanza: AvanzaData | null
}
```

**Error responses:**
- `400` — missing ticker or invalid interval
- `401` — not authenticated
- `404` — ticker not found on Yahoo Finance
- `500` — upstream fetch failed

## Database

Uses the shared `stock_cache` table in the Syncedsys Supabase project. **Do not recreate it.**

```sql
create table stock_cache (
  ticker      text not null,
  interval    text not null,
  data        jsonb not null,
  fetched_at  timestamptz not null default now(),
  primary key (ticker, interval)
);
```

Cache TTL is 6 hours, enforced in `route.ts`. Cache is shared across all users.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL        — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   — public anon key
SUPABASE_SERVICE_ROLE_KEY       — service role key (required for stock_cache)
```

## Running locally

```
npm install
npm run dev     # http://localhost:3000
```

No additional setup — Yahoo Finance and Avanza are public APIs with no keys required.

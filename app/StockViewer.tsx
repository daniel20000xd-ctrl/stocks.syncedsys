'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createChart, ColorType } from 'lightweight-charts'
import type { IChartApi } from 'lightweight-charts'
import {
  Search, TrendingUp, TrendingDown, BarChart2,
  BookOpen, Newspaper, RefreshCw, ExternalLink,
  Bell, BellOff, Trash2,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export type Interval = '1M' | '3M' | '6M' | '1Y'

interface OHLCVBar {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type Num = number | null
type Pct = number | null

interface IncomeRow  { date: string; totalRevenue: Num; grossProfit: Num; ebit: Num; netIncome: Num; ebitda: Num; totalOperatingExpenses: Num }
interface BalanceRow { date: string; totalAssets: Num; totalLiab: Num; equity: Num; cash: Num; shortDebt: Num; longDebt: Num }
interface CashRow    { date: string; operatingCF: Num; capex: Num; freeCF: Num; investingCF: Num; financingCF: Num }
interface EarningsRow { date: string; epsActual: Num; epsEstimate: Num; surprisePct: Num }
interface EstimateRow { period: string; endDate: string; epsEst: Num; revEst: Num; numAnalysts: Num }
interface RecRow      { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }
interface UpgradeRow  { date: string; firm: string; toGrade: string; fromGrade: string; action: string }
interface InsiderRow  { date: string; name: string; shares: Num; value: Num; description: string }
interface AvanzaData {
  orderBookId: string; name: string | null; marketList: string | null; currency: string | null
  peRatio: Num; psRatio: Num; pbRatio: Num; evEbit: Num
  directYield: Num; beta: Num; volatility: Num
  returnOnEquity: Num; returnOnAssets: Num; returnOnCapitalEmployed: Num; equityRatio: Num
  grossMargin: Num; operatingMargin: Num; netMargin: Num
  marketCap: Num; eps: Num; equityPerShare: Num; operatingCashFlow: Num
  numberOfOwners: Num; shortSellingRatio: Num
  dividendAmount: Num; dividendExDate: string | null; dividendsPerYear: Num
  nextReportDate: string | null; nextReportType: string | null; previousReportDate: string | null
}

interface StockData {
  ticker: string; interval: string
  currentPrice: number; change: number; changePercent: number; periodChange: number; periodChangePercent: number
  marketState: string | null
  preMarketPrice: Num; preMarketChange: Num; preMarketChangePercent: Num
  postMarketPrice: Num; postMarketChange: Num; postMarketChangePercent: Num
  marketCap: Num; peRatio: Num; dividendYield: Pct; high52w: Num; low52w: Num; eps: Num
  forwardEps: Num; priceToBook: Num; enterpriseValue: Num; enterpriseToRevenue: Num
  enterpriseToEbitda: Num; beta: Num; shortRatio: Num; payoutRatio: Pct
  bookValue: Num; heldPercentInsiders: Pct; heldPercentInstitutions: Pct
  targetMeanPrice: Num; targetHighPrice: Num; targetLowPrice: Num; numberOfAnalysts: Num
  recommendationKey: string | null; recommendationMean: Num
  revenueGrowth: Pct; earningsGrowth: Pct; grossMargins: Pct; operatingMargins: Pct
  profitMargins: Pct; returnOnEquity: Pct; returnOnAssets: Pct
  debtToEquity: Num; currentRatio: Num; quickRatio: Num
  totalCash: Num; totalDebt: Num; freeCashflow: Num; operatingCashflow: Num
  totalRevenue: Num; grossProfits: Num; ebitda: Num
  companyName: string | null
  description: string | null; sector: string | null; industry: string | null
  employees: Num; website: string | null; country: string | null
  nextEarningsDate: string | null
  ohlcv: OHLCVBar[]
  sma50: { time: string; value: number }[]
  sma200: { time: string; value: number }[]
  indicators: { rsi: Num; macd: Num; macdSignal: Num; macdHistogram: Num; bbUpper: Num; bbMiddle: Num; bbLower: Num; bbWidth: Num; stochK: Num; stochD: Num; atr: Num; williamsR: Num; cci: Num; roc: Num }
  incomeAnnual: IncomeRow[]; incomeQuarterly: IncomeRow[]
  balanceAnnual: BalanceRow[]; cashflowAnnual: CashRow[]
  earningsHistory: EarningsRow[]; earningsTrend: EstimateRow[]
  recommendationTrend: RecRow[]; upgradeDowngradeHistory: UpgradeRow[]
  insiderTransactions: InsiderRow[]
  avanza: AvanzaData | null
  news: Array<{ title: string; source: string; link: string; publishedAt: string; sentiment: 'positive' | 'negative' | 'neutral' | null; imageUrl: string | null }>
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCap(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toLocaleString()}`
}

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}
function fmtNum(n: Num, dp = 2, prefix = ''): string {
  return n == null ? '—' : `${prefix}${n.toFixed(dp)}`
}
function fmtPct(n: Pct, stored01 = true): string {
  return n == null ? '—' : `${(stored01 ? n * 100 : n).toFixed(1)}%`
}
function fmtB(n: Num): string {
  if (n == null) return '—'
  const a = Math.abs(n)
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`
  if (a >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">{icon}{title}</h2>
      {children}
    </div>
  )
}
function Grid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map(({ label, value }) => (
        <div key={label} className="border border-gray-100 rounded-lg px-3 py-2.5">
          <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
          <p className="text-sm font-bold text-gray-800">{value}</p>
        </div>
      ))}
    </div>
  )
}
function TableSection({ cols, rows }: { cols: string[]; rows: (string | null)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            {cols.map(c => <th key={c} className="text-left text-gray-400 font-medium pb-1.5 pr-4 whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-1.5 pr-4 text-gray-700 whitespace-nowrap font-mono tabular-nums">{cell ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-bold text-gray-800">{value}</p>
    </div>
  )
}

// ── Stock Alerts (admin-only inline panel) ────────────────────────────────────

interface AlertItem {
  id: string
  ticker: string
  condition: 'price_above' | 'price_below' | 'change_pct_above' | 'change_pct_below'
  threshold: number
  is_active: boolean
  last_triggered_at: string | null
  triggered_count: number
  cooldown_minutes: number
  created_at: string
}

const CONDITION_LABELS: Record<string, string> = {
  price_above:      'Price above',
  price_below:      'Price below',
  change_pct_above: 'Daily gain >',
  change_pct_below: 'Daily loss <',
}

function conditionDisplay(a: AlertItem): string {
  const prefix = CONDITION_LABELS[a.condition] ?? a.condition
  const isPct  = a.condition.startsWith('change')
  return `${prefix} ${isPct ? '' : '$'}${a.threshold}${isPct ? '%' : ''}`
}

function isHitNow(a: AlertItem, price: number, changePct: number): boolean {
  const t = a.threshold
  switch (a.condition) {
    case 'price_above':      return price    > t
    case 'price_below':      return price    < t
    case 'change_pct_above': return changePct > t
    case 'change_pct_below': return changePct < t
    default:                 return false
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function StockAlerts({ ticker, currentPrice, changePercent }: { ticker: string; currentPrice: number; changePercent: number }) {
  const [alerts, setAlerts]         = useState<AlertItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [condition, setCondition]   = useState('price_above')
  const [threshold, setThreshold]   = useState('')
  const [cooldown, setCooldown]     = useState('60')
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/alerts?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setAlerts(d.alerts ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticker])

  async function addAlert() {
    const val = parseFloat(threshold)
    if (isNaN(val)) return
    setSaving(true)
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, condition, threshold: val, cooldown_minutes: parseInt(cooldown) }),
      })
      if (res.ok) {
        const { alert } = await res.json()
        setAlerts(prev => [alert, ...prev])
        setThreshold('')
      }
    } finally {
      setSaving(false)
    }
  }

  async function toggleAlert(id: string, current: boolean) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_active: !current } : a))
    await fetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    })
  }

  async function deleteAlert(id: string) {
    setDeleting(id)
    setAlerts(prev => prev.filter(a => a.id !== id))
    await fetch(`/api/alerts/${id}`, { method: 'DELETE' })
    setDeleting(null)
  }

  const isPct        = condition.startsWith('change')
  const placeholder  = isPct
    ? (changePercent >= 0 ? `+${changePercent.toFixed(2)}` : changePercent.toFixed(2))
    : currentPrice.toFixed(2)

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
          <Bell size={14} className="text-amber-500" />
          Alerts — <span className="font-mono">{ticker}</span>
        </h2>
        {loading && <span className="text-[10px] text-gray-400 animate-pulse">loading…</span>}
      </div>

      {/* Alert list */}
      {!loading && alerts.length === 0 && (
        <p className="text-xs text-gray-400 mb-3">No alerts set. Add one below.</p>
      )}
      {alerts.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {alerts.map(a => {
            const hit = isHitNow(a, currentPrice, changePercent)
            return (
              <div
                key={a.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
                  hit && a.is_active
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-gray-50 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => toggleAlert(a.id, a.is_active)}
                    className={`shrink-0 transition-colors ${a.is_active ? 'text-green-500 hover:text-gray-400' : 'text-gray-300 hover:text-green-500'}`}
                    title={a.is_active ? 'Disable alert' : 'Enable alert'}
                  >
                    {a.is_active ? <Bell size={13} /> : <BellOff size={13} />}
                  </button>
                  <span className={`text-xs font-semibold font-mono ${a.is_active ? 'text-gray-800' : 'text-gray-400'}`}>
                    {conditionDisplay(a)}
                  </span>
                  {hit && a.is_active && (
                    <span className="text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded uppercase tracking-wide">
                      live
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.last_triggered_at && (
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      {a.triggered_count}× · {timeAgo(a.last_triggered_at)}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-300">{a.cooldown_minutes}m</span>
                  <button
                    onClick={() => deleteAlert(a.id)}
                    disabled={deleting === a.id}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    title="Delete alert"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add form */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={condition}
          onChange={e => setCondition(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
        >
          <option value="price_above">Price above</option>
          <option value="price_below">Price below</option>
          <option value="change_pct_above">Daily gain &gt;</option>
          <option value="change_pct_below">Daily loss &lt;</option>
        </select>

        <div className="relative">
          {!isPct && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">$</span>
          )}
          <input
            type="number"
            step="any"
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addAlert()}
            placeholder={placeholder}
            className="text-xs border border-gray-200 rounded-lg py-2 w-28 focus:outline-none focus:border-blue-400 tabular-nums"
            style={{ paddingLeft: isPct ? '10px' : '20px', paddingRight: isPct ? '20px' : '10px' }}
          />
          {isPct && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
          )}
        </div>

        <div className="relative">
          <input
            type="number"
            step="1"
            min="5"
            value={cooldown}
            onChange={e => setCooldown(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg py-2 w-16 text-center focus:outline-none focus:border-blue-400 tabular-nums"
            title="Cooldown minutes (min gap between repeat alerts)"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">m</span>
        </div>

        <button
          onClick={addAlert}
          disabled={saving || !threshold}
          className="text-xs bg-gray-900 text-white px-3.5 py-2 rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {saving ? '…' : 'Add alert'}
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Checked every 15 min. Cooldown = min wait between repeat emails.
        {isPct && <span> Use negative values for loss alerts (e.g. −5 = down 5%).</span>}
      </p>
    </div>
  )
}

// ── Context builder (for Claude via postMessage) ──────────────────────────────

function buildViewerContext(d: StockData): string {
  const N = (n: number | null, dp = 2) => n == null ? 'N/A' : n.toFixed(dp)
  const B = (n: number | null): string => {
    if (n == null) return 'N/A'
    const a = Math.abs(n)
    if (a >= 1e12) return `$${(n / 1e12).toFixed(3)}T`
    if (a >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
    if (a >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`
    if (a >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`
    return `$${n.toFixed(2)}`
  }
  const P = (n: number | null, mul = true) => n == null ? 'N/A' : `${(mul ? n * 100 : n).toFixed(2)}%`
  const V = (v: number) => v >= 1e9 ? `${(v/1e9).toFixed(2)}B` : v >= 1e6 ? `${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(v)
  const S = (n: number) => n >= 0 ? `+${n}` : String(n)
  const lines: string[] = []
  const h = (t: string) => { lines.push(''); lines.push(t); lines.push('─'.repeat(t.length)) }

  lines.push(`=== STOCK VIEWER: ${d.companyName ? `${d.companyName} (${d.ticker})` : d.ticker} (${d.interval}) ===`)
  lines.push(`Updated: ${new Date().toUTCString()}`)

  h('CURRENT PRICE')
  lines.push(`  ${d.ticker}  $${d.currentPrice.toFixed(2)}  (${S(d.change)} / ${S(d.changePercent)}% — 1 day)`)
  lines.push(`  Period change (${d.interval}): ${S(d.periodChangePercent)}%`)
  if (d.marketState) lines.push(`  Market state: ${d.marketState}`)
  if ((d.marketState === 'PRE' || d.marketState === 'PREPRE') && d.preMarketPrice != null)
    lines.push(`  Pre-market: $${d.preMarketPrice.toFixed(2)}  (${d.preMarketChange != null ? S(d.preMarketChange) : '?'} / ${d.preMarketChangePercent != null ? S(d.preMarketChangePercent) + '%' : '?'})`)
  if ((d.marketState === 'POST' || d.marketState === 'POSTPOST' || d.marketState === 'CLOSED') && d.postMarketPrice != null)
    lines.push(`  After hours: $${d.postMarketPrice.toFixed(2)}  (${d.postMarketChange != null ? S(d.postMarketChange) : '?'} / ${d.postMarketChangePercent != null ? S(d.postMarketChangePercent) + '%' : '?'})`)
  if (d.sector)  lines.push(`  Sector: ${d.sector}  |  Industry: ${d.industry ?? 'N/A'}`)
  if (d.country) lines.push(`  Country: ${d.country}${d.employees ? `  |  Employees: ${d.employees.toLocaleString()}` : ''}`)
  if (d.website) lines.push(`  Website: ${d.website}`)

  if (d.description) {
    h('COMPANY OVERVIEW')
    const words = d.description.split(' ')
    let line = '  '
    for (const w of words) {
      if ((line + w).length > 100) { lines.push(line); line = '  ' + w + ' ' }
      else line += w + ' '
    }
    if (line.trim()) lines.push(line)
  }

  h('VALUATION & FUNDAMENTALS')
  lines.push(`  Market Cap:              ${B(d.marketCap)}`)
  lines.push(`  Enterprise Value:        ${B(d.enterpriseValue)}`)
  lines.push(`  Trailing P/E:            ${N(d.peRatio, 1)}×`)
  lines.push(`  Forward P/E:             ${d.forwardEps && d.currentPrice ? N(d.currentPrice / d.forwardEps, 1) + '×' : 'N/A'}`)
  lines.push(`  Price/Book:              ${N(d.priceToBook, 2)}×`)
  lines.push(`  EV/Revenue:              ${N(d.enterpriseToRevenue, 2)}×`)
  lines.push(`  EV/EBITDA:               ${N(d.enterpriseToEbitda, 2)}×`)
  lines.push(`  Trailing EPS:            ${d.eps != null ? `$${d.eps}` : 'N/A'}`)
  lines.push(`  Forward EPS:             ${d.forwardEps != null ? `$${d.forwardEps}` : 'N/A'}`)
  lines.push(`  Dividend Yield:          ${P(d.dividendYield)}`)
  lines.push(`  Beta:                    ${N(d.beta, 2)}`)
  lines.push(`  Short Ratio:             ${N(d.shortRatio, 2)}`)
  lines.push(`  Payout Ratio:            ${P(d.payoutRatio)}`)
  lines.push(`  Insider Ownership:       ${P(d.heldPercentInsiders)}`)
  lines.push(`  Institutional Own.:      ${P(d.heldPercentInstitutions)}`)
  lines.push(`  52-Week High:            ${d.high52w != null ? `$${d.high52w.toFixed(2)}` : 'N/A'}`)
  lines.push(`  52-Week Low:             ${d.low52w  != null ? `$${d.low52w.toFixed(2)}`  : 'N/A'}`)
  if (d.nextEarningsDate) lines.push(`  Next Earnings Date:      ${d.nextEarningsDate}`)

  if (d.targetMeanPrice || d.recommendationKey) {
    h('ANALYST CONSENSUS')
    lines.push(`  Recommendation:          ${(d.recommendationKey ?? 'N/A').toUpperCase()}`)
    lines.push(`  # of Analysts:           ${d.numberOfAnalysts ?? 'N/A'}`)
    lines.push(`  Target Price (mean):     ${d.targetMeanPrice != null ? `$${d.targetMeanPrice.toFixed(2)}` : 'N/A'}`)
    lines.push(`  Target Price (high):     ${d.targetHighPrice != null ? `$${d.targetHighPrice.toFixed(2)}` : 'N/A'}`)
    lines.push(`  Target Price (low):      ${d.targetLowPrice  != null ? `$${d.targetLowPrice.toFixed(2)}`  : 'N/A'}`)
    if (d.targetMeanPrice && d.currentPrice) {
      lines.push(`  Implied Upside (mean):   ${((d.targetMeanPrice - d.currentPrice) / d.currentPrice * 100).toFixed(1)}%`)
    }
  }

  h('PROFITABILITY & MARGINS')
  lines.push(`  Gross Margin:            ${P(d.grossMargins)}`)
  lines.push(`  Operating Margin:        ${P(d.operatingMargins)}`)
  lines.push(`  Profit Margin:           ${P(d.profitMargins)}`)
  lines.push(`  Return on Equity (ROE):  ${P(d.returnOnEquity)}`)
  lines.push(`  Return on Assets (ROA):  ${P(d.returnOnAssets)}`)
  lines.push(`  Revenue Growth (YoY):    ${P(d.revenueGrowth)}`)
  lines.push(`  Earnings Growth (YoY):   ${P(d.earningsGrowth)}`)

  h('FINANCIAL HEALTH')
  lines.push(`  Total Revenue:           ${B(d.totalRevenue)}`)
  lines.push(`  EBITDA:                  ${B(d.ebitda)}`)
  lines.push(`  Total Cash:              ${B(d.totalCash)}`)
  lines.push(`  Total Debt:              ${B(d.totalDebt)}`)
  lines.push(`  Operating Cash Flow:     ${B(d.operatingCashflow)}`)
  lines.push(`  Free Cash Flow:          ${B(d.freeCashflow)}`)
  lines.push(`  Gross Profit:            ${B(d.grossProfits)}`)
  lines.push(`  Debt/Equity:             ${N(d.debtToEquity, 2)}`)
  lines.push(`  Current Ratio:           ${N(d.currentRatio, 2)}`)
  lines.push(`  Quick Ratio:             ${N(d.quickRatio, 2)}`)
  lines.push(`  Book Value/Share:        ${d.bookValue != null ? `$${d.bookValue}` : 'N/A'}`)

  h('TECHNICAL INDICATORS')
  const ind = d.indicators
  if (ind.rsi != null) {
    const lbl = ind.rsi > 70 ? 'OVERBOUGHT' : ind.rsi < 30 ? 'OVERSOLD' : 'neutral'
    lines.push(`  RSI(14):             ${ind.rsi}  [${lbl}]`)
  }
  if (ind.macd != null) {
    lines.push(`  MACD(12/26/9):       ${S(ind.macd)}`)
    lines.push(`  MACD Signal:         ${ind.macdSignal != null ? S(ind.macdSignal) : 'N/A'}`)
    lines.push(`  MACD Histogram:      ${ind.macdHistogram != null ? S(ind.macdHistogram) : 'N/A'}`)
  }
  if (ind.bbUpper != null) {
    lines.push(`  Bollinger Upper(20): $${ind.bbUpper.toFixed(2)}`)
    lines.push(`  Bollinger Lower:     ${ind.bbLower != null ? `$${ind.bbLower.toFixed(2)}` : 'N/A'}`)
    lines.push(`  BB Width:            ${ind.bbWidth != null ? `${ind.bbWidth.toFixed(2)}%` : 'N/A'}`)
  }
  if (d.sma50.length)  lines.push(`  SMA50 (latest):      $${d.sma50[d.sma50.length-1].value.toFixed(2)}`)
  if (d.sma200.length) lines.push(`  SMA200 (latest):     $${d.sma200[d.sma200.length-1].value.toFixed(2)}`)
  if (ind.stochK != null) {
    const lbl = ind.stochK > 80 ? 'OVERBOUGHT' : ind.stochK < 20 ? 'OVERSOLD' : 'neutral'
    lines.push(`  Stochastic %K(14,3): ${ind.stochK}${ind.stochD != null ? `  %D: ${ind.stochD}` : ''}  [${lbl}]`)
  }
  if (ind.williamsR != null) {
    const lbl = ind.williamsR > -20 ? 'OVERBOUGHT' : ind.williamsR < -80 ? 'OVERSOLD' : 'neutral'
    lines.push(`  Williams %R(14):     ${ind.williamsR}  [${lbl}]`)
  }
  if (ind.cci != null) {
    const lbl = ind.cci > 100 ? 'OVERBOUGHT' : ind.cci < -100 ? 'OVERSOLD' : 'neutral'
    lines.push(`  CCI(20):             ${ind.cci}  [${lbl}]`)
  }
  if (ind.atr != null) lines.push(`  ATR(14):             $${ind.atr.toFixed(2)}  (avg true range)`)
  if (ind.roc != null) lines.push(`  ROC(14):             ${S(ind.roc)}%`)

  if (d.recommendationTrend.length) {
    h('ANALYST RECOMMENDATION TREND')
    lines.push('  Period   StrongBuy  Buy  Hold  Sell  StrongSell')
    for (const r of d.recommendationTrend)
      lines.push(`  ${r.period.padEnd(8)} ${String(r.strongBuy).padStart(9)} ${String(r.buy).padStart(4)} ${String(r.hold).padStart(5)} ${String(r.sell).padStart(5)} ${String(r.strongSell).padStart(10)}`)
  }

  if (d.upgradeDowngradeHistory.length) {
    h('RECENT ANALYST ACTIONS (upgrades / downgrades)')
    for (const u of d.upgradeDowngradeHistory)
      lines.push(`  ${(u.date || 'N/A').padEnd(12)} ${u.firm.padEnd(26)} ${u.action.padEnd(11)} ${u.fromGrade || '—'} → ${u.toGrade}`)
  }

  if (d.earningsTrend.length) {
    h('FORWARD ESTIMATES')
    lines.push('  Period   End Date     EPS Est.   Revenue Est.   # Analysts')
    for (const t of d.earningsTrend) {
      const eps = t.epsEst != null ? `$${t.epsEst.toFixed(2)}` : 'N/A'
      const rev = t.revEst != null ? B(t.revEst) : 'N/A'
      lines.push(`  ${(t.period || '').padEnd(8)} ${(t.endDate || '').padEnd(12)} ${eps.padStart(9)}  ${rev.padStart(13)}  ${(t.numAnalysts != null ? String(t.numAnalysts) : 'N/A').padStart(10)}`)
    }
  }

  if (d.earningsHistory.length) {
    h('EARNINGS HISTORY (EPS actual vs estimate)')
    lines.push('  Quarter      Actual   Estimate  Surprise')
    for (const e of d.earningsHistory) {
      const act  = e.epsActual   != null ? `$${e.epsActual.toFixed(2)}`   : 'N/A'
      const est  = e.epsEstimate != null ? `$${e.epsEstimate.toFixed(2)}` : 'N/A'
      const surp = e.surprisePct != null ? `${(e.surprisePct * 100).toFixed(1)}%` : 'N/A'
      lines.push(`  ${e.date.padEnd(12)} ${act.padStart(7)}  ${est.padStart(8)}  ${surp.padStart(8)}`)
    }
  }

  if (d.incomeAnnual.length) {
    h('ANNUAL INCOME STATEMENTS')
    lines.push('  Fiscal Year   Revenue        Gross Profit    EBIT           Net Income     EBITDA')
    for (const s of d.incomeAnnual)
      lines.push(`  ${s.date.padEnd(13)} ${B(s.totalRevenue).padStart(14)} ${B(s.grossProfit).padStart(15)} ${B(s.ebit).padStart(14)} ${B(s.netIncome).padStart(14)} ${B(s.ebitda).padStart(14)}`)
  }

  if (d.incomeQuarterly.length) {
    h('QUARTERLY INCOME STATEMENTS (recent)')
    lines.push('  Quarter       Revenue        Gross Profit    Net Income')
    for (const s of d.incomeQuarterly)
      lines.push(`  ${s.date.padEnd(13)} ${B(s.totalRevenue).padStart(14)} ${B(s.grossProfit).padStart(15)} ${B(s.netIncome).padStart(14)}`)
  }

  if (d.balanceAnnual.length) {
    h('ANNUAL BALANCE SHEETS')
    lines.push('  Fiscal Year   Total Assets   Total Liab     Equity         Cash           Long-Term Debt')
    for (const s of d.balanceAnnual)
      lines.push(`  ${s.date.padEnd(13)} ${B(s.totalAssets).padStart(14)} ${B(s.totalLiab).padStart(14)} ${B(s.equity).padStart(14)} ${B(s.cash).padStart(14)} ${B(s.longDebt).padStart(14)}`)
  }

  if (d.cashflowAnnual.length) {
    h('ANNUAL CASH FLOW STATEMENTS')
    lines.push('  Fiscal Year   Operating CF   CapEx          Free CF        Investing CF   Financing CF')
    for (const s of d.cashflowAnnual)
      lines.push(`  ${s.date.padEnd(13)} ${B(s.operatingCF).padStart(14)} ${B(s.capex).padStart(14)} ${B(s.freeCF).padStart(14)} ${B(s.investingCF).padStart(14)} ${B(s.financingCF).padStart(14)}`)
  }

  if (d.insiderTransactions.length) {
    h('RECENT INSIDER TRANSACTIONS (last 15)')
    for (const t of d.insiderTransactions) {
      const shares = t.shares != null ? `${t.shares.toLocaleString()} shares` : ''
      const val    = t.value  != null ? ` (${B(t.value)})` : ''
      const desc   = t.description ? ` — ${t.description}` : ''
      lines.push(`  ${t.date}  ${t.name.padEnd(30)} ${shares}${val}${desc}`)
    }
  }

  if (d.avanza) {
    const a = d.avanza
    h('NORDIC DATA — AVANZA (in SEK)')
    if (a.marketList) lines.push(`  Market List:             ${a.marketList}`)
    lines.push(`  P/E: ${N(a.peRatio, 2)}  P/S: ${N(a.psRatio, 2)}  P/B: ${N(a.pbRatio, 2)}  EV/EBIT: ${N(a.evEbit, 2)}`)
    lines.push(`  Direct Yield: ${P(a.directYield)}  ROE: ${P(a.returnOnEquity)}  ROA: ${P(a.returnOnAssets)}  ROCE: ${P(a.returnOnCapitalEmployed)}`)
    lines.push(`  Gross Margin: ${P(a.grossMargin)}  Operating: ${P(a.operatingMargin)}  Net: ${P(a.netMargin)}  Equity Ratio: ${P(a.equityRatio)}`)
    lines.push(`  Beta: ${N(a.beta, 2)}  Volatility: ${P(a.volatility)}  Short Selling Ratio: ${P(a.shortSellingRatio)}`)
    lines.push(`  Market Cap: ${a.marketCap != null ? `${(a.marketCap/1e9).toFixed(2)}B SEK` : 'N/A'}  EPS: ${a.eps != null ? `${a.eps} SEK` : 'N/A'}  Equity/Share: ${a.equityPerShare != null ? `${a.equityPerShare} SEK` : 'N/A'}`)
    if (a.numberOfOwners != null) lines.push(`  Owners (Avanza): ${a.numberOfOwners.toLocaleString()}`)
    if (a.dividendAmount != null) lines.push(`  Dividend: ${a.dividendAmount} SEK${a.dividendsPerYear ? ` ×${a.dividendsPerYear}/yr` : ''}${a.dividendExDate ? ` (ex-date ${a.dividendExDate})` : ''}`)
    if (a.nextReportDate) lines.push(`  Next Report: ${a.nextReportDate}${a.nextReportType ? ` (${a.nextReportType})` : ''}`)
    if (a.previousReportDate) lines.push(`  Previous Report: ${a.previousReportDate}`)
  }

  h(`PRICE HISTORY — ${d.ohlcv.length} bars (${d.ohlcv[0]?.time ?? ''} → ${d.ohlcv[d.ohlcv.length-1]?.time ?? ''})`)
  lines.push('  Date          Open       High       Low        Close      Volume')
  for (const b of d.ohlcv)
    lines.push(`  ${b.time}  ${b.open.toFixed(2).padStart(9)}  ${b.high.toFixed(2).padStart(9)}  ${b.low.toFixed(2).padStart(9)}  ${b.close.toFixed(2).padStart(9)}  ${V(b.volume).padStart(8)}`)

  if (d.news.length) {
    h(`NEWS (${d.news.length} latest)`)
    d.news.forEach((item, i) => {
      const sTag = item.sentiment === 'positive' ? '▲ POSITIVE' : item.sentiment === 'negative' ? '▼ NEGATIVE' : '● neutral'
      lines.push(`  ${i+1}. [${sTag}] ${item.title}`)
      lines.push(`     ${item.source}  |  ${item.publishedAt}`)
    })
  }

  return lines.join('\n')
}

// ── Candlestick aggregation ───────────────────────────────────────────────────

type CandleRes = '1D' | '1W' | '1M'

function aggregateBars(bars: OHLCVBar[], res: CandleRes): OHLCVBar[] {
  if (res === '1D') return bars
  const groups = new Map<string, OHLCVBar[]>()
  for (const bar of bars) {
    const d = new Date(bar.time + 'T00:00:00Z')
    let key: string
    if (res === '1W') {
      const dow = d.getUTCDay()
      const monday = new Date(d)
      monday.setUTCDate(d.getUTCDate() - ((dow + 6) % 7))
      key = monday.toISOString().slice(0, 10)
    } else {
      key = bar.time.slice(0, 7) + '-01'
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(bar)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({
      time:   key,
      open:   group[0].open,
      high:   Math.max(...group.map(b => b.high)),
      low:    Math.min(...group.map(b => b.low)),
      close:  group[group.length - 1].close,
      volume: group.reduce((s, b) => s + b.volume, 0),
    }))
}

// ── Company name → ticker aliases ────────────────────────────────────────────

const TICKER_ALIASES: Record<string, string> = {
  apple: 'AAPL', google: 'GOOGL', alphabet: 'GOOGL', nvidia: 'NVDA',
  microsoft: 'MSFT', amazon: 'AMZN', meta: 'META', facebook: 'META',
  tesla: 'TSLA', netflix: 'NFLX', disney: 'DIS', walmart: 'WMT',
  visa: 'V', mastercard: 'MA', paypal: 'PYPL', salesforce: 'CRM',
  adobe: 'ADBE', oracle: 'ORCL', intel: 'INTC', broadcom: 'AVGO',
  boeing: 'BA', ibm: 'IBM', ford: 'F', uber: 'UBER', airbnb: 'ABNB',
  spotify: 'SPOT', coinbase: 'COIN', snowflake: 'SNOW', shopify: 'SHOP',
  zoom: 'ZM', snap: 'SNAP', snapchat: 'SNAP', pinterest: 'PINS',
  reddit: 'RDDT', coke: 'KO', 'coca-cola': 'KO', cocacola: 'KO',
  pepsi: 'PEP', pepsico: 'PEP', exxon: 'XOM', chevron: 'CVX',
  palantir: 'PLTR', robinhood: 'HOOD', lyft: 'LYFT', amd: 'AMD',
  qualcomm: 'QCOM', starbucks: 'SBUX', mcdonalds: 'MCD', target: 'TGT',
  costco: 'COST', verizon: 'VZ', comcast: 'CMCSA', ups: 'UPS',
  fedex: 'FDX', citigroup: 'C', citi: 'C', 'goldman sachs': 'GS',
  'morgan stanley': 'MS', 'wells fargo': 'WFC', 'bank of america': 'BAC',
  jpmorgan: 'JPM', 'jp morgan': 'JPM', berkshire: 'BRK-B',
  'johnson & johnson': 'JNJ', 'procter & gamble': 'PG',
  lockheed: 'LMT', raytheon: 'RTX', 'general electric': 'GE',
  'general motors': 'GM', 'home depot': 'HD', 'at&t': 'T',
  'texas instruments': 'TXN',
}

const RELATED_STOCKS: Record<string, string[]> = {
  AAPL:  ['MSFT', 'GOOGL', 'META', 'AMZN', 'NVDA'],
  NVDA:  ['AMD', 'INTC', 'QCOM', 'AVGO', 'TSM'],
  GOOG:  ['META', 'MSFT', 'AAPL', 'AMZN', 'NFLX'],
  GOOGL: ['META', 'MSFT', 'AAPL', 'AMZN', 'NFLX'],
  MSFT:  ['AAPL', 'GOOGL', 'META', 'AMZN', 'NVDA'],
  AMZN:  ['MSFT', 'AAPL', 'GOOGL', 'META', 'SHOP'],
  META:  ['GOOGL', 'AAPL', 'MSFT', 'SNAP', 'PINS'],
  TSLA:  ['F', 'GM', 'RIVN', 'NIO', 'LCID'],
  NFLX:  ['DIS', 'WBD', 'PARA', 'SPOT', 'ROKU'],
  AMD:   ['NVDA', 'INTC', 'QCOM', 'AVGO', 'ARM'],
  INTC:  ['AMD', 'NVDA', 'QCOM', 'AVGO', 'TSM'],
  JPM:   ['BAC', 'WFC', 'GS', 'MS', 'C'],
  BAC:   ['JPM', 'WFC', 'GS', 'MS', 'C'],
  V:     ['MA', 'PYPL', 'AXP', 'SQ', 'FI'],
  MA:    ['V', 'PYPL', 'AXP', 'SQ', 'FI'],
  WMT:   ['COST', 'TGT', 'AMZN', 'HD', 'KR'],
  XOM:   ['CVX', 'COP', 'BP', 'SHEL', 'TTE'],
  JNJ:   ['PFE', 'ABBV', 'MRK', 'BMY', 'LLY'],
  PLTR:  ['AI', 'BBAI', 'SNOW', 'PATH', 'S'],
  COIN:  ['MSTR', 'MARA', 'RIOT', 'HOOD', 'CLSK'],
  SHOP:  ['AMZN', 'ETSY', 'WIX', 'BIGC', 'WDAY'],
}

// ── Main component ────────────────────────────────────────────────────────────

interface StockViewerProps {
  initialTicker?: string
  initialInterval?: Interval
  onDataUpdate?: (context: string) => void
  onConfigUpdate?: (ticker: string, interval: string) => void
  isAdmin?: boolean
}

export default function StockViewer({ initialTicker, initialInterval, onDataUpdate, onConfigUpdate, isAdmin = false }: StockViewerProps = {}) {
  const [tickerInput, setTickerInput] = useState(initialTicker ?? '')
  const [activeTicker, setActiveTicker] = useState(initialTicker ?? '')
  const [interval, setIntervalState] = useState<Interval>((initialInterval as Interval) ?? '1Y')
  const [stockData, setStockData] = useState<StockData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Array<{symbol: string; name: string; exchange: string}>>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [candleRes, setCandleRes] = useState<CandleRes>('1D')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [newsUpdatedAt, setNewsUpdatedAt] = useState<number | null>(null)
  const [newsLive, setNewsLive] = useState(false)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef  = useRef<IChartApi | null>(null)
  const onDataUpdateRef   = useRef(onDataUpdate)
  const onConfigUpdateRef = useRef(onConfigUpdate)
  const suggestTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchWrapperRef  = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onDataUpdateRef.current = onDataUpdate }, [onDataUpdate])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onConfigUpdateRef.current = onConfigUpdate }, [onConfigUpdate])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchStock = useCallback(async (ticker: string, intv: Interval) => {
    if (!ticker) return
    setLoading(true)
    setError(null)
    setSuggestions([])
    try {
      const res  = await fetch(`/api/stocks?ticker=${encodeURIComponent(ticker)}&interval=${intv}`)
      const json = await res.json() as StockData & { error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Failed to fetch stock data')
        setStockData(null)
        if (res.status === 404) {
          try {
            const sRes = await fetch(`/api/search?q=${encodeURIComponent(ticker)}`)
            if (sRes.ok) {
              const sData = await sRes.json()
              setSuggestions(sData.quotes ?? [])
            }
          } catch { /* suggestions optional */ }
        }
      } else {
        setStockData(json)
        setNewsUpdatedAt(null)
        onDataUpdateRef.current?.(buildViewerContext(json))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      setStockData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initialTicker) {
      fetchStock(initialTicker.toUpperCase(), (initialInterval as Interval) ?? '1Y')
    } else {
      const picks = ['AAPL', 'NVDA', 'GOOG']
      const pick = picks[Math.floor(Math.random() * picks.length)]
      setTickerInput(pick)
      setActiveTicker(pick)
      fetchStock(pick, interval)
    }
  }, [])

  // ── Live news refresh ────────────────────────────────────────────────────────
  // Poll fresh news ONLY while the tab is visible and the user has been active.
  // If they switch tabs or walk away, polling pauses — no point updating when
  // no one is watching. Resumes immediately when the tab is shown again.
  const companyName = stockData?.companyName ?? null
  useEffect(() => {
    if (!activeTicker) return

    const POLL_MS = 90_000
    const IDLE_MS = 30 * 60_000           // pause after 30 min with no interaction
    let lastActive = Date.now()
    let aborted = false
    const markActive = () => { lastActive = Date.now() }
    const activityEvents = ['mousemove', 'keydown', 'scroll', 'touchstart', 'pointerdown']
    activityEvents.forEach(e => window.addEventListener(e, markActive, { passive: true }))

    const refresh = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastActive > IDLE_MS) {
        setNewsLive(false)
        return
      }
      setNewsLive(true)
      try {
        const url = `/api/news?ticker=${encodeURIComponent(activeTicker)}${companyName ? `&name=${encodeURIComponent(companyName)}` : ''}`
        const res = await fetch(url)
        if (!res.ok || aborted) return
        const data = await res.json()
        if (Array.isArray(data.news) && data.news.length) {
          setStockData(prev => prev && prev.ticker === activeTicker ? { ...prev, news: data.news } : prev)
          setNewsUpdatedAt(Date.now())
        }
      } catch { /* transient — try again next tick */ }
    }

    const kick = setTimeout(refresh, 8000)
    const id   = setInterval(refresh, POLL_MS)
    const onVisChange = () => {
      if (document.visibilityState === 'visible') { markActive(); refresh() }
      else setNewsLive(false)
    }
    document.addEventListener('visibilitychange', onVisChange)

    return () => {
      aborted = true
      clearTimeout(kick)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisChange)
      activityEvents.forEach(e => window.removeEventListener(e, markActive))
      setNewsLive(false)
    }
  }, [activeTicker, companyName])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setTickerInput(v)
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)
    if (!v.trim()) { setSuggestions([]); setShowDropdown(false); return }
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(v)}`)
        if (res.ok) {
          const data = await res.json()
          const quotes = data.quotes ?? []
          setSuggestions(quotes)
          setShowDropdown(quotes.length > 0)
        }
      } catch { /* suggestions optional */ }
    }, 300)
  }

  async function resolveTicker(input: string): Promise<string> {
    const trimmed = input.trim()
    const lower = trimmed.toLowerCase()
    if (TICKER_ALIASES[lower]) return TICKER_ALIASES[lower]
    if (/^[a-zA-Z0-9]{1,6}(-[a-zA-Z0-9]{1,2})?(\.[a-zA-Z]{2})?$/.test(trimmed)) return trimmed.toUpperCase()
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.quotes?.length) return data.quotes[0].symbol as string
      }
    } catch { /* fall through */ }
    return trimmed.toUpperCase()
  }

  function handleSuggestionClick(symbol: string) {
    setTickerInput(symbol)
    setActiveTicker(symbol)
    setShowDropdown(false)
    setSuggestions([])
    fetchStock(symbol, interval)
    onConfigUpdateRef.current?.(symbol, interval)
  }

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const raw = tickerInput.trim()
    if (!raw) return
    setShowDropdown(false)
    const t = await resolveTicker(raw)
    setTickerInput(t)
    setActiveTicker(t)
    fetchStock(t, interval)
    onConfigUpdateRef.current?.(t, interval)
  }

  function handleInterval(intv: Interval) {
    setIntervalState(intv)
    if (activeTicker) {
      fetchStock(activeTicker, intv)
      onConfigUpdateRef.current?.(activeTicker, intv)
    }
  }

  // ── Chart ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!chartContainerRef.current || !stockData) return

    const container = chartContainerRef.current

    // Tear down previous instance
    chartInstanceRef.current?.remove()
    chartInstanceRef.current = null

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1117' },
        textColor: '#9CA3AF',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      width:  container.clientWidth,
      height: container.clientHeight || 420,
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.18)', labelBackgroundColor: '#374151' },
        horzLine: { color: 'rgba(255,255,255,0.18)', labelBackgroundColor: '#374151' },
      },
    })

    chartInstanceRef.current = chart

    const bars = aggregateBars(stockData.ohlcv, candleRes)

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor:        '#1D9E75',
      downColor:      '#D85A30',
      borderUpColor:  '#1D9E75',
      borderDownColor:'#D85A30',
      wickUpColor:    '#1D9E75',
      wickDownColor:  '#D85A30',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candleSeries.setData(bars as any)

    // Volume histogram — bottom 18% of chart
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: false,
    })
    const volSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    volSeries.setData(bars.map((d) => ({
      time:  d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(29,158,117,0.35)' : 'rgba(216,90,48,0.35)',
    })) as any)

    // SMA50 — blue overlay
    if (stockData.sma50.length > 0) {
      const s50 = chart.addLineSeries({
        color: '#3B82F6', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      s50.setData(stockData.sma50 as any)
    }

    // SMA200 — amber overlay
    if (stockData.sma200.length > 0) {
      const s200 = chart.addLineSeries({
        color: '#F59E0B', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      s200.setData(stockData.sma200 as any)
    }

    chart.timeScale().fitContent()

    // Resize observer
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth })
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      chart.remove()
      chartInstanceRef.current = null
    }
  }, [stockData, candleRes])

  // ── Derived ────────────────────────────────────────────────────────────────

  const isUp        = (stockData?.changePercent ?? 0) >= 0
  const { indicators, news } = stockData ?? { indicators: null, news: [] }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Page heading */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <BarChart2 size={20} className="text-green-600" />
            <h1 className="text-xl font-bold text-gray-800">Stock Viewer</h1>
          </div>
          {stockData && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-[11px] text-gray-400">{showAdvanced ? 'Full financials' : 'Key metrics'}</span>
              <div className="flex items-center bg-gray-200 rounded-lg p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setShowAdvanced(false)}
                  className={`px-3 py-1 rounded-md transition-colors ${!showAdvanced ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Standard
                </button>
                <button
                  onClick={() => setShowAdvanced(true)}
                  className={`px-3 py-1 rounded-md transition-colors ${showAdvanced ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Advanced
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Search bar */}
        <div ref={searchWrapperRef}>
        <form onSubmit={handleSearch} className="bg-white rounded-xl p-4 shadow-sm flex gap-3 items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={tickerInput}
              onChange={handleInputChange}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              placeholder="Search by ticker or company name — e.g. AAPL, apple, nvidia"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 placeholder:font-sans"
            />
            {showDropdown && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(s.symbol) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <span className="font-mono font-bold text-sm text-gray-900 w-16 shrink-0">{s.symbol}</span>
                    <span className="text-xs text-gray-500 truncate flex-1">{s.name}</span>
                    {s.exchange && <span className="text-[10px] text-gray-300 font-mono shrink-0">{s.exchange}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !tickerInput.trim()}
            className="bg-[#0079bf] hover:bg-[#026aa7] text-white text-sm px-5 py-2 rounded-lg disabled:opacity-50 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            {loading
              ? <><RefreshCw size={13} className="animate-spin" /> Loading…</>
              : <><Search size={13} /> Search</>
            }
          </button>
        </form>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <p>{error}</p>
            {suggestions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-red-600 mb-2 font-medium">Did you mean one of these?</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.symbol}
                      onClick={() => handleSuggestionClick(s.symbol)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-red-200 hover:border-blue-400 text-gray-800 text-xs transition-colors"
                    >
                      <span className="font-mono font-bold">{s.symbol}</span>
                      <span className="text-gray-500 max-w-[100px] truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Stock content ──────────────────────────────────────────────── */}
        {stockData && (
          <>

            {/* Stats bar */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-gray-400 font-mono">{stockData.ticker}</p>
                    {stockData.marketState && stockData.marketState !== 'REGULAR' && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                        stockData.marketState === 'PRE' || stockData.marketState === 'PREPRE'
                          ? 'bg-amber-100 text-amber-700'
                          : stockData.marketState === 'POST' || stockData.marketState === 'POSTPOST'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {stockData.marketState === 'PRE' || stockData.marketState === 'PREPRE' ? 'Pre-Market'
                          : stockData.marketState === 'POST' || stockData.marketState === 'POSTPOST' ? 'After Hours'
                          : 'Closed'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-3xl font-bold text-gray-900 font-mono tabular-nums">
                      ${fmtPrice(stockData.currentPrice)}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className={`flex items-center gap-1 text-base font-semibold ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                        {isUp ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        {isUp ? '+' : ''}{fmtPrice(Math.abs(stockData.change))}
                        &nbsp;({isUp ? '+' : ''}{stockData.changePercent.toFixed(2)}%)
                        <span className="text-[10px] font-normal text-gray-400 ml-0.5">1D</span>
                      </span>
                      {stockData.periodChange != null && (
                        <span className={`text-xs font-medium ${stockData.periodChangePercent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {interval}: {stockData.periodChangePercent >= 0 ? '+' : ''}{stockData.periodChangePercent.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Pre-market price */}
                  {(stockData.marketState === 'PRE' || stockData.marketState === 'PREPRE') && stockData.preMarketPrice != null && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-400">Pre-market</span>
                      <span className="text-base font-bold font-mono tabular-nums text-gray-900">
                        ${fmtPrice(stockData.preMarketPrice)}
                      </span>
                      {stockData.preMarketChange != null && stockData.preMarketChangePercent != null && (
                        <span className={`text-xs font-semibold ${stockData.preMarketChange >= 0 ? 'text-amber-600' : 'text-red-500'}`}>
                          {stockData.preMarketChange >= 0 ? '+' : ''}{fmtPrice(Math.abs(stockData.preMarketChange))}
                          &nbsp;({stockData.preMarketChange >= 0 ? '+' : ''}{stockData.preMarketChangePercent.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                  )}
                  {/* After-hours price */}
                  {(stockData.marketState === 'POST' || stockData.marketState === 'POSTPOST' || stockData.marketState === 'CLOSED') && stockData.postMarketPrice != null && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-400">After hours</span>
                      <span className="text-base font-bold font-mono tabular-nums text-gray-900">
                        ${fmtPrice(stockData.postMarketPrice)}
                      </span>
                      {stockData.postMarketChange != null && stockData.postMarketChangePercent != null && (
                        <span className={`text-xs font-semibold ${stockData.postMarketChange >= 0 ? 'text-purple-600' : 'text-red-500'}`}>
                          {stockData.postMarketChange >= 0 ? '+' : ''}{fmtPrice(Math.abs(stockData.postMarketChange))}
                          &nbsp;({stockData.postMarketChange >= 0 ? '+' : ''}{stockData.postMarketChangePercent.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                <Stat label="Market Cap"   value={fmtCap(stockData.marketCap)} />
                <Stat label="P/E Ratio"    value={stockData.peRatio      != null ? `${stockData.peRatio}×`             : '—'} />
                <Stat label="EPS"          value={stockData.eps          != null ? `$${stockData.eps}`                  : '—'} />
                <Stat label="52w High"     value={stockData.high52w      != null ? `$${fmtPrice(stockData.high52w)}`    : '—'} />
                <Stat label="52w Low"      value={stockData.low52w       != null ? `$${fmtPrice(stockData.low52w)}`     : '—'} />
                <Stat label="Div Yield"    value={stockData.dividendYield!= null ? `${stockData.dividendYield}%`        : '—'} />
              </div>
            </div>

            {/* Alerts — admin only */}
            {isAdmin && (
              <StockAlerts
                ticker={stockData.ticker}
                currentPrice={stockData.currentPrice}
                changePercent={stockData.changePercent}
              />
            )}

            {/* Related stocks */}
            {RELATED_STOCKS[stockData.ticker] && (
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                <span className="text-xs text-gray-400 shrink-0 font-medium">Related:</span>
                {RELATED_STOCKS[stockData.ticker].map(sym => (
                  <button
                    key={sym}
                    onClick={() => { setTickerInput(sym); setActiveTicker(sym); fetchStock(sym, interval) }}
                    className="shrink-0 px-3 py-1 bg-white rounded-full text-xs font-mono font-semibold text-gray-700 border border-gray-200 hover:border-blue-400 hover:text-blue-600 transition-colors shadow-sm"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}

            {/* Candlestick chart */}
            <div className="bg-[#0f1117] rounded-xl overflow-hidden shadow-sm">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 pt-3.5 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  {/* Date range */}
                  <div className="flex gap-1">
                    {(['1M', '3M', '6M', '1Y'] as Interval[]).map((intv) => (
                      <button
                        key={intv}
                        onClick={() => handleInterval(intv)}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          interval === intv
                            ? 'bg-white/15 text-white'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/08'
                        }`}
                      >
                        {intv}
                      </button>
                    ))}
                  </div>
                  {/* Candle resolution */}
                  <div className="flex gap-1 border-l border-white/10 pl-3">
                    {(['1D', '1W', '1M'] as CandleRes[]).map((res) => (
                      <button
                        key={res}
                        onClick={() => setCandleRes(res)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                          candleRes === res
                            ? 'bg-white/15 text-white'
                            : 'text-gray-600 hover:text-gray-300 hover:bg-white/08'
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-[2px] bg-[#3B82F6] inline-block rounded" />
                    SMA 50
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-[2px] bg-[#F59E0B] inline-block rounded" />
                    SMA 200
                  </span>
                </div>
              </div>

              {/* Chart canvas area */}
              <div ref={chartContainerRef} className="w-full h-[420px]" />
            </div>

            {/* Technical indicators */}
            {indicators && (
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                    <BarChart2 size={14} className="text-blue-500" />
                    Technical Indicators
                    <span className="text-[10px] text-gray-400 font-normal">· Daily close, latest bar</span>
                  </h2>
                  {!showAdvanced && (
                    <button
                      onClick={() => setShowAdvanced(true)}
                      className="text-[11px] px-3 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      + More indicators
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">

                  {/* RSI */}
                  {indicators.rsi != null && (() => {
                    const v = indicators.rsi
                    const cls = v > 70 ? 'bg-red-50 text-red-700 border-red-200' : v < 30 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                    const lbl = v > 70 ? 'Overbought' : v < 30 ? 'Oversold' : 'Neutral'
                    return (
                      <div className={`flex items-baseline gap-2 px-4 py-2.5 rounded-lg border text-sm ${cls}`}>
                        <span className="text-[11px] font-semibold opacity-60">RSI(14)</span>
                        <span className="text-lg font-bold tabular-nums">{v}</span>
                        <span className="text-[11px] opacity-60">· {lbl}</span>
                      </div>
                    )
                  })()}

                  {/* MACD */}
                  {indicators.macd != null && (() => {
                    const v = indicators.macd
                    const cls = v >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                    return (
                      <div className={`flex items-baseline gap-2 px-4 py-2.5 rounded-lg border text-sm ${cls}`}>
                        <span className="text-[11px] font-semibold opacity-60">MACD(12/26/9)</span>
                        <span className="text-lg font-bold tabular-nums">{v >= 0 ? '+' : ''}{v}</span>
                        {indicators.macdHistogram != null && (
                          <span className="text-[11px] opacity-60">Hist: {indicators.macdHistogram >= 0 ? '+' : ''}{indicators.macdHistogram}</span>
                        )}
                      </div>
                    )
                  })()}

                  {/* Bollinger Bands */}
                  {indicators.bbWidth != null && (
                    <div className="flex items-baseline gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-sm">
                      <span className="text-[11px] font-semibold opacity-60">BB(20,2)</span>
                      <span className="text-lg font-bold tabular-nums">{indicators.bbWidth.toFixed(2)}%</span>
                      {indicators.bbUpper != null && indicators.bbLower != null && (
                        <span className="text-[11px] opacity-60">${indicators.bbLower.toFixed(2)} – ${indicators.bbUpper.toFixed(2)}</span>
                      )}
                    </div>
                  )}

                  {/* ── Advanced indicators ── */}
                  {showAdvanced && <>

                    {/* Stochastic */}
                    {indicators.stochK != null && (() => {
                      const k = indicators.stochK!
                      const cls = k > 80 ? 'bg-red-50 text-red-700 border-red-200' : k < 20 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                      const lbl = k > 80 ? 'Overbought' : k < 20 ? 'Oversold' : 'Neutral'
                      return (
                        <div className={`flex items-baseline gap-2 px-4 py-2.5 rounded-lg border text-sm ${cls}`}>
                          <span className="text-[11px] font-semibold opacity-60">Stoch(14,3)</span>
                          <span className="text-lg font-bold tabular-nums">{k}</span>
                          {indicators.stochD != null && <span className="text-[11px] opacity-60">D: {indicators.stochD}</span>}
                          <span className="text-[11px] opacity-60">· {lbl}</span>
                        </div>
                      )
                    })()}

                    {/* Williams %R */}
                    {indicators.williamsR != null && (() => {
                      const v = indicators.williamsR!
                      const cls = v > -20 ? 'bg-red-50 text-red-700 border-red-200' : v < -80 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                      const lbl = v > -20 ? 'Overbought' : v < -80 ? 'Oversold' : 'Neutral'
                      return (
                        <div className={`flex items-baseline gap-2 px-4 py-2.5 rounded-lg border text-sm ${cls}`}>
                          <span className="text-[11px] font-semibold opacity-60">W%R(14)</span>
                          <span className="text-lg font-bold tabular-nums">{v}</span>
                          <span className="text-[11px] opacity-60">· {lbl}</span>
                        </div>
                      )
                    })()}

                    {/* CCI */}
                    {indicators.cci != null && (() => {
                      const v = indicators.cci!
                      const cls = v > 100 ? 'bg-red-50 text-red-700 border-red-200' : v < -100 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                      const lbl = v > 100 ? 'Overbought' : v < -100 ? 'Oversold' : 'Neutral'
                      return (
                        <div className={`flex items-baseline gap-2 px-4 py-2.5 rounded-lg border text-sm ${cls}`}>
                          <span className="text-[11px] font-semibold opacity-60">CCI(20)</span>
                          <span className="text-lg font-bold tabular-nums">{v}</span>
                          <span className="text-[11px] opacity-60">· {lbl}</span>
                        </div>
                      )
                    })()}

                    {/* ATR */}
                    {indicators.atr != null && (
                      <div className="flex items-baseline gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-sm">
                        <span className="text-[11px] font-semibold opacity-60">ATR(14)</span>
                        <span className="text-lg font-bold tabular-nums">${indicators.atr.toFixed(2)}</span>
                        <span className="text-[11px] opacity-60">avg true range</span>
                      </div>
                    )}

                    {/* ROC */}
                    {indicators.roc != null && (() => {
                      const v = indicators.roc!
                      const cls = v >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                      return (
                        <div className={`flex items-baseline gap-2 px-4 py-2.5 rounded-lg border text-sm ${cls}`}>
                          <span className="text-[11px] font-semibold opacity-60">ROC(14)</span>
                          <span className="text-lg font-bold tabular-nums">{v >= 0 ? '+' : ''}{v}%</span>
                        </div>
                      )
                    })()}

                  </>}
                </div>
              </div>
            )}

            {/* Fundamentals (advanced — mirrors the header stats with full labels) */}
            {showAdvanced && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                <BookOpen size={14} className="text-purple-500" />
                Fundamentals
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'P/E Ratio',      value: stockData.peRatio       != null ? `${stockData.peRatio}×`          : 'N/A' },
                  { label: 'EPS',             value: stockData.eps           != null ? `$${stockData.eps}`              : 'N/A' },
                  { label: 'Market Cap',      value: fmtCap(stockData.marketCap) },
                  { label: 'Dividend Yield',  value: stockData.dividendYield != null ? `${stockData.dividendYield}%`   : 'N/A' },
                  { label: '52w High',        value: stockData.high52w       != null ? `$${fmtPrice(stockData.high52w)}`: 'N/A' },
                  { label: '52w Low',         value: stockData.low52w        != null ? `$${fmtPrice(stockData.low52w)}` : 'N/A' },
                ].map(({ label, value }) => (
                  <div key={label} className="border border-gray-100 rounded-lg px-4 py-3">
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className="text-sm font-bold text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* News feed */}
            {news.length > 0 && (
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                    <Newspaper size={14} className="text-amber-500" />
                    Latest News
                  </h2>
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    {newsUpdatedAt && (
                      <span>Updated {new Date(newsUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    )}
                    {newsLive && (
                      <span className="flex items-center gap-1.5 text-green-600 font-medium">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        Live
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {news.map((item, i) => (
                    <a
                      key={i}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-md transition-all group"
                    >
                      {item.imageUrl && (
                        <div className="w-full h-36 bg-gray-100 overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        </div>
                      )}
                      <div className="p-4 flex flex-col flex-1">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            item.sentiment === 'positive' ? 'bg-green-100 text-green-700'
                            : item.sentiment === 'negative' ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-500'
                          }`}>
                            {item.sentiment === 'positive' ? '▲ Positive' : item.sentiment === 'negative' ? '▼ Negative' : '● Neutral'}
                          </span>
                          <ExternalLink size={11} className="text-gray-300 group-hover:text-blue-400 shrink-0" />
                        </div>
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 leading-snug flex-1">
                          {item.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          {item.source} · {fmtDate(item.publishedAt)}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── Company profile ──────────────────────────────────────── */}
            {(stockData.description || stockData.sector) && (
              <SectionCard title="Company Profile" icon={<BookOpen size={14} className="text-indigo-500" />}>
                <Grid items={[
                  { label: 'Sector',    value: stockData.sector   ?? '—' },
                  { label: 'Industry',  value: stockData.industry ?? '—' },
                  { label: 'Country',   value: stockData.country  ?? '—' },
                  { label: 'Employees', value: stockData.employees != null ? stockData.employees.toLocaleString() : '—' },
                  { label: 'Beta',      value: fmtNum(stockData.beta, 2) },
                  { label: 'Short Ratio', value: fmtNum(stockData.shortRatio, 1) },
                ]} />
                {stockData.description && (
                  <p className="mt-3 text-sm text-gray-600 leading-relaxed line-clamp-4">{stockData.description}</p>
                )}
                {stockData.website && (
                  <a href={stockData.website} target="_blank" rel="noreferrer" className="mt-1 text-xs text-blue-500 hover:underline">{stockData.website}</a>
                )}
              </SectionCard>
            )}

            {/* ── Nordic data (Avanza) ─────────────────────────────────── */}
            {showAdvanced && stockData.avanza && (
              <SectionCard title="Nordic Data — Avanza (SEK)" icon={<BarChart2 size={14} className="text-yellow-500" />}>
                <p className="text-[11px] text-gray-400 mb-3">
                  Swedish broker data{stockData.avanza.marketList ? ` · ${stockData.avanza.marketList}` : ''} — fills gaps Yahoo Finance leaves for Swedish tickers.
                </p>
                <Grid items={[
                  { label: 'P/E Ratio',      value: fmtNum(stockData.avanza.peRatio, 2) },
                  { label: 'P/S Ratio',      value: fmtNum(stockData.avanza.psRatio, 2) },
                  { label: 'P/B Ratio',      value: fmtNum(stockData.avanza.pbRatio, 2) },
                  { label: 'EV/EBIT',        value: fmtNum(stockData.avanza.evEbit, 2) },
                  { label: 'Direct Yield',   value: fmtPct(stockData.avanza.directYield) },
                  { label: 'Beta',           value: fmtNum(stockData.avanza.beta, 2) },
                  { label: 'Volatility',     value: fmtPct(stockData.avanza.volatility) },
                  { label: 'ROE',            value: fmtPct(stockData.avanza.returnOnEquity) },
                  { label: 'ROA',            value: fmtPct(stockData.avanza.returnOnAssets) },
                  { label: 'ROCE',           value: fmtPct(stockData.avanza.returnOnCapitalEmployed) },
                  { label: 'Equity Ratio',   value: fmtPct(stockData.avanza.equityRatio) },
                  { label: 'Gross Margin',   value: fmtPct(stockData.avanza.grossMargin) },
                  { label: 'Operating Margin', value: fmtPct(stockData.avanza.operatingMargin) },
                  { label: 'Net Margin',     value: fmtPct(stockData.avanza.netMargin) },
                  { label: 'Market Cap',     value: stockData.avanza.marketCap != null ? `${(stockData.avanza.marketCap/1e9).toFixed(2)}B SEK` : '—' },
                  { label: 'EPS',            value: stockData.avanza.eps != null ? `${stockData.avanza.eps} SEK` : '—' },
                  { label: 'Equity/Share',   value: stockData.avanza.equityPerShare != null ? `${stockData.avanza.equityPerShare} SEK` : '—' },
                  { label: 'Owners',         value: stockData.avanza.numberOfOwners != null ? stockData.avanza.numberOfOwners.toLocaleString() : '—' },
                  { label: 'Short Ratio',    value: fmtPct(stockData.avanza.shortSellingRatio) },
                  { label: 'Dividend',       value: stockData.avanza.dividendAmount != null ? `${stockData.avanza.dividendAmount} SEK${stockData.avanza.dividendsPerYear ? ` ×${stockData.avanza.dividendsPerYear}` : ''}` : '—' },
                  { label: 'Next Report',    value: stockData.avanza.nextReportDate ?? '—' },
                ].filter(i => i.value !== '—')} />
              </SectionCard>
            )}

            {/* ── Extended valuation + Margins (advanced) ──────────────── */}
            {showAdvanced && (<>
            <SectionCard title="Extended Valuation" icon={<BookOpen size={14} className="text-purple-500" />}>
              <Grid items={[
                { label: 'Forward P/E',   value: stockData.forwardEps && stockData.currentPrice ? `${(stockData.currentPrice / stockData.forwardEps).toFixed(1)}×` : '—' },
                { label: 'Price/Book',    value: fmtNum(stockData.priceToBook, 2, '') + (stockData.priceToBook != null ? '×' : '') },
                { label: 'EV/Revenue',    value: fmtNum(stockData.enterpriseToRevenue, 2, '') + (stockData.enterpriseToRevenue != null ? '×' : '') },
                { label: 'EV/EBITDA',     value: fmtNum(stockData.enterpriseToEbitda, 2, '') + (stockData.enterpriseToEbitda != null ? '×' : '') },
                { label: 'Forward EPS',   value: stockData.forwardEps != null ? `$${stockData.forwardEps}` : '—' },
                { label: 'Book Value',    value: stockData.bookValue  != null ? `$${stockData.bookValue}`  : '—' },
                { label: 'Payout Ratio',  value: fmtPct(stockData.payoutRatio) },
                { label: 'Insider Own.',  value: fmtPct(stockData.heldPercentInsiders) },
                { label: 'Inst. Own.',    value: fmtPct(stockData.heldPercentInstitutions) },
              ].filter(i => i.value !== '—')} />
            </SectionCard>

            {/* ── Margins & health ─────────────────────────────────────── */}
            <SectionCard title="Margins & Financial Health" icon={<BarChart2 size={14} className="text-blue-500" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Margins</p>
                  <Grid items={[
                    { label: 'Gross Margin',     value: fmtPct(stockData.grossMargins) },
                    { label: 'Operating Margin', value: fmtPct(stockData.operatingMargins) },
                    { label: 'Profit Margin',    value: fmtPct(stockData.profitMargins) },
                    { label: 'ROE',              value: fmtPct(stockData.returnOnEquity) },
                    { label: 'ROA',              value: fmtPct(stockData.returnOnAssets) },
                    { label: 'Revenue Growth',   value: fmtPct(stockData.revenueGrowth) },
                    { label: 'Earnings Growth',  value: fmtPct(stockData.earningsGrowth) },
                  ].filter(i => i.value !== '—')} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Balance</p>
                  <Grid items={[
                    { label: 'Total Revenue',    value: fmtB(stockData.totalRevenue) },
                    { label: 'Gross Profit',     value: fmtB(stockData.grossProfits) },
                    { label: 'EBITDA',           value: fmtB(stockData.ebitda) },
                    { label: 'Free Cash Flow',   value: fmtB(stockData.freeCashflow) },
                    { label: 'Total Cash',       value: fmtB(stockData.totalCash) },
                    { label: 'Total Debt',       value: fmtB(stockData.totalDebt) },
                    { label: 'Debt/Equity',      value: fmtNum(stockData.debtToEquity, 2) },
                    { label: 'Current Ratio',    value: fmtNum(stockData.currentRatio, 2) },
                  ].filter(i => i.value !== '—')} />
                </div>
              </div>
            </SectionCard>
            </>)}

            {/* ── Analyst price targets ────────────────────────────────── */}
            {stockData.targetMeanPrice != null && (
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2 text-sm">
                  <TrendingUp size={14} className="text-green-500" />
                  Analyst Price Targets
                  {stockData.numberOfAnalysts != null && (
                    <span className="ml-1 text-[11px] text-gray-400 font-normal">{stockData.numberOfAnalysts} analysts</span>
                  )}
                </h2>
                {(() => {
                  const lo  = stockData.targetLowPrice  ?? stockData.currentPrice
                  const hi  = stockData.targetHighPrice ?? stockData.currentPrice
                  const mn  = stockData.targetMeanPrice!
                  const cur = stockData.currentPrice
                  const rangeMin = Math.min(lo, cur) * 0.97
                  const rangeMax = Math.max(hi, cur) * 1.03
                  const span = rangeMax - rangeMin
                  const pct = (v: number) => Math.max(0, Math.min(100, ((v - rangeMin) / span) * 100))
                  const upside = ((mn - cur) / cur * 100).toFixed(1)
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Low <span className="font-mono font-bold text-gray-700">${lo.toFixed(2)}</span></span>
                        <span className={`font-semibold text-sm ${mn >= cur ? 'text-green-600' : 'text-red-500'}`}>
                          Mean ${mn.toFixed(2)} ({mn >= cur ? '+' : ''}{upside}% upside)
                        </span>
                        <span>High <span className="font-mono font-bold text-gray-700">${hi.toFixed(2)}</span></span>
                      </div>
                      <div className="relative h-3 bg-gray-100 rounded-full">
                        <div
                          className="absolute h-full bg-blue-100 rounded-full"
                          style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow"
                          style={{ left: `calc(${pct(mn)}% - 6px)` }}
                          title={`Mean target: $${mn.toFixed(2)}`}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-4 rounded bg-gray-800 border border-white shadow"
                          style={{ left: `calc(${pct(cur)}% - 5px)` }}
                          title={`Current: $${cur.toFixed(2)}`}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-400">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-4 rounded bg-gray-800 inline-block" /> Current ${cur.toFixed(2)}</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Mean target</span>
                        <span className="flex items-center gap-1.5"><span className="w-6 h-2.5 rounded bg-blue-100 inline-block" /> Analyst range</span>
                      </div>
                      {stockData.recommendationKey && (
                        <div className="flex gap-2 flex-wrap mt-1">
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${
                            ['buy','strong buy','strongbuy'].includes(stockData.recommendationKey.toLowerCase())
                              ? 'bg-green-100 text-green-700'
                              : ['sell','strong sell','strongsell'].includes(stockData.recommendationKey.toLowerCase())
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-50 text-blue-700'
                          }`}>
                            {stockData.recommendationKey}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Standard-mode CTA into the full financial breakdown */}
            {!showAdvanced && (
              <button
                onClick={() => setShowAdvanced(true)}
                className="w-full bg-white rounded-xl p-4 shadow-sm border border-dashed border-gray-200 text-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors flex items-center justify-center gap-2"
              >
                <BookOpen size={15} />
                Show full financials — valuation, margins, statements, earnings & insider activity
              </button>
            )}

            {/* ── Analyst consensus ────────────────────────────────────── */}
            {showAdvanced && (stockData.targetMeanPrice || stockData.recommendationKey) && (
              <SectionCard title="Analyst Details" icon={<TrendingUp size={14} className="text-green-500" />}>
                <div className="flex flex-wrap gap-3 mb-3">
                  {stockData.recommendationKey && (
                    <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-bold uppercase">{stockData.recommendationKey}</div>
                  )}
                  {stockData.numberOfAnalysts != null && (
                    <div className="px-4 py-2 bg-gray-50 text-gray-600 rounded-lg text-sm">{stockData.numberOfAnalysts} analysts</div>
                  )}
                  {stockData.nextEarningsDate && (
                    <div className="px-4 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm">Next earnings: {stockData.nextEarningsDate}</div>
                  )}
                </div>
                <Grid items={[
                  { label: 'Target (mean)', value: stockData.targetMeanPrice != null ? `$${stockData.targetMeanPrice.toFixed(2)}` : '—' },
                  { label: 'Target (high)', value: stockData.targetHighPrice != null ? `$${stockData.targetHighPrice.toFixed(2)}` : '—' },
                  { label: 'Target (low)',  value: stockData.targetLowPrice  != null ? `$${stockData.targetLowPrice.toFixed(2)}`  : '—' },
                  ...(stockData.targetMeanPrice && stockData.currentPrice ? [{
                    label: 'Upside (mean)',
                    value: `${((stockData.targetMeanPrice - stockData.currentPrice) / stockData.currentPrice * 100).toFixed(1)}%`,
                  }] : []),
                ].filter(i => i.value !== '—')} />

                {stockData.recommendationTrend.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Recommendation trend</p>
                    <TableSection
                      cols={['Period', 'Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell']}
                      rows={stockData.recommendationTrend.map(r => [r.period, String(r.strongBuy), String(r.buy), String(r.hold), String(r.sell), String(r.strongSell)])}
                    />
                  </div>
                )}

                {stockData.upgradeDowngradeHistory.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent analyst actions</p>
                    <TableSection
                      cols={['Date', 'Firm', 'Action', 'To', 'From']}
                      rows={stockData.upgradeDowngradeHistory.map(u => [u.date, u.firm, u.action, u.toGrade, u.fromGrade || '—'])}
                    />
                  </div>
                )}
              </SectionCard>
            )}

            {/* ── Earnings history & estimates ────────────────────────── */}
            {showAdvanced && (stockData.earningsHistory.length > 0 || stockData.earningsTrend.length > 0) && (
              <SectionCard title="Earnings" icon={<BarChart2 size={14} className="text-orange-500" />}>
                {stockData.earningsHistory.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Historical EPS</p>
                    <TableSection
                      cols={['Quarter', 'Actual', 'Estimate', 'Surprise']}
                      rows={stockData.earningsHistory.map(e => [
                        e.date,
                        e.epsActual   != null ? `$${e.epsActual.toFixed(2)}`   : null,
                        e.epsEstimate != null ? `$${e.epsEstimate.toFixed(2)}` : null,
                        e.surprisePct != null ? `${(e.surprisePct * 100).toFixed(1)}%` : null,
                      ])}
                    />
                  </div>
                )}
                {stockData.earningsTrend.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Forward estimates</p>
                    <TableSection
                      cols={['Period', 'End Date', 'EPS Est.', 'Revenue Est.', 'Analysts']}
                      rows={stockData.earningsTrend.map(t => [
                        t.period, t.endDate,
                        t.epsEst != null ? `$${t.epsEst.toFixed(2)}` : null,
                        t.revEst != null ? fmtB(t.revEst) : null,
                        t.numAnalysts != null ? String(t.numAnalysts) : null,
                      ])}
                    />
                  </div>
                )}
              </SectionCard>
            )}

            {/* ── Annual income statements ─────────────────────────────── */}
            {showAdvanced && stockData.incomeAnnual.length > 0 && (
              <SectionCard title="Annual Income Statements" icon={<BookOpen size={14} className="text-teal-500" />}>
                <TableSection
                  cols={['Fiscal Year', 'Revenue', 'Gross Profit', 'EBIT', 'Net Income', 'EBITDA']}
                  rows={stockData.incomeAnnual.map(s => [s.date, fmtB(s.totalRevenue), fmtB(s.grossProfit), fmtB(s.ebit), fmtB(s.netIncome), fmtB(s.ebitda)])}
                />
                {stockData.incomeQuarterly.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarterly (last 4)</p>
                    <TableSection
                      cols={['Quarter', 'Revenue', 'Gross Profit', 'Net Income']}
                      rows={stockData.incomeQuarterly.map(s => [s.date, fmtB(s.totalRevenue), fmtB(s.grossProfit), fmtB(s.netIncome)])}
                    />
                  </div>
                )}
              </SectionCard>
            )}

            {/* ── Balance sheet ─────────────────────────────────────────── */}
            {showAdvanced && stockData.balanceAnnual.length > 0 && (
              <SectionCard title="Annual Balance Sheets" icon={<BookOpen size={14} className="text-violet-500" />}>
                <TableSection
                  cols={['Fiscal Year', 'Total Assets', 'Total Liab.', 'Equity', 'Cash', 'Long-Term Debt']}
                  rows={stockData.balanceAnnual.map(s => [s.date, fmtB(s.totalAssets), fmtB(s.totalLiab), fmtB(s.equity), fmtB(s.cash), fmtB(s.longDebt)])}
                />
              </SectionCard>
            )}

            {/* ── Cash flow ────────────────────────────────────────────── */}
            {showAdvanced && stockData.cashflowAnnual.length > 0 && (
              <SectionCard title="Annual Cash Flow Statements" icon={<BarChart2 size={14} className="text-cyan-500" />}>
                <TableSection
                  cols={['Fiscal Year', 'Operating CF', 'CapEx', 'Free CF', 'Investing CF', 'Financing CF']}
                  rows={stockData.cashflowAnnual.map(s => [s.date, fmtB(s.operatingCF), fmtB(s.capex), fmtB(s.freeCF), fmtB(s.investingCF), fmtB(s.financingCF)])}
                />
              </SectionCard>
            )}

            {/* ── Insider transactions ──────────────────────────────────── */}
            {showAdvanced && stockData.insiderTransactions.length > 0 && (
              <SectionCard title="Recent Insider Transactions" icon={<Newspaper size={14} className="text-rose-500" />}>
                <TableSection
                  cols={['Date', 'Insider', 'Shares', 'Value', 'Description']}
                  rows={stockData.insiderTransactions.map(t => [
                    t.date, t.name,
                    t.shares != null ? t.shares.toLocaleString() : null,
                    t.value  != null ? fmtB(t.value)             : null,
                    t.description || null,
                  ])}
                />
              </SectionCard>
            )}

          </>
        )}

        {/* Empty state */}
        {!stockData && !loading && !error && (
          <div className="bg-white rounded-xl p-12 shadow-sm flex flex-col items-center text-center">
            <BarChart2 size={48} className="text-gray-200 mb-4" />
            <p className="text-gray-500 font-medium">Search for any stock to view its data</p>
            <p className="text-gray-400 text-sm mt-1">
              US stocks: <code className="font-mono bg-gray-50 px-1 rounded">AAPL</code>,&nbsp;
              <code className="font-mono bg-gray-50 px-1 rounded">TSLA</code>,&nbsp;
              <code className="font-mono bg-gray-50 px-1 rounded">MSFT</code>
              &nbsp;·&nbsp;
              Swedish: <code className="font-mono bg-gray-50 px-1 rounded">ERIC-B.ST</code>,&nbsp;
              <code className="font-mono bg-gray-50 px-1 rounded">VOLV-B.ST</code>
            </p>
          </div>
        )}

      </div>
    </div>
  )
}

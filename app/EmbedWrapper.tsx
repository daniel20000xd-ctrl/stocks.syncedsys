'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Interval } from './StockViewer'

const StockViewer = dynamic(() => import('./StockViewer'), { ssr: false })

export default function EmbedWrapper() {
  const searchParams = useSearchParams()
  const ticker   = searchParams.get('ticker')   ?? undefined
  const interval = searchParams.get('interval') ?? undefined
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function initAuth() {
      const hash   = window.location.hash.slice(1)
      const params = new URLSearchParams(hash)
      const accessToken  = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        // Clear tokens from URL bar
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
      setReady(true)
    }
    initAuth()
  }, [])

  if (!ready) return (
    <div className="flex items-center justify-center h-screen bg-[#0f1117]">
      <p className="text-white/30 text-sm">Loading…</p>
    </div>
  )

  return (
    <StockViewer
      initialTicker={ticker}
      initialInterval={interval as Interval}
      onDataUpdate={(ctx) => window.parent.postMessage({ type: 'stock_context', context: ctx }, '*')}
      onConfigUpdate={(t, intv) => window.parent.postMessage({ type: 'stock_config', ticker: t, interval: intv }, '*')}
    />
  )
}

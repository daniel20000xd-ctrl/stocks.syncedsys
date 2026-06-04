import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import StockViewerWrapper from './StockViewerWrapper'
import EmbedWrapper from './EmbedWrapper'

const Loading = () => (
  <div className="flex items-center justify-center h-screen bg-[#0f1117]">
    <p className="text-white/30 text-sm">Loading…</p>
  </div>
)

export default async function StocksPage({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string }>
}) {
  const params = await searchParams

  if (params.embed === '1') {
    return (
      <Suspense fallback={<Loading />}>
        <EmbedWrapper />
      </Suspense>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <StockViewerWrapper />
}

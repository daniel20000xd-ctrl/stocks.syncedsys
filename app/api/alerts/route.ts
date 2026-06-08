import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'daniel20000xd@gmail.com'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker')?.toUpperCase().trim() ?? null

  const admin = createAdminClient()
  let query = admin
    .from('stock_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (ticker) query = query.eq('ticker', ticker)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alerts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { ticker, condition, threshold, cooldown_minutes = 60 } = body

  if (!ticker || !condition || threshold == null) {
    return NextResponse.json({ error: 'ticker, condition, threshold required' }, { status: 400 })
  }
  const VALID = ['price_above', 'price_below', 'change_pct_above', 'change_pct_below']
  if (!VALID.includes(condition)) {
    return NextResponse.json({ error: 'invalid condition' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('stock_alerts')
    .insert({
      user_id: user.id,
      ticker: (ticker as string).toUpperCase().trim(),
      condition,
      threshold: parseFloat(threshold),
      cooldown_minutes: parseInt(cooldown_minutes),
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alert: data }, { status: 201 })
}

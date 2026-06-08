-- Run this in the Supabase SQL editor for the stocks-satellite project.
--
-- Required env vars to add in Vercel (stocks-satellite project):
--   RESEND_API_KEY     — from resend.com (free tier covers 3k emails/month)
--   RESEND_FROM_EMAIL  — verified sender, e.g. alerts@syncedsys.com
--   ADMIN_EMAIL        — your email (daniel20000xd@gmail.com)
--   CRON_SECRET        — any random string; add same value in Vercel env vars

create table if not exists stock_alerts (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  ticker            text        not null,
  condition         text        not null
                    check (condition in ('price_above','price_below','change_pct_above','change_pct_below')),
  threshold         numeric     not null,
  is_active         boolean     not null default true,
  last_triggered_at timestamptz,
  triggered_count   integer     not null default 0,
  cooldown_minutes  integer     not null default 60,
  created_at        timestamptz not null default now()
);

alter table stock_alerts enable row level security;

create policy "Users manage own alerts"
  on stock_alerts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists stock_alerts_user_ticker
  on stock_alerts (user_id, ticker);

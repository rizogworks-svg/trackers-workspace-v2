-- Trackers Workspace Supabase backend baseline
-- Run this in Supabase SQL editor.
create table if not exists public.trackly_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.trackly_user_state enable row level security;

drop policy if exists "trackly_select_own_state" on public.trackly_user_state;
create policy "trackly_select_own_state" on public.trackly_user_state
for select using (auth.uid() = user_id);

drop policy if exists "trackly_insert_own_state" on public.trackly_user_state;
create policy "trackly_insert_own_state" on public.trackly_user_state
for insert with check (auth.uid() = user_id);

drop policy if exists "trackly_update_own_state" on public.trackly_user_state;
create policy "trackly_update_own_state" on public.trackly_user_state
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Future production hardening: normalize projects, BAST, PKBON and finance into record-level tables.

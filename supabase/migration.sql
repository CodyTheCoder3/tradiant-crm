-- ============================================================
-- Tradiant CRM — Database Schema & RLS
-- Run this once in the Supabase SQL Editor
-- ============================================================

-- profiles: one row per auth user
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  first_name text not null,
  last_name  text not null,
  email      text not null
);

-- deals
create table if not exists public.deals (
  id         uuid primary key default gen_random_uuid(),
  company    text not null,
  contact    text,
  value      numeric default 0,
  close_date date,
  stage      text not null default 'open',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- deal_notes (activity log)
create table if not exists public.deal_notes (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id) on delete cascade,
  author_name text not null,
  text        text not null,
  created_at  timestamptz not null default now()
);

-- ── Trigger: auto-create profile on sign-up ──────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────
alter table public.profiles  enable row level security;
alter table public.deals      enable row level security;
alter table public.deal_notes enable row level security;

-- profiles
create policy "Authenticated users can read all profiles"
  on public.profiles for select using (auth.role() = 'authenticated');
create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- deals: any authenticated user can fully manage
create policy "Authenticated: read deals"
  on public.deals for select using (auth.role() = 'authenticated');
create policy "Authenticated: insert deals"
  on public.deals for insert with check (auth.role() = 'authenticated');
create policy "Authenticated: update deals"
  on public.deals for update using (auth.role() = 'authenticated');
create policy "Authenticated: delete deals"
  on public.deals for delete using (auth.role() = 'authenticated');

-- deal_notes
create policy "Authenticated: read notes"
  on public.deal_notes for select using (auth.role() = 'authenticated');
create policy "Authenticated: insert notes"
  on public.deal_notes for insert with check (auth.role() = 'authenticated');
create policy "Authenticated: delete notes"
  on public.deal_notes for delete using (auth.role() = 'authenticated');

-- ── Realtime ──────────────────────────────────────────────────
-- Enable realtime for live board updates
alter publication supabase_realtime add table public.deals;
alter publication supabase_realtime add table public.deal_notes;

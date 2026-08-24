-- Add deal_products table (supports multiple products per deal)
-- Run this in the Supabase SQL Editor

create table if not exists public.deal_products (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references public.deals(id) on delete cascade,
  description       text,
  unit_price        numeric,
  units_available   integer,
  cases_available   integer,
  pallets_available integer,
  expiration_date   date,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

alter table public.deal_products enable row level security;

create policy "Authenticated: read products"
  on public.deal_products for select using (auth.role() = 'authenticated');
create policy "Authenticated: insert products"
  on public.deal_products for insert with check (auth.role() = 'authenticated');
create policy "Authenticated: update products"
  on public.deal_products for update using (auth.role() = 'authenticated');
create policy "Authenticated: delete products"
  on public.deal_products for delete using (auth.role() = 'authenticated');

-- Enable realtime for live updates
alter publication supabase_realtime add table public.deal_products;

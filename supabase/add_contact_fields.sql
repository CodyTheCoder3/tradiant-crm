-- Replace single contact text field with structured contact fields
-- Run this in the Supabase SQL Editor

alter table public.deals
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name  text,
  add column if not exists contact_email      text,
  add column if not exists contact_phone      text;

-- Drop the old single contact column if it exists
alter table public.deals drop column if exists contact;

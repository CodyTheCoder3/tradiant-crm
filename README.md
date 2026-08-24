# Tradiant Deal Pipeline CRM

Orange-on-cream kanban board for managing deals across Open → In Progress → Closed Won / Closed Lost.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

You need `.env.local` in the root (already present; never commit it):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
TEAM_ACCESS_CODE=...
```

## First-time Supabase setup

1. Open your Supabase project → **SQL Editor**
2. Paste and run the contents of `supabase/migration.sql`
3. That creates the `profiles`, `deals`, and `deal_notes` tables, RLS policies, a trigger that auto-creates a profile on signup, and enables realtime.

## Deploying to Vercel

1. Push this repo to GitHub (the `.gitignore` already excludes `.env.local`).
2. Import the repo in Vercel.
3. Add these environment variables in Vercel → Settings → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `TEAM_ACCESS_CODE`
4. Deploy. Add custom domain `crm.gotradiant.com` in Vercel → Domains.

## Deploying updates

```bash
git add -p          # stage only what you want
git commit -m "..."
git push            # Vercel auto-deploys on push to main
```

## Rotating the team access code

1. Update `TEAM_ACCESS_CODE` in Vercel → Environment Variables.
2. Redeploy (Vercel → Deployments → Redeploy, or push a trivial commit).
3. Share the new code with your team. Existing signed-in users are unaffected — the code is only checked at sign-up time.

## Backing up data

In Supabase → **Table Editor** you can export any table as CSV. For a full backup:

```bash
# Using the Supabase CLI (npm i -g supabase)
supabase db dump --project-ref <your-ref> -f backup.sql
```

Or schedule a weekly pg_dump via Supabase's built-in **Database Backups** (Pro plan).

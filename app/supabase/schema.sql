-- Paid Client Access Portal schema reference.
-- Compare with the live Supabase schema before applying to an existing project.

create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price_inr integer not null check (price_inr > 0),
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  zoho_deal_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  document_id uuid not null references public.documents(id),
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed')),
  crm_sync_status text not null default 'pending'
    check (crm_sync_status in ('pending', 'synced', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.document_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  document_id uuid not null references public.documents(id),
  purchase_id uuid not null unique references public.purchases(id),
  granted_at timestamptz not null default now(),
  unique (user_id, document_id)
);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists purchases_user_id_idx
  on public.purchases(user_id);
create index if not exists purchases_document_id_idx
  on public.purchases(document_id);
create index if not exists entitlements_user_document_idx
  on public.document_entitlements(user_id, document_id);

alter table public.documents enable row level security;
alter table public.client_profiles enable row level security;
alter table public.purchases enable row level security;
alter table public.document_entitlements enable row level security;
alter table public.stripe_webhook_events enable row level security;

drop policy if exists "Authenticated users can view documents" on public.documents;
create policy "Authenticated users can view documents"
  on public.documents for select to authenticated
  using (true);

drop policy if exists "Users can view their own profile" on public.client_profiles;
create policy "Users can view their own profile"
  on public.client_profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own purchases" on public.purchases;
create policy "Users can view their own purchases"
  on public.purchases for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own entitlements" on public.document_entitlements;
create policy "Users can view their own entitlements"
  on public.document_entitlements for select to authenticated
  using (auth.uid() = user_id);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.documents to service_role;
grant select, insert, update, delete on table public.client_profiles to service_role;
grant select, insert, update, delete on table public.purchases to service_role;
grant select, insert, update, delete on table public.document_entitlements to service_role;
grant select, insert, update, delete on table public.stripe_webhook_events to service_role;

-- Optional sample row: insert only if this title is not already present.
insert into public.documents (title, description, price_inr, storage_path)
select
  'Sample Business Document',
  'A sample document for the paid access assessment.',
  499,
  'sample-documents/business-sample.pdf'
where not exists (
  select 1 from public.documents
  where title = 'Sample Business Document'
);

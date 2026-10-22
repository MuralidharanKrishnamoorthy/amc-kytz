-- AMC Desk schema. Run once in the Supabase SQL editor.
--
--   clients 1─N sites 1─N contracts
--                 │          ├─N contract_scope_items       → scope_items
--                 │          ├─N contract_reminder_offsets  → reminder_offsets
--                 │          └─N contract_reminder_channels → reminder_channels
--                 ├─N assets      → asset_types, parties
--                 └─N access_refs → account_types, parties
--
-- Every dropdown / checkbox list in the form is a lookup table. Its primary key
-- is the value shown in the form; sort_order keeps the order of the design.

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------

create table if not exists public.platforms (
  name       text primary key,
  sort_order smallint not null default 0
);

create table if not exists public.plans (
  name       text primary key,
  sort_order smallint not null default 0
);

create table if not exists public.critical_response_times (
  name       text primary key,
  sort_order smallint not null default 0
);

create table if not exists public.normal_response_times (
  name       text primary key,
  sort_order smallint not null default 0
);

create table if not exists public.gst_rates (
  rate       numeric(5,2) primary key check (rate >= 0),
  sort_order smallint not null default 0
);

create table if not exists public.billing_cycles (
  name       text primary key,
  sort_order smallint not null default 0
);

create table if not exists public.scope_items (
  name       text primary key,
  sort_order smallint not null default 0
);

create table if not exists public.asset_types (
  name       text primary key,
  sort_order smallint not null default 0
);

-- "Owned / paid by" and "2FA held by".
create table if not exists public.parties (
  name       text primary key,
  sort_order smallint not null default 0
);

create table if not exists public.account_types (
  name       text primary key,
  sort_order smallint not null default 0
);

create table if not exists public.password_rotation_periods (
  months     smallint primary key check (months > 0),
  sort_order smallint not null default 0
);

create table if not exists public.reminder_offsets (
  days       smallint primary key check (days > 0),
  sort_order smallint not null default 0
);

create table if not exists public.reminder_channels (
  name       text primary key,
  sort_order smallint not null default 0
);

-- ---------------------------------------------------------------------------
-- 1 · Client & site
-- ---------------------------------------------------------------------------

create table if not exists public.clients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) > 0),
  gstin          text,
  contact_person text,
  email          text,
  phone          text
);

create unique index if not exists clients_name_key on public.clients (lower(name));

create table if not exists public.sites (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references public.clients (id) on delete restrict,
  website_url              text not null,
  platform                 text not null references public.platforms (name) on update cascade,
  -- 5 · "Rotate passwords every"
  password_rotation_months smallint references public.password_rotation_periods (months) on update cascade
);

create unique index if not exists sites_website_url_key on public.sites (lower(website_url));
create index if not exists sites_client_idx on public.sites (client_id);

-- ---------------------------------------------------------------------------
-- 2 · Contract, scope & SLA  +  3 · Billing  +  6 · Reminders
-- ---------------------------------------------------------------------------

create table if not exists public.contracts (
  id                        uuid primary key default gen_random_uuid(),
  site_id                   uuid not null references public.sites (id) on delete restrict,
  plan                      text not null references public.plans (name) on update cascade,
  start_date                date not null,
  end_date                  date not null,
  hours_quota               numeric(6,2) check (hours_quota >= 0),
  critical_response         text not null references public.critical_response_times (name) on update cascade,
  normal_response           text not null references public.normal_response_times (name) on update cascade,
  content_updates_per_month integer check (content_updates_per_month >= 0),
  exclusions                text,
  agreement_path            text,
  annual_fee                numeric(12,2) not null check (annual_fee >= 0),
  gst_rate                  numeric(5,2) not null references public.gst_rates (rate) on update cascade,
  billing_cycle             text not null references public.billing_cycles (name) on update cascade,
  renewal_increase_pct      numeric(5,2) check (renewal_increase_pct between 0 and 100),
  out_of_scope_rate         numeric(10,2) check (out_of_scope_rate >= 0),
  -- 3 · "Create recurring invoices in Zoho Books automatically"
  zoho_recurring            boolean not null default false,
  notify_client             boolean not null default false,
  constraint contracts_dates_chk check (end_date > start_date)
);

create index if not exists contracts_site_idx on public.contracts (site_id);
create index if not exists contracts_end_date_idx on public.contracts (end_date);

-- "Included in scope" checkboxes
create table if not exists public.contract_scope_items (
  contract_id uuid not null references public.contracts (id) on delete cascade,
  scope_item  text not null references public.scope_items (name) on update cascade,
  primary key (contract_id, scope_item)
);

-- "60 days before / 30 / 15 / 7 days" checkboxes
create table if not exists public.contract_reminder_offsets (
  contract_id uuid not null references public.contracts (id) on delete cascade,
  days        smallint not null references public.reminder_offsets (days) on update cascade,
  primary key (contract_id, days)
);

-- "Email / WhatsApp / Create task in Todoist" checkboxes
create table if not exists public.contract_reminder_channels (
  contract_id uuid not null references public.contracts (id) on delete cascade,
  channel     text not null references public.reminder_channels (name) on update cascade,
  primary key (contract_id, channel)
);

-- ---------------------------------------------------------------------------
-- 4 · Domain, hosting, SSL & licenses
-- ---------------------------------------------------------------------------

create table if not exists public.assets (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  asset_type  text not null references public.asset_types (name) on update cascade,
  provider    text,
  owned_by    text not null references public.parties (name) on update cascade,
  expiry_date date not null,
  auto_renew  boolean not null default false
);

create index if not exists assets_site_idx on public.assets (site_id);
create index if not exists assets_expiry_idx on public.assets (expiry_date);

-- ---------------------------------------------------------------------------
-- 5 · Access references
-- ---------------------------------------------------------------------------

create table if not exists public.access_refs (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.sites (id) on delete cascade,
  account_type   text not null references public.account_types (name) on update cascade,
  login          text,
  vault_url      text,
  two_fa_held_by text references public.parties (name) on update cascade
);

create index if not exists access_refs_site_idx on public.access_refs (site_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- The API uses the service-role key, which bypasses RLS. RLS with no policies
-- keeps the public anon key from reading or writing anything.
-- ---------------------------------------------------------------------------

alter table public.platforms                  enable row level security;
alter table public.plans                      enable row level security;
alter table public.critical_response_times    enable row level security;
alter table public.normal_response_times      enable row level security;
alter table public.gst_rates                  enable row level security;
alter table public.billing_cycles             enable row level security;
alter table public.scope_items                enable row level security;
alter table public.asset_types                enable row level security;
alter table public.parties                    enable row level security;
alter table public.account_types              enable row level security;
alter table public.password_rotation_periods  enable row level security;
alter table public.reminder_offsets           enable row level security;
alter table public.reminder_channels          enable row level security;
alter table public.clients                    enable row level security;
alter table public.sites                      enable row level security;
alter table public.contracts                  enable row level security;
alter table public.contract_scope_items       enable row level security;
alter table public.contract_reminder_offsets  enable row level security;
alter table public.contract_reminder_channels enable row level security;
alter table public.assets                     enable row level security;
alter table public.access_refs                enable row level security;

-- ---------------------------------------------------------------------------
-- create_amc: creates (or reuses) the client and site, then the contract with
-- its scope, reminders, assets and access references — all in one
-- transaction. Returns the new contract id.
-- ---------------------------------------------------------------------------

create or replace function public.create_amc(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c             jsonb := payload -> 'client';
  s             jsonb := payload -> 'site';
  k             jsonb := payload -> 'contract';
  v_client_id   uuid;
  v_site_id     uuid;
  v_site_client uuid;
  v_contract_id uuid;
begin
  -- Client: matched by name, case-insensitive.
  select id into v_client_id from clients where lower(name) = lower(trim(c ->> 'name'));

  if v_client_id is null then
    insert into clients (name, gstin, contact_person, email, phone)
    values (
      trim(c ->> 'name'),
      nullif(c ->> 'gstin', ''),
      nullif(c ->> 'contact_person', ''),
      nullif(c ->> 'email', ''),
      nullif(c ->> 'phone', '')
    )
    returning id into v_client_id;
  else
    update clients set
      gstin          = coalesce(nullif(c ->> 'gstin', ''), gstin),
      contact_person = coalesce(nullif(c ->> 'contact_person', ''), contact_person),
      email          = coalesce(nullif(c ->> 'email', ''), email),
      phone          = coalesce(nullif(c ->> 'phone', ''), phone)
    where id = v_client_id;
  end if;

  -- Site: matched by URL, case-insensitive. A URL can belong to one client only.
  select id, client_id into v_site_id, v_site_client
  from sites where lower(website_url) = lower(s ->> 'website_url');

  if v_site_id is null then
    insert into sites (client_id, website_url, platform, password_rotation_months)
    values (
      v_client_id,
      s ->> 'website_url',
      s ->> 'platform',
      (s ->> 'password_rotation_months')::smallint
    )
    returning id into v_site_id;
  elsif v_site_client <> v_client_id then
    raise exception 'Website is registered to another client'
      using errcode = 'P0001', hint = 'site_client_mismatch';
  else
    update sites set
      platform                 = s ->> 'platform',
      password_rotation_months = coalesce((s ->> 'password_rotation_months')::smallint, password_rotation_months)
    where id = v_site_id;
  end if;

  insert into contracts (
    site_id, plan, start_date, end_date, hours_quota, critical_response,
    normal_response, content_updates_per_month, exclusions, agreement_path,
    annual_fee, gst_rate, billing_cycle, renewal_increase_pct,
    out_of_scope_rate, zoho_recurring, notify_client
  )
  values (
    v_site_id,
    k ->> 'plan',
    (k ->> 'start_date')::date,
    (k ->> 'end_date')::date,
    (k ->> 'hours_quota')::numeric,
    k ->> 'critical_response',
    k ->> 'normal_response',
    (k ->> 'content_updates_per_month')::integer,
    nullif(k ->> 'exclusions', ''),
    nullif(k ->> 'agreement_path', ''),
    (k ->> 'annual_fee')::numeric,
    (k ->> 'gst_rate')::numeric,
    k ->> 'billing_cycle',
    (k ->> 'renewal_increase_pct')::numeric,
    (k ->> 'out_of_scope_rate')::numeric,
    coalesce((k ->> 'zoho_recurring')::boolean, false),
    coalesce((k ->> 'notify_client')::boolean, false)
  )
  returning id into v_contract_id;

  insert into contract_scope_items (contract_id, scope_item)
  select v_contract_id, value
  from jsonb_array_elements_text(coalesce(k -> 'scope', '[]'::jsonb));

  insert into contract_reminder_offsets (contract_id, days)
  select v_contract_id, value::smallint
  from jsonb_array_elements_text(coalesce(k -> 'reminder_days', '[]'::jsonb));

  insert into contract_reminder_channels (contract_id, channel)
  select v_contract_id, value
  from jsonb_array_elements_text(coalesce(k -> 'reminder_channels', '[]'::jsonb));

  insert into assets (site_id, asset_type, provider, owned_by, expiry_date, auto_renew)
  select v_site_id,
         a ->> 'asset_type',
         nullif(a ->> 'provider', ''),
         a ->> 'owned_by',
         (a ->> 'expiry_date')::date,
         coalesce((a ->> 'auto_renew')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'assets', '[]'::jsonb)) a;

  insert into access_refs (site_id, account_type, login, vault_url, two_fa_held_by)
  select v_site_id,
         r ->> 'account_type',
         nullif(r ->> 'login', ''),
         nullif(r ->> 'vault_url', ''),
         nullif(r ->> 'two_fa_held_by', '')
  from jsonb_array_elements(coalesce(payload -> 'access_refs', '[]'::jsonb)) r;

  return v_contract_id;
end;
$$;

revoke all on function public.create_amc(jsonb) from public, anon, authenticated;
grant execute on function public.create_amc(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Seed data: only the values shown in the design screenshots, plus the
-- platform list from the project sheet. Add rows when the full lists are
-- confirmed.
-- ---------------------------------------------------------------------------

insert into platforms (name, sort_order) values
  ('HTML, JS', 1), ('WordPress', 2), ('PHP', 3), ('Shopify', 4), ('Astro', 5)
on conflict (name) do nothing;

insert into plans (name, sort_order) values
  ('Standard', 1)
on conflict (name) do nothing;

insert into critical_response_times (name, sort_order) values
  ('4 hours', 1)
on conflict (name) do nothing;

insert into normal_response_times (name, sort_order) values
  ('2 working days', 1)
on conflict (name) do nothing;

insert into gst_rates (rate, sort_order) values
  (18, 1)
on conflict (rate) do nothing;

insert into billing_cycles (name, sort_order) values
  ('Quarterly', 1)
on conflict (name) do nothing;

insert into scope_items (name, sort_order) values
  ('Core & plugin updates', 1),
  ('Daily backups',         2),
  ('Security monitoring',   3),
  ('Uptime monitoring',     4),
  ('Bug fixes',             5),
  ('Content updates',       6),
  ('Monthly client report', 7),
  ('Speed optimisation',    8)
on conflict (name) do nothing;

insert into asset_types (name, sort_order) values
  ('Domain', 1), ('Hosting', 2), ('SSL', 3), ('License', 4)
on conflict (name) do nothing;

insert into parties (name, sort_order) values
  ('Client', 1), ('Agency', 2)
on conflict (name) do nothing;

insert into account_types (name, sort_order) values
  ('Registrar', 1), ('Hosting panel', 2)
on conflict (name) do nothing;

insert into password_rotation_periods (months, sort_order) values
  (6, 1)
on conflict (months) do nothing;

insert into reminder_offsets (days, sort_order) values
  (60, 1), (30, 2), (15, 3), (7, 4)
on conflict (days) do nothing;

insert into reminder_channels (name, sort_order) values
  ('Email', 1), ('WhatsApp', 2), ('Create task in Todoist', 3)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Storage bucket for signed agreements (private).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('agreements', 'agreements', false)
on conflict (id) do nothing;

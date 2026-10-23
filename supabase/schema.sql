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

create table if not exists public.renewal_increase_rates (
  pct        numeric(5,2) primary key check (pct between 0 and 100),
  sort_order smallint not null default 0
);

create table if not exists public.out_of_scope_rates (
  rate       numeric(10,2) primary key check (rate >= 0),
  sort_order smallint not null default 0
);

-- How often a scope item is done; the form groups the checkboxes by this.
create table if not exists public.scope_frequencies (
  name       text primary key,
  sort_order smallint not null default 0
);

-- The sheet's headings; items are listed under them inside each frequency.
create table if not exists public.scope_categories (
  name       text primary key,
  sort_order smallint not null default 0
);

create table if not exists public.scope_items (
  name       text primary key,
  frequency  text references public.scope_frequencies (name) on update cascade,
  category   text references public.scope_categories (name) on update cascade,
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
  renewal_increase_pct      numeric(5,2) references public.renewal_increase_rates (pct) on update cascade,
  out_of_scope_rate         numeric(10,2) references public.out_of_scope_rates (rate) on update cascade,
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
  -- Owner and expiry are optional (e.g. hosting known only by its provider).
  owned_by    text references public.parties (name) on update cascade,
  expiry_date date,
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
alter table public.renewal_increase_rates     enable row level security;
alter table public.out_of_scope_rates         enable row level security;
alter table public.scope_frequencies          enable row level security;
alter table public.scope_categories           enable row level security;
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
-- update_amc: edits an existing AMC — its client, website, contract (with
-- scope and reminders), and the website's domain/hosting and access rows —
-- in one transaction. List rows are replaced with exactly what the form
-- sent. Returns the contract id.
-- Raises (hint): contract_not_found, client_name_taken, site_url_taken.
-- ---------------------------------------------------------------------------

create or replace function public.update_amc(p_contract_id uuid, payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c           jsonb := payload -> 'client';
  s           jsonb := payload -> 'site';
  k           jsonb := payload -> 'contract';
  v_site_id   uuid;
  v_client_id uuid;
begin
  select ct.site_id, st.client_id into v_site_id, v_client_id
  from contracts ct join sites st on st.id = ct.site_id
  where ct.id = p_contract_id
  for update of ct, st;

  if v_site_id is null then
    raise exception 'AMC not found' using errcode = 'P0001', hint = 'contract_not_found';
  end if;

  -- Client: renaming to another client's name would merge two clients; refuse.
  if exists (
    select 1 from clients
    where lower(name) = lower(trim(c ->> 'name')) and id <> v_client_id
  ) then
    raise exception 'Another client already has this name'
      using errcode = 'P0001', hint = 'client_name_taken';
  end if;

  update clients set
    name           = trim(c ->> 'name'),
    gstin          = nullif(c ->> 'gstin', ''),
    contact_person = nullif(c ->> 'contact_person', ''),
    email          = nullif(c ->> 'email', ''),
    phone          = nullif(c ->> 'phone', '')
  where id = v_client_id;

  -- Website: a URL can belong to one website only.
  if exists (
    select 1 from sites
    where lower(website_url) = lower(s ->> 'website_url') and id <> v_site_id
  ) then
    raise exception 'Website is registered to another AMC'
      using errcode = 'P0001', hint = 'site_url_taken';
  end if;

  update sites set
    website_url              = s ->> 'website_url',
    platform                 = s ->> 'platform',
    password_rotation_months = (s ->> 'password_rotation_months')::smallint
  where id = v_site_id;

  update contracts set
    plan                      = k ->> 'plan',
    start_date                = (k ->> 'start_date')::date,
    end_date                  = (k ->> 'end_date')::date,
    hours_quota               = (k ->> 'hours_quota')::numeric,
    critical_response         = k ->> 'critical_response',
    normal_response           = k ->> 'normal_response',
    content_updates_per_month = (k ->> 'content_updates_per_month')::integer,
    exclusions                = nullif(k ->> 'exclusions', ''),
    agreement_path            = nullif(k ->> 'agreement_path', ''),
    annual_fee                = (k ->> 'annual_fee')::numeric,
    gst_rate                  = (k ->> 'gst_rate')::numeric,
    billing_cycle             = k ->> 'billing_cycle',
    renewal_increase_pct      = (k ->> 'renewal_increase_pct')::numeric,
    out_of_scope_rate         = (k ->> 'out_of_scope_rate')::numeric,
    zoho_recurring            = coalesce((k ->> 'zoho_recurring')::boolean, false),
    notify_client             = coalesce((k ->> 'notify_client')::boolean, false)
  where id = p_contract_id;

  delete from contract_scope_items where contract_id = p_contract_id;
  insert into contract_scope_items (contract_id, scope_item)
  select p_contract_id, value
  from jsonb_array_elements_text(coalesce(k -> 'scope', '[]'::jsonb));

  delete from contract_reminder_offsets where contract_id = p_contract_id;
  insert into contract_reminder_offsets (contract_id, days)
  select p_contract_id, value::smallint
  from jsonb_array_elements_text(coalesce(k -> 'reminder_days', '[]'::jsonb));

  delete from contract_reminder_channels where contract_id = p_contract_id;
  insert into contract_reminder_channels (contract_id, channel)
  select p_contract_id, value
  from jsonb_array_elements_text(coalesce(k -> 'reminder_channels', '[]'::jsonb));

  delete from assets where site_id = v_site_id;
  insert into assets (site_id, asset_type, provider, owned_by, expiry_date, auto_renew)
  select v_site_id,
         a ->> 'asset_type',
         nullif(a ->> 'provider', ''),
         nullif(a ->> 'owned_by', ''),
         (a ->> 'expiry_date')::date,
         coalesce((a ->> 'auto_renew')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'assets', '[]'::jsonb)) a;

  delete from access_refs where site_id = v_site_id;
  insert into access_refs (site_id, account_type, login, vault_url, two_fa_held_by)
  select v_site_id,
         r ->> 'account_type',
         nullif(r ->> 'login', ''),
         nullif(r ->> 'vault_url', ''),
         nullif(r ->> 'two_fa_held_by', '')
  from jsonb_array_elements(coalesce(payload -> 'access_refs', '[]'::jsonb)) r;

  return p_contract_id;
end;
$$;

revoke all on function public.update_amc(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_amc(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Seed data: only the values shown in the design screenshots, plus the
-- platform list from the project sheet. Add rows when the full lists are
-- confirmed.
-- ---------------------------------------------------------------------------

insert into platforms (name, sort_order) values
  ('HTML, JS', 1), ('WordPress', 2), ('PHP', 3), ('Shopify', 4), ('Astro', 5)
on conflict (name) do nothing;

insert into plans (name, sort_order) values
  ('Plan A', 1), ('Plan B', 2), ('Plan C', 3)
on conflict (name) do nothing;

insert into critical_response_times (name, sort_order) values
  ('4 hours', 1), ('8 hours', 2)
on conflict (name) do nothing;

insert into normal_response_times (name, sort_order) values
  ('Weekdays, Saturdays', 1), ('Only weekdays', 2)
on conflict (name) do nothing;

-- Which Normal response options each plan allows (form filters by plan).
create table if not exists public.plan_normal_responses (
  plan            text not null references public.plans (name) on update cascade on delete cascade,
  normal_response text not null references public.normal_response_times (name) on update cascade on delete cascade,
  primary key (plan, normal_response)
);

insert into public.plan_normal_responses (plan, normal_response) values
  ('Plan A', 'Weekdays, Saturdays'),
  ('Plan B', 'Weekdays, Saturdays'),
  ('Plan C', 'Only weekdays')
on conflict do nothing;

alter table public.plan_normal_responses enable row level security;

insert into gst_rates (rate, sort_order) values
  (18, 1)
on conflict (rate) do nothing;

insert into billing_cycles (name, sort_order) values
  ('Monthly', 1), ('Yearly', 2)
on conflict (name) do nothing;

insert into renewal_increase_rates (pct, sort_order) values
  (5, 1), (10, 2)
on conflict (pct) do nothing;

insert into out_of_scope_rates (rate, sort_order) values
  (500, 1), (1000, 2), (1500, 3)
on conflict (rate) do nothing;

insert into public.scope_frequencies (name, sort_order) values
  ('Half Yearly Once', 1), ('Monthly Once', 2), ('Quarterly Once', 3)
on conflict (name) do nothing;

insert into public.scope_categories (name, sort_order) values
  ('Technical Maintenance', 1), ('Content Update', 2), ('Support & Consultation', 3), ('SEO Updates', 4)
on conflict (name) do nothing;

insert into public.scope_items (name, frequency, sort_order) values
  ('Malware Scanning',                              'Half Yearly Once',  1),
  ('Plugin / Version Update (if any)',              'Half Yearly Once',  2),
  ('Bug Fixes (due to plugin / version update)',    'Half Yearly Once',  3),
  ('Functionality Audit',                           'Half Yearly Once',  4),
  ('Scheduled Backups',                             'Half Yearly Once',  5),
  ('Website Speed Check',                           'Half Yearly Once',  6),
  ('Page Speed Improvement',                        'Half Yearly Once',  7),
  ('Hosting / Server Up-to-date Check',             'Half Yearly Once',  8),
  ('Active SSL Certificate Check',                  'Half Yearly Once',  9),
  ('Uptime Monitoring Report',                      'Monthly Once',     10),
  ('Recommendations',                               'Half Yearly Once', 11),
  ('Content Updates',                               'Monthly Once',     12),
  ('Image / Video Updates',                         'Monthly Once',     13),
  ('Banner Image Updates',                          'Monthly Once',     14),
  ('New Article Updates & Formatting Optimisation', 'Monthly Once',     15),
  ('Blog Content Update',                           'Monthly Once',     16),
  ('Performance Review Discussion',                 'Quarterly Once',   17),
  ('Strategy Calls for Improvements',               'Quarterly Once',   18),
  ('Meta Tags & Alt Text Updates',                  'Quarterly Once',   22),
  ('Internal Linking Updates',                      'Quarterly Once',   23),
  ('Keyword Updates on Pages',                      'Quarterly Once',   24),
  ('SEO Reports',                                   'Quarterly Once',   25),
  ('SEO Recommendations',                           'Quarterly Once',   26)
on conflict (name) do nothing;

update public.scope_items set category = 'Technical Maintenance'
where sort_order between 1 and 11;
update public.scope_items set category = 'Content Update'
where sort_order between 12 and 16;
update public.scope_items set category = 'Support & Consultation'
where sort_order between 17 and 18;
update public.scope_items set category = 'SEO Updates'
where sort_order between 22 and 26;

insert into asset_types (name, sort_order) values
  ('Domain', 1), ('Hosting', 2), ('SSL', 3), ('License', 4)
on conflict (name) do nothing;

insert into parties (name, sort_order) values
  ('Client', 1), ('Venzo / kytz', 2)
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
-- Health and renewals (filled later from monitoring and the renewal workflow)
-- ---------------------------------------------------------------------------

-- Renewal stages (master list). Matches the design's renewal pipeline.
create table if not exists public.renewal_statuses (
  name       text primary key,
  sort_order smallint not null default 0
);

insert into public.renewal_statuses (name, sort_order) values
  ('Quote not sent', 1), ('Quote sent', 2), ('Negotiating', 3), ('Renewed', 4), ('Lost', 5)
on conflict (name) do nothing;

-- One renewal per contract: Renewal card → Status, Proposed fee, Upsell notes.
create table if not exists public.renewals (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null unique references public.contracts (id) on delete cascade,
  status        text not null default 'Quote not sent'
                  references public.renewal_statuses (name) on update cascade,
  -- Agreed / quoted fee; when empty the page shows the formula
  -- annual fee × (1 + renewal increase %).
  proposed_fee  numeric(12,2) check (proposed_fee >= 0),
  upsell_notes  text,
  quote_sent_on date,
  closed_on     date,
  lost_reason   text
);

-- Latest health snapshot per website: Health card, "Site down" badge and the
-- WordPress / PHP versions in the page header.
create table if not exists public.site_health (
  site_id              uuid primary key references public.sites (id) on delete cascade,
  is_up                boolean,
  down_since           timestamptz,
  uptime_30d_pct       numeric(5,2) check (uptime_30d_pct between 0 and 100),
  last_backup_at       timestamptz,
  last_restore_test_on date,
  security_scan_result text,
  security_scan_on     date,
  mobile_speed_score   smallint check (mobile_speed_score between 0 and 100),
  cms_version          text,
  php_version          text
);

alter table public.renewal_statuses enable row level security;
alter table public.renewals         enable row level security;
alter table public.site_health      enable row level security;

-- ---------------------------------------------------------------------------
-- Storage bucket for signed agreements (private).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('agreements', 'agreements', false)
on conflict (id) do nothing;

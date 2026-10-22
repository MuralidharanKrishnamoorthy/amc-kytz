-- Adds "Create recurring invoices in Zoho Books automatically" (3 · Billing).
-- Safe to run on the existing database: existing contracts get false.
-- Run once in the Supabase SQL editor.

alter table public.contracts
  add column if not exists zoho_recurring boolean not null default false;

-- create_amc now stores zoho_recurring.
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

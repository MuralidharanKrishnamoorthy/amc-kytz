-- Run ONLY if you already ran an earlier draft of schema.sql.
-- WARNING: permanently deletes these tables and every row in them.
-- Run this first, then run schema.sql.

drop function if exists public.create_amc(jsonb);

drop table if exists
  public.access_refs,
  public.assets,
  public.contract_reminder_channels,
  public.contract_reminder_offsets,
  public.contract_scope_items,
  public.contracts,
  public.sites,
  public.clients,
  public.platforms,
  public.plans,
  public.critical_response_times,
  public.normal_response_times,
  public.gst_rates,
  public.billing_cycles,
  public.scope_items,
  public.asset_types,
  public.parties,
  public.account_types,
  public.password_rotation_periods,
  public.reminder_offsets,
  public.reminder_channels
cascade;

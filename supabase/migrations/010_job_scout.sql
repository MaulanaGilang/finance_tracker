-- Job scout: jobs found for you (company job boards + job-alert emails), scored by your rules.
-- The job-scout Edge Function (service role) fills job_leads; the app reads them through PIN-gated RPCs.
-- Marking a lead Applied creates the job application, so it moves straight to Applications.

-- Company job boards that publish an open feed (checked by hand: each has jobs located in Indonesia)
create table public.job_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ats text not null check (ats in ('greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters')),
  slug text not null,
  enabled boolean not null default true,
  last_scanned_at timestamptz,
  last_error text,
  last_found int,
  unique (ats, slug)
);

create table public.job_leads (
  id uuid primary key default gen_random_uuid(),
  -- greenhouse, lever, ashby, workable, smartrecruiters, linkedin, jobstreet, glints
  source text not null,
  source_job_id text not null,
  company text not null,
  title text not null,
  location text,
  url text,
  description text,
  -- false when only an email card was seen (title, company, location): rules then run on those alone
  description_read boolean not null default false,
  salary_min numeric(14,0),
  salary_max numeric(14,0),
  employment_type text,
  posted_at timestamptz,
  -- Your rules' verdict: first (best), apply, maybe, skip
  tier text not null check (tier in ('first', 'apply', 'maybe', 'skip')),
  score numeric(6,1) not null default 0,
  note text,
  flags jsonb not null default '[]',
  reasons jsonb not null default '[]',
  status text not null default 'new' check (status in ('new', 'applied', 'skipped')),
  application_id uuid references public.job_applications(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_job_id)
);
create index job_leads_status_idx on public.job_leads (status, first_seen_at desc);

-- Shared key the Gmail script sends with each batch of alert emails
create table public.job_scout_settings (
  id int primary key default 1 check (id = 1),
  ingest_key text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.job_scout_settings default values;

alter table public.job_companies enable row level security;
alter table public.job_leads enable row level security;
alter table public.job_scout_settings enable row level security;
revoke all on public.job_companies, public.job_leads, public.job_scout_settings from anon, authenticated;

-- Leads still to decide on (the daily scan deletes ones older than 24 hours), plus how the scan is doing
create or replace function public.get_job_leads(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(p_token);
  return jsonb_build_object(
    'leads', coalesce((select jsonb_agg(to_jsonb(l) - 'description' order by l.first_seen_at desc)
                       from public.job_leads l
                       where l.status in ('new', 'skipped')), '[]'::jsonb),
    'companies', (select count(*) from public.job_companies where enabled),
    'last_scan', (select max(last_scanned_at) from public.job_companies),
    'last_email', (select max(first_seen_at) from public.job_leads where source in ('linkedin', 'jobstreet', 'glints'))
  );
end $$;

-- Skip a lead, or bring it back
create or replace function public.set_job_lead_status(p_token text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(p_token);
  if p_status not in ('new', 'skipped') then raise exception 'bad_status'; end if;
  update public.job_leads set status = p_status, updated_at = now() where id = p_id;
end $$;

-- Applied: create the application (status Applied, today) and close the lead. Returns the application.
create or replace function public.apply_job_lead(p_token text, p_id uuid)
returns public.job_applications language plpgsql security definer set search_path = '' as $$
declare
  l public.job_leads;
  r public.job_applications;
begin
  perform private.require_session(p_token);
  select * into l from public.job_leads where id = p_id for update;
  if l.id is null then raise exception 'not_found'; end if;
  if l.application_id is not null then
    select * into r from public.job_applications where id = l.application_id;
    if r.id is not null then return r; end if;
  end if;
  insert into public.job_applications (position, company, location, category, flexibility, status, platform, link,
    salary_min, salary_max, applied_date, status_changed_at)
  values (l.title, l.company, l.location,
    case when l.employment_type ilike '%contract%' then 'contract' when l.employment_type ilike '%part%' then 'part_time' else 'full_time' end,
    case when l.location ilike '%remote%' then 'remote' when l.location ilike '%hybrid%' then 'hybrid' else 'onsite' end,
    'applied',
    case l.source when 'linkedin' then 'LinkedIn' when 'jobstreet' then 'JobStreet' when 'glints' then 'Glints' else 'Company website' end,
    l.url, l.salary_min, l.salary_max, current_date, now())
  returning * into r;
  update public.job_leads set status = 'applied', application_id = r.id, updated_at = now() where id = p_id;
  return r;
end $$;

revoke execute on function public.get_job_leads(text), public.set_job_lead_status(text, uuid, text), public.apply_job_lead(text, uuid) from public, authenticated;
grant execute on function public.get_job_leads(text), public.set_job_lead_status(text, uuid, text), public.apply_job_lead(text, uuid) to anon;

insert into public.job_companies (name, ats, slug) values
  ('Amartha', 'workable', 'amartha'), ('Ajaib', 'workable', 'ajaib'),
  ('Grab', 'smartrecruiters', 'grab'), ('Alodokter', 'smartrecruiters', 'alodokter'), ('GudangAda', 'smartrecruiters', 'gudangada'),
  ('BukuWarung', 'smartrecruiters', 'bukuwarung'), ('Stockbit', 'smartrecruiters', 'stockbit'), ('Sayurbox', 'smartrecruiters', 'sayurbox'),
  ('PasarPolis', 'smartrecruiters', 'pasarpolis'), ('Dekoruma', 'smartrecruiters', 'dekoruma'), ('Julo', 'smartrecruiters', 'julo'),
  ('EKRUT', 'smartrecruiters', 'ekrut'),
  ('Lamudi', 'lever', 'lamudi'), ('Ninja Van', 'lever', 'ninjavan'), ('Lalamove', 'lever', 'lalamove'),
  ('Xendit', 'greenhouse', 'xendit'), ('Binance', 'greenhouse', 'binance'), ('OKX', 'greenhouse', 'okx'),
  ('Elastic', 'greenhouse', 'elastic'), ('Datadog', 'greenhouse', 'datadog'), ('Braze', 'greenhouse', 'braze'),
  ('Snowflake', 'ashby', 'snowflake'), ('Airwallex', 'ashby', 'airwallex');

-- Daily (pg_cron + pg_net), 07:00-07:50 WIB: company boards in batches, ingest is pushed by the Gmail script.
-- select cron.schedule('job-scout-daily', '*/10 0 * * *', $$ select net.http_post(
--   url := 'https://<project>.supabase.co/functions/v1/job-scout',
--   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon key>'),
--   body := '{"action":"scan"}'::jsonb, timeout_milliseconds := 150000) $$);

-- Manga reading list. Same access model as 001: RLS on, no policies, PIN-gated RPCs only.
-- The manga-latest Edge Function (service role) fills in the latest chapter once a week.

create table public.manga_titles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'reading' check (status in ('reading', 'completed')),
  -- Chapters can be fractional (61.5, 18.1)
  last_read numeric(10,3),
  link text,
  notes text,

  -- Which series the checker matched. A manual pick (match_locked) is never re-searched.
  mangadex_id text,
  mu_id text,
  matched_title text,
  match_locked boolean not null default false,

  -- Newest chapter found, and where: MangaDex (English) or MangaUpdates (latest release it tracks)
  latest_chapter numeric(10,3),
  latest_source text check (latest_source in ('mangadex', 'mangaupdates')),
  latest_url text,
  -- Publisher status from the source: ongoing, completed, hiatus, cancelled
  series_status text,
  check_status text not null default 'pending' check (check_status in ('pending', 'ok', 'not_found', 'failed')),
  checked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index manga_titles_check_idx on public.manga_titles (status, checked_at nulls first);

alter table public.manga_titles enable row level security;
revoke all on public.manga_titles from anon, authenticated;

create or replace function public.get_manga(p_token text)
returns setof public.manga_titles language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(p_token);
  return query select * from public.manga_titles order by lower(title);
end $$;

-- p_manga: { id?, title, status, last_read, link, notes, mangadex_id?, mu_id?, matched_title?, match_locked? }
-- The match fields are only changed when the key is present, so a plain edit keeps the checker's match.
create or replace function public.save_manga(p_token text, p_manga jsonb)
returns public.manga_titles language plpgsql security definer set search_path = '' as $$
declare
  r public.manga_titles;
  v_id uuid := nullif(p_manga->>'id', '')::uuid;
  v_rematch boolean := p_manga ? 'mangadex_id' or p_manga ? 'mu_id';
begin
  perform private.require_session(p_token);
  if v_id is null then
    insert into public.manga_titles (title, status, last_read, link, notes, mangadex_id, mu_id, matched_title, match_locked)
    values (trim(p_manga->>'title'), coalesce(nullif(p_manga->>'status', ''), 'reading'),
      nullif(p_manga->>'last_read', '')::numeric, nullif(trim(p_manga->>'link'), ''), nullif(trim(p_manga->>'notes'), ''),
      nullif(p_manga->>'mangadex_id', ''), nullif(p_manga->>'mu_id', ''), nullif(p_manga->>'matched_title', ''),
      coalesce((p_manga->>'match_locked')::boolean, false))
    returning * into r;
  else
    update public.manga_titles m set
      -- a new title means the old match is probably wrong: search again unless a match was picked by hand
      mangadex_id = case when v_rematch then nullif(p_manga->>'mangadex_id', '')
                         when trim(p_manga->>'title') is distinct from m.title and not m.match_locked then null else m.mangadex_id end,
      mu_id = case when v_rematch then nullif(p_manga->>'mu_id', '')
                   when trim(p_manga->>'title') is distinct from m.title and not m.match_locked then null else m.mu_id end,
      matched_title = case when v_rematch then nullif(p_manga->>'matched_title', '')
                           when trim(p_manga->>'title') is distinct from m.title and not m.match_locked then null else m.matched_title end,
      match_locked = case when v_rematch then coalesce((p_manga->>'match_locked')::boolean, true) else m.match_locked end,
      check_status = case when v_rematch or (trim(p_manga->>'title') is distinct from m.title and not m.match_locked) then 'pending' else m.check_status end,
      title = trim(p_manga->>'title'),
      status = p_manga->>'status',
      last_read = nullif(p_manga->>'last_read', '')::numeric,
      link = nullif(trim(p_manga->>'link'), ''),
      notes = nullif(trim(p_manga->>'notes'), ''),
      updated_at = now()
    where m.id = v_id returning * into r;
  end if;
  return r;
end $$;

create or replace function public.delete_manga(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(p_token);
  delete from public.manga_titles where id = p_id;
end $$;

revoke execute on function public.get_manga(text), public.save_manga(text, jsonb), public.delete_manga(text, uuid) from public, authenticated;
grant execute on function public.get_manga(text), public.save_manga(text, jsonb), public.delete_manga(text, uuid) to anon;

-- Weekly check (pg_cron + pg_net): Mondays from 02:00 UTC (09:00 WIB), every 10 minutes for 2 hours.
-- Each run checks up to 25 titles not checked in the last 5 days, so ~300 titles fit in one morning.
-- select cron.schedule('manga-latest-weekly', '*/10 2-3 * * 1', $$ select net.http_post(
--   url := 'https://<project>.supabase.co/functions/v1/manga-latest',
--   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon key>'),
--   body := '{"action":"check"}'::jsonb, timeout_milliseconds := 120000) $$);

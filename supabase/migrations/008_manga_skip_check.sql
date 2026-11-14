-- Titles the checker can't confirm are flagged and left out of the weekly check.
-- The manga-latest function sets skip_check when a title isn't found, has no chapter data, or the
-- latest chapter it finds is below where you've read. Picking a series by hand clears it.

alter table public.manga_titles add column skip_check boolean not null default false;

-- save_manga: as in 007, plus skip_check (only changed when the key is sent; a new match clears it)
create or replace function public.save_manga(p_token text, p_manga jsonb)
returns public.manga_titles language plpgsql security definer set search_path = '' as $$
declare
  r public.manga_titles;
  v_id uuid := nullif(p_manga->>'id', '')::uuid;
  v_rematch boolean := p_manga ? 'mangadex_id' or p_manga ? 'mu_id';
begin
  perform private.require_session(p_token);
  if v_id is null then
    insert into public.manga_titles (title, status, last_read, link, notes, mangadex_id, mu_id, matched_title, match_locked, skip_check)
    values (trim(p_manga->>'title'), coalesce(nullif(p_manga->>'status', ''), 'reading'),
      nullif(p_manga->>'last_read', '')::numeric, nullif(trim(p_manga->>'link'), ''), nullif(trim(p_manga->>'notes'), ''),
      nullif(p_manga->>'mangadex_id', ''), nullif(p_manga->>'mu_id', ''), nullif(p_manga->>'matched_title', ''),
      coalesce((p_manga->>'match_locked')::boolean, false), coalesce((p_manga->>'skip_check')::boolean, false))
    returning * into r;
  else
    update public.manga_titles m set
      mangadex_id = case when v_rematch then nullif(p_manga->>'mangadex_id', '')
                         when trim(p_manga->>'title') is distinct from m.title and not m.match_locked then null else m.mangadex_id end,
      mu_id = case when v_rematch then nullif(p_manga->>'mu_id', '')
                   when trim(p_manga->>'title') is distinct from m.title and not m.match_locked then null else m.mu_id end,
      matched_title = case when v_rematch then nullif(p_manga->>'matched_title', '')
                           when trim(p_manga->>'title') is distinct from m.title and not m.match_locked then null else m.matched_title end,
      match_locked = case when v_rematch then coalesce((p_manga->>'match_locked')::boolean, true) else m.match_locked end,
      check_status = case when v_rematch or (trim(p_manga->>'title') is distinct from m.title and not m.match_locked) then 'pending' else m.check_status end,
      skip_check = case when v_rematch then false
                        when p_manga ? 'skip_check' then (p_manga->>'skip_check')::boolean else m.skip_check end,
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

revoke execute on function public.save_manga(text, jsonb) from public, authenticated;
grant execute on function public.save_manga(text, jsonb) to anon;

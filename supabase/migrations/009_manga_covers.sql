-- Cover images for the hover preview, from MangaDex (main cover) or MangaUpdates (series image).
-- The manga-latest function fills them: the weekly check refreshes reading titles, and its "covers"
-- action fills every title once (cover_checked_at marks a title as tried, found or not).

alter table public.manga_titles add column cover_url text;
alter table public.manga_titles add column cover_checked_at timestamptz;

-- Both sources refuse to serve covers to other websites (hotlink protection), so the function keeps a
-- copy in a public bucket and cover_url points there. cover_source is the original, so a cover is only
-- downloaded again when the source changes it.
alter table public.manga_titles add column cover_source text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('manga-covers', 'manga-covers', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- 2026-11-14 (data, run once): capitalise the first letter of every word in every title
-- ("juujika no rokunin" -> "Juujika No Rokunin"; letters already in capitals are left alone)
-- with words as (
--   select t.id, w.ord, coalesce(m[1] || upper(m[2]) || m[3], w.word) as word
--   from public.manga_titles t, regexp_split_to_table(t.title, ' ') with ordinality as w(word, ord),
--        lateral (select regexp_match(w.word, '^([^[:alpha:]]*)(.)(.*)$') as m) x
-- ), titled as (select id, string_agg(word, ' ' order by ord) as new_title from words group by id)
-- update public.manga_titles m set title = t.new_title from titled t where m.id = t.id and m.title is distinct from t.new_title;

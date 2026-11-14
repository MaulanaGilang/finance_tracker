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

-- 2026-11-14 (data, run once): capitalise the first letter of every title
-- update public.manga_titles set title = upper(left(title, 1)) || substr(title, 2), updated_at = now()
-- where left(title, 1) <> upper(left(title, 1));

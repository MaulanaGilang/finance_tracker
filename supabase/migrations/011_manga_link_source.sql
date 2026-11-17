-- The latest chapter can now come from the page in a title's own link ("Where you read it"),
-- read before MangaDex and MangaUpdates. Existing rows keep their values.
alter table public.manga_titles drop constraint manga_titles_latest_source_check;
alter table public.manga_titles add constraint manga_titles_latest_source_check
  check (latest_source in ('mangadex', 'mangaupdates', 'link'));

-- NOT YET APPLIED. From the audit on 2026-09-21. Both changes are reversible and neither touches any data.
--
-- Four indexes sit on the user_id columns of the tables that are only ever read by annotation, never by
-- person. Nothing queries them, and every reaction, vote and comment pays to keep them current. Deleting a
-- profile still cascades correctly without them, it simply scans instead, and these tables are small.
drop index if exists public.reactions_user;
drop index if exists public.comment_reactions_user;
drop index if exists public.poll_votes_user;
drop index if exists public.comments_author;

-- Everything about the source is written by whoever published the annotation and kept as one object, with no
-- limit on how big it may be. Every other column a person writes is capped. Sixty four kilobytes is far more
-- than a real source needs, and it fails rather than truncating, so nothing already saved is changed.
-- If this refuses to apply, a row is already over the limit and is worth looking at before forcing it.
alter table public.annotations
  add constraint annotations_source_size check (pg_column_size(source) <= 65536);

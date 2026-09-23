-- A comment can carry a photo or video of the commenter's own, the same as a take can. The file sits in the
-- commenter's folder of the media bucket, and the comment keeps where it is, what kind it is, its size and
-- the words describing it.
-- Additive and nullable, so every comment already saved is untouched.
alter table public.comments
  add column if not exists upload jsonb;

-- A comment may be empty words when it carries a GIF, and now also when it carries a photo or a video.
-- One with none of the three is still refused.
alter table public.comments
  drop constraint if exists comments_body_check;

alter table public.comments
  add constraint comments_body_check
  check (char_length(body) <= 1000 and (char_length(body) >= 1 or gif is not null or upload is not null));

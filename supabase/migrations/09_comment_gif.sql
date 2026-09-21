-- A comment can carry a GIF, the same as a take can. GIPHY's address for it is kept rather than a copy of
-- the file, which is what their terms ask for.
-- Additive and nullable, so every comment already saved is untouched.
alter table public.comments
  add column if not exists gif jsonb;

-- A comment used to need at least one character. One with a GIF and nothing else is a reply too, so the
-- words may now be empty as long as there is a GIF. A comment with neither is still refused.
alter table public.comments
  drop constraint if exists comments_body_check;

alter table public.comments
  add constraint comments_body_check
  check (char_length(body) <= 1000 and (char_length(body) >= 1 or gif is not null));

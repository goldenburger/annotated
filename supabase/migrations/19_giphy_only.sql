-- A GIF is GIPHY's to serve. The extension only ever offers theirs, so any other address in a gif column was written
-- by hand and could be a tracking image logging everyone who reads the annotation (security audit of 2026-09-24).
-- NOT VALID: rows already there are left as they are; every new or edited row is checked.
alter table public.annotations
  add constraint annotations_gif_giphy
  check (gif is null or (gif->>'url') ~ '^https://([a-z0-9-]+\.)?giphy\.com/') not valid;
alter table public.comments
  add constraint comments_gif_giphy
  check (gif is null or (gif->>'url') ~ '^https://([a-z0-9-]+\.)?giphy\.com/') not valid;

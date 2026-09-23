-- From the audit on 2026-09-22. Every other column a person writes has a limit, and these did not, so anyone
-- calling the database directly could store megabytes in one row. The app writes a few hundred bytes to each.
-- The limits fail rather than truncate, so nothing already saved is changed.
--   poll: a question of at most 120 characters and four options of 25. Four kilobytes is ample.
--   gif: GIPHY's address, a preview address, a size and a description. Four kilobytes is ample.
--   upload: a storage path, a kind, a size and a description of at most 200 characters. Two kilobytes.
--   avatar_url: Google's address for a profile picture, which is a few hundred characters.
alter table public.annotations
  add constraint annotations_poll_size check (poll is null or pg_column_size(poll) <= 4096),
  add constraint annotations_gif_size check (gif is null or pg_column_size(gif) <= 4096),
  add constraint annotations_upload_size check (upload is null or pg_column_size(upload) <= 2048);
alter table public.comments
  add constraint comments_gif_size check (gif is null or pg_column_size(gif) <= 4096),
  add constraint comments_upload_size check (upload is null or pg_column_size(upload) <= 2048);
alter table public.profiles
  add constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048);

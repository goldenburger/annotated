-- A take can carry a GIF, the way a message does. GIPHY's address for it is kept rather than a copy of the
-- file, which is what their terms ask for, so this is a small object: the id, two addresses, a size and the
-- words describing it for anyone who cannot see it.
-- Additive and nullable, so every annotation already saved is untouched and older copies of the extension
-- carry on working without knowing this column exists.
alter table public.annotations
  add column if not exists gif jsonb;

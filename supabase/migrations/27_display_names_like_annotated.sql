-- Twelfth audit pass, 2026-09-29. Migration 26 renamed a new account only when its whole name was a reserved word, so
-- "annotated official", "The annotated team" or "аnnotated" (a Cyrillic а) still read as annotated itself. A name that,
-- with look-alike letters read as Latin and everything but letters and digits dropped, contains "annotated" or is one
-- of the reserved words is shown as Reader. Checked live before this: no existing profile matched.
create or replace function public.name_reserved(n text) returns boolean
language sql immutable set search_path to '' as $$
  select coalesce(
    regexp_replace(translate(lower(n), 'аеорсухіјѕԁɡοαεκνρτυχ', 'aeopcyxijsdgoaekvptux'), '[^a-z0-9_]', '', 'g') like '%annotated%'
    or public.handle_reserved(regexp_replace(translate(lower(n), 'аеорсухіјѕԁɡοαεκνρτυχ', 'aeopcyxijsdgoaekvptux'), '[^a-z0-9_]', '', 'g')),
    false);
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  base text;
  candidate text;
  shown text;
  n int := 0;
begin
  base := lower(regexp_replace(coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    'reader'), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 2 then base := 'reader'; end if;
  if public.name_reserved(base) then base := 'reader'; end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) or public.handle_reserved(candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  shown := left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Reader'), 80);
  if public.name_reserved(shown) then shown := 'Reader'; end if;
  insert into public.profiles (id, handle, display_name, avatar_url)
  values (new.id, candidate, shown, coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'));
  return new;
end $$;

-- Any profile already named that way (none when this was written) is renamed too.
update public.profiles set display_name = 'Reader' where public.name_reserved(display_name);

-- A handle is held to the same rule, at sign-up and when changed in the account menu (none matched when written).
alter table public.profiles drop constraint if exists profiles_handle_reserved;
alter table public.profiles add constraint profiles_handle_reserved check (not public.name_reserved(handle));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'reader'), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 2 then base := 'reader'; end if;
  base := left(base, 24); candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) loop n := n + 1; candidate := base || n::text; end loop;
  insert into public.profiles (id, handle, display_name, avatar_url)
  values (new.id, candidate, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Reader'), 80),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'));
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
alter table public.profiles add constraint profiles_display_name_length check (char_length(display_name) <= 80);
-- (One-time data fix, already applied: existing handles made from email addresses were rebuilt from names.)

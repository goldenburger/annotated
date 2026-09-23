-- From the audit on 2026-09-22. Anyone may file a claim, signed in or not, and nothing limited how many, so a
-- script could file thousands. A claim is rare and deliberate, so the limits are generous for a person and
-- close the door on a flood: ten claims on one annotation in an hour, and thirty across the whole site in a
-- minute. The time a claim was filed is set here rather than trusted from whoever sends it, because a claim
-- dated in the past would slip under both limits.
create or replace function public.claims_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if (select count(*) from public.claims c where c.annotation_id = new.annotation_id and c.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'This annotation has had a lot of claims in the last hour. Try again later.';
  end if;
  if (select count(*) from public.claims c where c.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'A lot of claims are coming in right now. Try again in a minute.';
  end if;
  return new;
end $$;
revoke all on function public.claims_guard() from public, anon, authenticated;
drop trigger if exists claims_guard on public.claims;
create trigger claims_guard before insert on public.claims for each row execute function public.claims_guard();

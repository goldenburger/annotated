-- Features borrowed from X (David, 2026-09-29): a pinned annotation, replies to replies, annotating an annotation,
-- mute and block, a short edit window with an Edited mark, and activity (notifications).

-- 1. A pinned annotation: one per profile, only your own, cleared when it is deleted.
alter table public.profiles add column if not exists pinned_id text references public.annotations(id) on delete set null;
grant update (pinned_id) on public.profiles to authenticated;
create or replace function public.profiles_pin_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pinned_id is not null and new.pinned_id is distinct from old.pinned_id
     and not exists (select 1 from public.annotations a where a.id = new.pinned_id and a.author_id = new.id) then
    raise exception 'You can only pin your own annotation.';
  end if;
  return new;
end $$;
revoke all on function public.profiles_pin_guard() from public, anon, authenticated;
drop trigger if exists profiles_pin_guard on public.profiles;
create trigger profiles_pin_guard before update on public.profiles for each row execute function public.profiles_pin_guard();

-- 2. Replies to replies, one level deep: a reply names the comment it answers, on the same annotation, and that
--    comment is not itself a reply. Deleting a comment takes its replies with it.
alter table public.comments add column if not exists parent_id bigint references public.comments(id) on delete cascade;
create index if not exists comments_parent on public.comments (parent_id) where parent_id is not null;

-- 3. Annotating an annotation: the new one names the one it answers; deleting that one leaves the new one standing.
alter table public.annotations add column if not exists quote_of text references public.annotations(id) on delete set null;
create index if not exists annotations_quote_of on public.annotations (quote_of) where quote_of is not null;
alter table public.annotations drop constraint if exists annotations_quote_not_self;
alter table public.annotations add constraint annotations_quote_not_self check (quote_of is distinct from id);

-- 4. Mute and block. Private: each person sees only their own list. A mute hides someone from you. A block also stops
--    them replying to, reacting to, voting on, quoting or following your work, and ends follows either way.
create table if not exists public.blocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('mute', 'block')),
  created_at timestamptz not null default now(),
  primary key (user_id, target_id),
  check (user_id <> target_id)
);
alter table public.blocks enable row level security;
drop policy if exists "People see their own blocks" on public.blocks;
create policy "People see their own blocks" on public.blocks for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "People block as themselves" on public.blocks;
create policy "People block as themselves" on public.blocks for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "People change their own blocks" on public.blocks;
create policy "People change their own blocks" on public.blocks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "People remove their own blocks" on public.blocks;
create policy "People remove their own blocks" on public.blocks for delete to authenticated using (user_id = (select auth.uid()));
revoke truncate, references, trigger on public.blocks from anon, authenticated;
revoke all on public.blocks from anon;
create index if not exists blocks_target on public.blocks (target_id);

create or replace function public.is_blocked(owner uuid, actor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks b where b.user_id = owner and b.target_id = actor and b.kind = 'block');
$$;
revoke all on function public.is_blocked(uuid, uuid) from public, anon, authenticated;

create or replace function public.blocks_end_follows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'block' then
    delete from public.follows f where (f.follower_id = new.user_id and f.followee_id = new.target_id)
      or (f.follower_id = new.target_id and f.followee_id = new.user_id);
  end if;
  return new;
end $$;
revoke all on function public.blocks_end_follows() from public, anon, authenticated;
drop trigger if exists blocks_end_follows on public.blocks;
create trigger blocks_end_follows after insert or update on public.blocks for each row execute function public.blocks_end_follows();

-- Replies, reactions, votes, quotes and follows from someone the author has blocked are refused, and a reply must fit.
create or replace function public.comments_shape() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if public.is_blocked((select a.author_id from public.annotations a where a.id = new.annotation_id), new.author_id) then
    raise exception 'You can''t reply here.';
  end if;
  if new.parent_id is not null then
    select c.annotation_id, c.parent_id, c.author_id into p from public.comments c where c.id = new.parent_id;
    if not found or p.annotation_id <> new.annotation_id then raise exception 'That reply has nowhere to go.'; end if;
    if p.parent_id is not null then raise exception 'Replies go one level deep.'; end if;
    if public.is_blocked(p.author_id, new.author_id) then raise exception 'You can''t reply here.'; end if;
  end if;
  return new;
end $$;
revoke all on function public.comments_shape() from public, anon, authenticated;
drop trigger if exists comments_shape on public.comments;
create trigger comments_shape before insert on public.comments for each row execute function public.comments_shape();

create or replace function public.no_blocked_on_annotation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_blocked((select a.author_id from public.annotations a where a.id = new.annotation_id), new.user_id) then
    raise exception 'You can''t do that here.';
  end if;
  return new;
end $$;
revoke all on function public.no_blocked_on_annotation() from public, anon, authenticated;
drop trigger if exists reactions_blocked on public.reactions;
create trigger reactions_blocked before insert on public.reactions for each row execute function public.no_blocked_on_annotation();
drop trigger if exists poll_votes_blocked on public.poll_votes;
create trigger poll_votes_blocked before insert or update on public.poll_votes for each row execute function public.no_blocked_on_annotation();

create or replace function public.comment_reactions_blocked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_blocked((select c.author_id from public.comments c where c.id = new.comment_id), new.user_id) then
    raise exception 'You can''t do that here.';
  end if;
  return new;
end $$;
revoke all on function public.comment_reactions_blocked() from public, anon, authenticated;
drop trigger if exists comment_reactions_blocked on public.comment_reactions;
create trigger comment_reactions_blocked before insert on public.comment_reactions for each row execute function public.comment_reactions_blocked();

create or replace function public.follows_blocked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_blocked(new.followee_id, new.follower_id) then raise exception 'You can''t follow this person.'; end if;
  return new;
end $$;
revoke all on function public.follows_blocked() from public, anon, authenticated;
drop trigger if exists follows_blocked on public.follows;
create trigger follows_blocked before insert on public.follows for each row execute function public.follows_blocked();

-- 5. An edit window: the take and tag may change for fifteen minutes after publishing, and a changed take is marked.
--    Before this an author could rewrite a take at any time, after people had answered it.
alter table public.annotations add column if not exists edited_at timestamptz;
create or replace function public.annotations_times() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.edited_at := null;
  else
    new.created_at := old.created_at;
    new.updated_at := now();
    if new.take_text is distinct from old.take_text or new.tag is distinct from old.tag then
      if now() - old.created_at > interval '15 minutes' then
        raise exception 'An annotation can be edited for fifteen minutes after it is published.';
      end if;
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
    if public.is_blocked((select a.author_id from public.annotations a where a.id = new.quote_of), new.author_id)
       and new.quote_of is distinct from old.quote_of then
      raise exception 'You can''t annotate this.';
    end if;
  end if;
  if tg_op = 'INSERT' and new.quote_of is not null
     and public.is_blocked((select a.author_id from public.annotations a where a.id = new.quote_of), new.author_id) then
    raise exception 'You can''t annotate this.';
  end if;
  return new;
end $$;
revoke all on function public.annotations_times() from public, anon, authenticated;

-- 6. Activity: replies, reactions, follows and annotations of your annotations, newest first, leaving out anyone you
--    have muted or blocked. Everything it reads is public already; it only gathers it for the person asking.
create or replace function public.activity(since timestamptz default now() - interval '30 days')
returns table (kind text, actor_id uuid, handle text, display_name text, avatar_url text, annotation_id text, take text, snippet text, at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  x as (
    select 'comment'::text as kind, c.author_id as actor, c.annotation_id as aid, left(coalesce(c.body, ''), 140) as snippet, c.created_at as at
      from public.comments c join public.annotations a on a.id = c.annotation_id
      left join public.comments p on p.id = c.parent_id
      where a.author_id = (select id from me) and c.author_id <> (select id from me) and (p.id is null or p.author_id <> (select id from me))
    union all
    select 'reply', c.author_id, c.annotation_id, left(coalesce(c.body, ''), 140), c.created_at
      from public.comments c join public.comments p on p.id = c.parent_id
      where p.author_id = (select id from me) and c.author_id <> (select id from me)
    union all
    select 'reaction', r.user_id, r.annotation_id, r.emoji, r.created_at
      from public.reactions r join public.annotations a on a.id = r.annotation_id
      where a.author_id = (select id from me) and r.user_id <> (select id from me)
    union all
    select 'follow', f.follower_id, null, null, f.created_at from public.follows f where f.followee_id = (select id from me)
    union all
    select 'quote', q.author_id, q.id, left(coalesce(q.take_text, ''), 140), q.created_at
      from public.annotations q join public.annotations a on a.id = q.quote_of
      where a.author_id = (select id from me) and q.author_id <> (select id from me)
  )
  select x.kind, x.actor, p.handle, p.display_name, p.avatar_url, x.aid, a.take_text, x.snippet, x.at
  from x join public.profiles p on p.id = x.actor left join public.annotations a on a.id = x.aid
  where (select id from me) is not null and x.at > since
    and not exists (select 1 from public.blocks b where b.user_id = (select id from me) and b.target_id = x.actor)
  order by x.at desc limit 60;
$$;
revoke all on function public.activity(timestamptz) from public, anon;
grant execute on function public.activity(timestamptz) to authenticated;

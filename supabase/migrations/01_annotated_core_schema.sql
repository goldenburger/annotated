-- annotated: core tables. Everything is publicly readable (annotations are public pages);
-- people can only create, change or delete their own rows.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_]{2,30}$'),
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);
create table public.annotations (
  id text primary key check (id ~ '^[a-z0-9-]{3,120}$'),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('video', 'audio', 'article', 'post')),
  take_text text not null default '' check (char_length(take_text) <= 500),
  tag text check (tag in ('Hot take', 'Fact check', 'Steelman', 'Receipts', 'Explainer')),
  poll jsonb,
  source jsonb not null default '{}'::jsonb,
  media_path text, poster_path text, shot_path text, voice_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index annotations_author_created on public.annotations (author_id, created_at desc);
create index annotations_created on public.annotations (created_at desc);
create table public.comments (
  id bigint generated always as identity primary key,
  annotation_id text not null references public.annotations (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_annotation on public.comments (annotation_id, created_at desc);
create index comments_author on public.comments (author_id);
create table public.reactions (
  annotation_id text not null references public.annotations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (annotation_id, user_id, emoji)
);
create index reactions_user on public.reactions (user_id);
create table public.comment_reactions (
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
create index comment_reactions_user on public.comment_reactions (user_id);
create table public.poll_votes (
  annotation_id text not null references public.annotations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (annotation_id, user_id)
);
create index poll_votes_user on public.poll_votes (user_id);
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on public.follows (followee_id);
create table public.claims (
  id bigint generated always as identity primary key,
  annotation_id text not null references public.annotations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  what text not null default '' check (char_length(what) <= 2000),
  reason text not null default '' check (char_length(reason) <= 4000),
  created_at timestamptz not null default now()
);
create index claims_annotation on public.claims (annotation_id);
alter table public.profiles enable row level security;
alter table public.annotations enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.poll_votes enable row level security;
alter table public.follows enable row level security;
alter table public.claims enable row level security;
create policy "Profiles are public" on public.profiles for select using (true);
create policy "People edit their own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "Annotations are public" on public.annotations for select using (true);
create policy "People publish as themselves" on public.annotations for insert to authenticated with check (author_id = (select auth.uid()));
create policy "People edit their own annotations" on public.annotations for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "People delete their own annotations" on public.annotations for delete to authenticated using (author_id = (select auth.uid()));
create policy "Comments are public" on public.comments for select using (true);
create policy "People comment as themselves" on public.comments for insert to authenticated with check (author_id = (select auth.uid()));
create policy "People delete their own comments" on public.comments for delete to authenticated using (author_id = (select auth.uid()));
create policy "Reactions are public" on public.reactions for select using (true);
create policy "People react as themselves" on public.reactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "People remove their own reactions" on public.reactions for delete to authenticated using (user_id = (select auth.uid()));
create policy "Comment reactions are public" on public.comment_reactions for select using (true);
create policy "People react to comments as themselves" on public.comment_reactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "People remove their own comment reactions" on public.comment_reactions for delete to authenticated using (user_id = (select auth.uid()));
create policy "Votes are public" on public.poll_votes for select using (true);
create policy "People vote as themselves" on public.poll_votes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "People change their own vote" on public.poll_votes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "People remove their own vote" on public.poll_votes for delete to authenticated using (user_id = (select auth.uid()));
create policy "Follows are public" on public.follows for select using (true);
create policy "People follow as themselves" on public.follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "People unfollow as themselves" on public.follows for delete to authenticated using (follower_id = (select auth.uid()));
create policy "Anyone can file a claim" on public.claims for insert to anon, authenticated with check (true);
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger annotations_touch before update on public.annotations for each row execute function public.touch_updated_at();
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username',
    split_part(coalesce(new.email, ''), '@', 1), 'user'), '[^a-z0-9_]', '', 'g'));
  if char_length(base) < 2 then base := 'user'; end if;
  base := left(base, 24); candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) loop n := n + 1; candidate := base || n::text; end loop;
  insert into public.profiles (id, handle, display_name, avatar_url)
  values (new.id, candidate, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', candidate),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

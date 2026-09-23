-- From the audit of 2026-09-23. The limits added in migrations 15 and 17 count recent rows on every insert:
-- comments by one author in the last minute, claims on one annotation in the last hour, claims site-wide in
-- the last minute. Migration 10 had dropped comments_author as unused, so the comment limit read the whole
-- comments table for every new comment, and the claim limits read the whole claims table. These indexes
-- make each count a short range read. comments (author_id, created_at) also covers the author foreign key.
-- The user_id foreign keys on reactions, comment_reactions and poll_votes stay unindexed on purpose: they are
-- only read when an account is deleted, which is rare, and every reaction and vote would pay to keep them.
create index if not exists comments_author_created on public.comments (author_id, created_at desc);
create index if not exists claims_annotation_created on public.claims (annotation_id, created_at desc);
create index if not exists claims_created on public.claims (created_at desc);
drop index if exists public.claims_annotation;

-- A take can carry a photo or a short video of the person's own, the way it can carry a GIF. The file goes
-- in the media bucket beside the clip and the screenshot, and the annotation keeps where it is, what kind it
-- is, its size and the words describing it for anyone who cannot see it.
-- Additive and nullable, so every annotation already saved is untouched and older copies of the extension
-- carry on working without knowing this column exists.
alter table public.annotations
  add column if not exists upload jsonb;

-- The bucket took screenshots, clips and voice notes. A video from a phone or a screen recorder is usually
-- MP4 or QuickTime, so those are allowed now, along with GIF for anyone uploading their own. The 25 MB limit
-- per file stays where it is.
update storage.buckets
   set allowed_mime_types = array[
     'video/webm', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
     'image/png', 'image/jpeg', 'image/webp', 'image/gif',
     'video/mp4', 'video/quicktime']
 where id = 'media';

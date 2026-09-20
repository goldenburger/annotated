update storage.buckets
set allowed_mime_types = array['video/webm', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'image/png', 'image/jpeg', 'image/webp']
where id = 'media';

// Cloud: publishing and reading shared annotations in Supabase. Extension pages only, after backend.js.
// Files (clips, audio, screenshots, posters, voice notes) go to the public "media" bucket under the author's
// own folder. The database's row level security decides who may write what.
const Cloud = (() => {
  // In the extension, rather than on the website, where there may be no panel at all.
  const IN_EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
  const c = () => Backend.client;
  const BUCKET = 'media';
  const publicUrl = (path) => (path ? c().storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null);
  const EXT = { 'video/webm': 'webm', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };
  const toBlob = async (dataUrl) => (await fetch(dataUrl)).blob();
  // A profile picture only from where sign-in puts it (Google, X, our own storage), so a picture cannot be used to
  // log who looks at a profile (security audit of 2026-09-29).
  // Only annotated's own storage, not any Supabase project, which anyone can make and read the logs of (audit of
  // 2026-09-29), and every path that reads a picture goes through it.
  const AVATAR_OK = /^https:\/\/(([a-z0-9-]+\.)*(googleusercontent\.com|twimg\.com)|efuotxdeifqzdfsavekb\.supabase\.co)\//i;
  const avatarOk = (u) => (AVATAR_OK.test(String(u || '')) ? String(u) : '');
  const person = (p) => (p ? { id: p.id, name: String(p.display_name || p.handle || 'Someone'), handle: String(p.handle || ''), avatar: avatarOk(p.avatar_url) } : null);
  // Named links, because annotations connect to profiles in more than one way (author, reactions, votes).
  const PROFILE = 'author:profiles!annotations_author_id_fkey(id, handle, display_name, avatar_url)';
  const COMMENT_PROFILE = 'author:profiles!comments_author_id_fkey(id, handle, display_name, avatar_url)';
  // A table pointing at itself is named by its column; the constraint's name is ambiguous there and PostgREST refused it.
  const QUOTED = 'quoted:quote_of(id, kind, take_text, tag, source, shot_path, poster_path, created_at, author:profiles!annotations_author_id_fkey(id, handle, display_name, avatar_url))';

  async function upload(uid, id, name, blob) {
    const type = (blob.type || 'application/octet-stream').split(';')[0];
    const path = `${uid}/${id}/${name}.${EXT[type] || 'bin'}`;
    const { error } = await c().storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: true });
    if (error) throw new Error('Upload failed: ' + error.message);
    return path;
  }

  // Publish: files first, then the row. Returns the author, or null when signed out.
  async function publish(id, item, take) {
    const me = await Backend.profile();
    if (!me) return null;
    const paths = {};
    if (item.blob) paths.media_path = await upload(me.id, id, 'clip', item.blob);
    if (typeof item.poster === 'string' && item.poster.startsWith('data:')) paths.poster_path = await upload(me.id, id, 'poster', await toBlob(item.poster));
    if (typeof item.shot === 'string' && item.shot.startsWith('data:')) paths.shot_path = await upload(me.id, id, 'shot', await toBlob(item.shot));
    if (take.voice && take.voice.blob) paths.voice_path = await upload(me.id, id, 'voice', take.voice.blob);
    // A photo or video of the author's own. The column is only sent when there is one, so an annotation
    // without one publishes the same as it always has.
    let up = null;
    if (take.upload && take.upload.blob) {
      const t = take.upload;
      up = { path: await upload(me.id, id, 'upload', t.blob), kind: t.kind === 'video' ? 'video' : 'image',
             w: Number(t.w) || 0, h: Number(t.h) || 0, alt: String(t.alt || '').slice(0, 200) };
    }
    const { blob, poster, shot, mediaUrl, ...source } = item;
    // A clip's own preview address on this computer is no source (it went into the row as blob:chrome-extension://...).
    if (typeof source.url === 'string' && !/^https?:/i.test(source.url)) delete source.url;
    const row = {
      id, author_id: me.id, kind: item.kind, take_text: take.text || '', tag: take.tag || null,
      poll: take.poll ? { question: take.poll.question || '', options: take.poll.options } : null,
      // The GIF is GIPHY's own address rather than a copy of the file, which is what their terms ask for.
      gif: take.gif ? { id: take.gif.id, url: take.gif.url, preview: take.gif.preview, w: take.gif.w, h: take.gif.h, alt: take.gif.alt } : null,
      source, ...paths,
      ...(up ? { upload: up } : {}),
    };
    const { error } = await c().from('annotations').insert(row);
    if (error) {
      if (error.code === '23505') {
        const { data } = await c().from('annotations').select('id').eq('id', id).eq('author_id', me.id).maybeSingle();
        if (data) return me;
      }
      // A4: the files already uploaded are taken back, so a refused annotation leaves no screenshot public by link.
      const gone = [...Object.values(paths), up && up.path].filter(Boolean);
      const live = await c().from('annotations').select('id').eq('id', id).maybeSingle().then((r) => !!(r && (r.data || r.error)), () => true);
      if (gone.length && !live) await c().storage.from(BUCKET).remove(gone).catch(() => {});
      throw new Error('Could not save the annotation: ' + error.message);
    }
    return me;
  }

  // A database row as the pages expect a record. Files become their public links.
  // Anything an author could write straight into their row is made safe to draw (security audit of 2026-09-29): a
  // `source` of the wrong shape threw inside the feed's render and blanked it for every reader, and addresses the
  // author chose for the picture or the clip (shot, poster, mediaUrl) let their server log every reader's address.
  // Those only ever come from our own storage paths below, as publishing strips them (`publish` above).
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const thumbOk = (u) => /^https:\/\/i\.ytimg\.com\//.test(str(u));
  function cleanSource(src) {
    const s0 = isObj(src) ? { ...src } : {};
    ['blob', 'poster', 'shot', 'mediaUrl', 'shotThumb'].forEach((k) => { delete s0[k]; });
    if (s0.thumb && !thumbOk(s0.thumb)) delete s0.thumb;
    ['text', 'title', 'author', 'handle', 'quote', 'show', 'url', 'fragmentUrl', 'videoId', 'site', 'channel', 'posted', 'transcript'].forEach((k) => { if (k in s0) s0[k] = str(s0[k]); });
    s0.meta = isObj(s0.meta) ? { ...s0.meta } : {};
    ['title', 'site', 'url', 'description', 'image', 'byline'].forEach((k) => { if (k in s0.meta) s0.meta[k] = str(s0.meta[k]); });
    ['start', 'end', 'duration'].forEach((k) => { if (k in s0 && !Number.isFinite(Number(s0[k]))) delete s0[k]; else if (k in s0) s0[k] = Number(s0[k]); });
    if (s0.transcript) s0.transcript = s0.transcript.slice(0, 1500);
    return s0;
  }
  function toRecord(a) {
    const item = { ...cleanSource(a.source), kind: a.kind };
    if (a.poster_path) item.poster = publicUrl(a.poster_path);
    if (a.shot_path) item.shot = publicUrl(a.shot_path);
    if (a.media_path) item.mediaUrl = publicUrl(a.media_path);
    return {
      id: a.id, cloud: true, created: Date.parse(a.created_at), author: person(a.author),
      item, take: { text: a.take_text, tag: a.tag, poll: cleanPoll(a.poll), gif: a.gif || null, voice: a.voice_path ? { url: publicUrl(a.voice_path) } : null,
        upload: a.upload && a.upload.path ? { url: publicUrl(a.upload.path), kind: a.upload.kind === 'video' ? 'video' : 'image', w: a.upload.w || 0, h: a.upload.h || 0, alt: a.upload.alt || '' } : null },
      paths: { media: a.media_path, poster: a.poster_path, shot: a.shot_path, voice: a.voice_path },
      counts: a.counts || null,
      // Changed within its edit window (migration 28), and the annotation it answers, if any.
      edited: a.edited_at ? Date.parse(a.edited_at) : null,
      quoteOf: typeof a.quote_of === 'string' ? a.quote_of : null,
      quoted: isObj(a.quoted) && a.quoted.id ? quotedCard(a.quoted) : null,
    };
  }
  // A small copy of the annotation another one answers: enough to draw it as a card, never its files but its picture.
  function quotedCard(q) {
    const item = { ...cleanSource(q.source), kind: q.kind };
    if (q.shot_path) item.shot = publicUrl(q.shot_path);
    if (q.poster_path) item.poster = publicUrl(q.poster_path);
    return { id: str(q.id), created: Date.parse(q.created_at), author: person(q.author), item, take: { text: str(q.take_text), tag: q.tag ? str(q.tag) : null } };
  }
  async function get(id) {
    const { data, error } = await c().from('annotations').select(`*, ${PROFILE}, ${QUOTED}`).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toRecord(data);
  }
  // Newest annotations from everyone, or from one person.
  // Which of these published ids are no longer in the database: deleted from another page, another computer or
  // the website. Asked at most once a minute for the same ids. An error answers none, so nothing local is ever
  // dropped on a network hiccup (recording of 2026-09-25 at 06:01: the panel went on listing "test 5" after it
  // had been deleted online).
  const goneAsked = new Map();
  async function gone(ids) {
    const fresh = ids.filter((id) => !(goneAsked.get(id) > Date.now() - 60000));
    if (!fresh.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return [];
    const { data, error } = await c().from('annotations').select('id').in('id', fresh);
    if (error || !Array.isArray(data)) return [];
    fresh.forEach((id) => goneAsked.set(id, Date.now()));
    const here = new Set(data.map((r) => r.id));
    return fresh.filter((id) => !here.has(id));
  }
  // A shared poll is a question and its options, nothing else: the row was spread whole, so it could carry counts or a
  // vote of its own making, and the card showed them until the real counts came (eleventh audit pass).
  function cleanPoll(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.options)) return null;
    const options = p.options.slice(0, 6).map((o) => String(o == null ? '' : o).slice(0, 200)).filter((o) => o.trim());
    return options.length >= 2 ? { question: String(p.question == null ? '' : p.question).slice(0, 300), options, vote: null } : null;
  }
  async function list({ authorId = null, limit = 60, tag = null } = {}) {
    // Who replied, reacted and voted, not only how many, because For you counts different people rather
    // than raw activity, and needs to know what you have already joined in on.
    // Every comment's author (for who joined in), but the words of only the first few (eleventh audit pass): the whole
    // text of every reply on sixty annotations came down with each list, only to show one line.
    let qy = c().from('annotations').select(`*, ${PROFILE}, ${QUOTED}, comments(author_id), first:comments(author_id, body, gif, created_at, ${COMMENT_PROFILE}), reactions(emoji, user_id), poll_votes(user_id)`)
      .order('created_at', { ascending: false }).limit(limit)
      .order('created_at', { referencedTable: 'first', ascending: true }).limit(6, { referencedTable: 'first' });
    if (authorId) qy = qy.eq('author_id', authorId);
    if (tag) qy = qy.eq('tag', tag);
    const { data, error } = await qy;
    if (error) throw error;
    return data.map((a) => {
      const r = toRecord(a);
      r.comments = new Array((a.comments || []).length).fill({});
      r.reactions = groupReactions(a.reactions || [], null);
      const voices = new Set();
      (a.comments || []).forEach((x) => x && x.author_id && voices.add(x.author_id));
      (a.reactions || []).forEach((x) => x && x.user_id && voices.add(x.user_id));
      (a.poll_votes || []).forEach((x) => x && x.user_id && voices.add(x.user_id));
      voices.delete(a.author_id);
      r.voices = [...voices];
      r.pollVotes = (a.poll_votes || []).length;
      // The first reply by someone else, shown as one line under the card, which makes a feed read as a place
      // where people answer each other. A reply that is only a GIF says so.
      const first = (a.first || a.comments || []).filter((x) => x && x.author_id !== a.author_id && x.author && ((x.body || '').trim() || x.gif))
        .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))[0];
      if (first) r.firstReply = { name: first.author.display_name || '@' + (first.author.handle || 'someone'), text: (first.body || '').trim() || (first.gif ? 'a GIF' : '') };
      return r;
    });
  }
  function groupReactions(rows, myId) {
    const m = new Map();
    for (const r of rows) {
      const g = m.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      g.count++; if (myId && r.user_id === myId) g.mine = true;
      m.set(r.emoji, g);
    }
    return [...m.values()];
  }

  // Comments, reactions and votes for one annotation, from everyone.
  async function social(id, myId) {
    const [cm, rx, pv] = await Promise.all([
      // Comment reactions come with the comments, one round trip where there used to be two (audit of 2026-09-24).
      c().from('comments').select(`id, parent_id, body, gif, upload, created_at, author_id, ${COMMENT_PROFILE}, comment_reactions(emoji, user_id)`).eq('annotation_id', id).order('created_at'),
      c().from('reactions').select('emoji, user_id').eq('annotation_id', id),
      c().from('poll_votes').select('option_index, user_id').eq('annotation_id', id),
    ]);
    const cIds = (cm.data || []).map((x) => x.id);
    // Asked for on their own only if the answer came without them (an older server, or a stand-in in a test).
    const embedded = (cm.data || []).every((x) => Array.isArray(x.comment_reactions));
    const crx = embedded
      ? { data: (cm.data || []).flatMap((x) => x.comment_reactions.map((r) => ({ comment_id: x.id, emoji: r.emoji, user_id: r.user_id }))) }
      : cIds.length ? await c().from('comment_reactions').select('comment_id, emoji, user_id').in('comment_id', cIds) : { data: [] };
    const comments = (cm.data || []).map((x) => ({
      dbId: x.id, parentDb: x.parent_id || null, text: x.body, gif: x.gif || null, t: Date.parse(x.created_at),
      upload: x.upload && x.upload.path ? { url: publicUrl(x.upload.path), kind: x.upload.kind === 'video' ? 'video' : 'image', w: x.upload.w || 0, h: x.upload.h || 0, alt: x.upload.alt || '' } : null, author: person(x.author), mine: !!myId && x.author_id === myId,
      reactions: groupReactions((crx.data || []).filter((r) => r.comment_id === x.id), myId),
    }));
    const counts = [0, 0, 0, 0];
    let vote = null;
    for (const v of pv.data || []) { counts[v.option_index]++; if (myId && v.user_id === myId) vote = v.option_index; }
    return { comments, reactions: groupReactions(rx.data || [], myId), poll: { counts, vote } };
  }

  // Writes. Each one only touches the signed-in person's own rows.
  const addComment = async (id, uid, text, gif, up, parentDb) => {
    const row = { annotation_id: id, author_id: uid, body: text || '' };
    // A reply to a reply names the comment it answers (one level deep, migration 28).
    if (parentDb) row.parent_id = parentDb;
    // GIPHY's address for it, rather than a copy of the file, which is what their terms ask for.
    if (gif) row.gif = { id: gif.id, url: gif.url, preview: gif.preview, w: gif.w, h: gif.h, alt: gif.alt };
    // A photo or video goes in the commenter's own folder, beside nothing of the annotation's author, because
    // the bucket only lets each person write under their own name.
    if (up && up.blob) {
      const path = await upload(uid, 'comments', `${id}-${Date.now()}`, up.blob);
      row.upload = { path, kind: up.kind === 'video' ? 'video' : 'image', w: Number(up.w) || 0, h: Number(up.h) || 0, alt: String(up.alt || '').slice(0, 200) };
    }
    const { data, error } = await c().from('comments').insert(row).select('id').single();
    if (error) throw error; return data.id;
  };
  // The same silence as a refused annotation delete, so the same question is asked.
  const deleteComment = async (dbId) => {
    const { data, error } = await c().from('comments').delete().eq('id', dbId).select('id, upload');
    if (error) throw error;
    if (!data || !data.length) throw new Error('It is not yours to delete.');
    // Its photo or video goes too, so nothing is left in the bucket that no comment points at.
    const path = data[0].upload && data[0].upload.path;
    if (path) await c().storage.from(BUCKET).remove([path]).catch(() => {});
  };
  const must = async (q) => { const r = await q; if (r && r.error) throw r.error; return r; };
  const react = (id, uid, emoji, on) => must(on
    ? c().from('reactions').insert({ annotation_id: id, user_id: uid, emoji }).then((r) => (r && r.error && r.error.code === '23505' ? { data: null, error: null } : r))
    : c().from('reactions').delete().match({ annotation_id: id, user_id: uid, emoji }));
  const reactComment = (dbId, uid, emoji, on) => must(on
    ? c().from('comment_reactions').insert({ comment_id: dbId, user_id: uid, emoji }).then((r) => (r && r.error && r.error.code === '23505' ? { data: null, error: null } : r))
    : c().from('comment_reactions').delete().match({ comment_id: dbId, user_id: uid, emoji }));
  const vote = (id, uid, index) => must(index === null || index === undefined
    ? c().from('poll_votes').delete().match({ annotation_id: id, user_id: uid })
    : c().from('poll_votes').upsert({ annotation_id: id, user_id: uid, option_index: index }));
  const edit = async (id, { text, tag }) => {
    const { data } = await must(c().from('annotations').update({ take_text: text || '', tag: tag || null }).eq('id', id).select('id, edited_at'));
    if (!data || !data.length) throw new Error('That is not yours to change, so nothing was saved.');
  };
  // The row first, then the files. The other way round, a row that then refused to delete was left live
  // with a clip and a screenshot that had already gone, which is worse than a file nobody points at.
  // A delete that matches nothing is not an error to the database, it is simply no rows. Row level security
  // refuses another person's annotation exactly that way, so asking for the rows back is the only way to know
  // it happened. Without this the local copy was deleted and the panel said it worked while the shared one
  // stayed online for everyone.
  async function remove(id, uid) {
    // The row names its own files, so those are what go. Listing the folder was the only way before, and
    // the listing came back empty often enough that screenshots of deleted annotations stayed up, public by
    // link. The listing still runs afterwards, for anything the row does not name.
    const { data: gone, error } = await c().from('annotations').delete().eq('id', id).select('id, shot_path, media_path, poster_path, voice_path, upload');
    if (error) throw error;
    if (!gone || !gone.length) throw new Error('It is not yours to delete.');
    const row = gone[0] || {};
    const named = [row.shot_path, row.media_path, row.poster_path, row.voice_path, row.upload && row.upload.path].filter((x) => typeof x === 'string' && x.startsWith(uid + '/'));
    if (named.length) await c().storage.from(BUCKET).remove(named).catch(() => {});
    const { data } = await c().storage.from(BUCKET).list(`${uid}/${id}`);
    if (data && data.length) await c().storage.from(BUCKET).remove(data.map((f) => `${uid}/${id}/${f.name}`)).catch(() => {});
    // Trending and people worth following are held for a minute in every window, and a deleted annotation
    // stayed listed there for that minute, leading to "This annotation was deleted".
    held = null; bumpFollows();
  }
  // Sharing something first saved locally: its comments and reactions come along, as the signed-in person's.
  async function carryOver(id, uid, comments = [], reactions = []) {
    // A GIF or a photo is a reply on its own, and comes across with it (only the words did, and a GIF-only reply was lost).
    const cs = [];
    let n = 0;
    for (const c0 of comments.filter((c) => c && (c.text || c.gif || (c.upload && c.upload.blob)))) {
      n++;
      const row = { annotation_id: id, author_id: uid, body: String(c0.text || '').slice(0, 1000), created_at: new Date(c0.t || Date.now()).toISOString() };
      if (c0.gif) row.gif = { id: c0.gif.id, url: c0.gif.url, preview: c0.gif.preview, w: c0.gif.w, h: c0.gif.h, alt: c0.gif.alt };
      if (c0.upload && c0.upload.blob) {
        try {
          // A minute each at most, and a name of its own (two replies of one millisecond shared a file).
          const path = await Promise.race([upload(uid, 'comments', `${id}-${c0.t || Date.now()}-${n}`, c0.upload.blob), new Promise((_, no) => setTimeout(() => no(new Error('The photo took too long.')), 60000))]);
          row.upload = { path, kind: c0.upload.kind === 'video' ? 'video' : 'image', w: Number(c0.upload.w) || 0, h: Number(c0.upload.h) || 0, alt: String(c0.upload.alt || '').slice(0, 200) };
        } catch (e) { console.warn('annotated: a reply\'s photo did not come across', e); if (!row.body && !row.gif) continue; }
      }
      cs.push(row);
    }
    // In groups under the twenty-a-minute limit, which counts each comment as it arrives (migration 23). Only the
    // first is waited for; the rest follow a minute apart, so Publish does not sit for minutes.
    if (cs.length) { const { error } = await c().from('comments').insert(cs.slice(0, 15)); if (error) throw error; }
    if (cs.length > 15) (async () => {
      for (let i = 15; i < cs.length; i += 15) {
        await new Promise((r) => setTimeout(r, 61000));
        const { error } = await c().from('comments').insert(cs.slice(i, i + 15));
        if (error) { console.warn('annotated: some earlier comments did not come across', error); return; }
      }
    })();
    // Eight at most, the database's limit for one person on one annotation; a ninth refused the whole insert.
    const mine = [...new Set((reactions || []).map((r) => (typeof r === 'string' ? r : r.mine !== false ? r.emoji : null)).filter(Boolean))].slice(0, 8);
    if (mine.length) { const { error } = await c().from('reactions').insert(mine.map((emoji) => ({ annotation_id: id, user_id: uid, emoji }))); if (error) throw error; }
    return { comments: cs.length, reactions: mine.length };
  }
  // How many a person has published, counted by the database rather than by downloading them (ninth audit pass).
  const countBy = async (authorId) => { const { count, error } = await c().from('annotations').select('id', { count: 'exact', head: true }).eq('author_id', authorId); if (error) throw error; return count || 0; };
  // Pinning: one annotation of your own at the top of your profile (migration 28). null unpins.
  async function pin(uid, id) {
    const { data, error } = await c().from('profiles').update({ pinned_id: id || null }).eq('id', uid).select('pinned_id');
    if (error) throw error;
    if (!data || !data.length) throw new Error('That did not save. Sign in again and try once more.');
    return data[0].pinned_id || null;
  }
  async function pinnedOf(profileId) {
    const { data, error } = await c().from('profiles').select('pinned_id').eq('id', profileId).maybeSingle();
    if (error) throw error;
    return (data && data.pinned_id) || null;
  }
  // Annotating an annotation: a take of your own on someone's annotation, keeping what it was about, without its
  // files (those belong to its author and go when it does). It is drawn with the one it answers as a card.
  async function quote(orig, take) {
    const me = await Backend.profile();
    if (!me) return null;
    const words = String(take.text || '').trim();
    const slug = (words || 'annotation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'annotation';
    const id = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { blob, poster, shot, mediaUrl, shotThumb, ...source } = orig.item || {};
    const row = { id, author_id: me.id, kind: (orig.item && orig.item.kind) || 'article', take_text: words, tag: take.tag || null, source, quote_of: orig.id };
    const { error } = await c().from('annotations').insert(row);
    if (error) throw new Error(/annotate this/i.test(error.message) ? 'You can\'t annotate this.' : 'Could not save the annotation: ' + error.message);
    held = null;
    return { id, author: me };
  }
  // Mute and block (migration 28). Your own list only, held for the page's life and asked again when it changes.
  let blocksHeld = null;
  async function blocks(uid) {
    if (!uid) return new Map();
    if (blocksHeld && blocksHeld.uid === uid) return blocksHeld.map;
    const { data, error } = await c().from('blocks').select('target_id, kind').eq('user_id', uid);
    if (error) return new Map();
    const map = new Map((data || []).map((r) => [r.target_id, r.kind]));
    blocksHeld = { uid, map };
    return map;
  }
  async function setBlock(uid, target, kind) {
    const q = kind ? c().from('blocks').upsert({ user_id: uid, target_id: target, kind }) : c().from('blocks').delete().match({ user_id: uid, target_id: target });
    const { error } = await q;
    if (error) throw error;
    blocksHeld = null; held = null; bumpFollows();
  }
  // Leaves out what someone you muted or blocked wrote.
  const hideBlocked = (recs, map) => (map && map.size ? recs.filter((r) => !(r.author && map.has(r.author.id))) : recs);
  // Activity: replies, reactions, follows and annotations of yours, newest first (the activity function, migration 28).
  async function activity(since) {
    const { data, error } = await c().rpc('activity', since ? { since: new Date(since).toISOString() } : {});
    if (error) throw error;
    return (data || []).map((r) => ({ kind: str(r.kind), who: person({ id: r.actor_id, handle: r.handle, display_name: r.display_name, avatar_url: r.avatar_url }),
      annotationId: r.annotation_id ? str(r.annotation_id) : null, take: str(r.take), snippet: str(r.snippet), at: Date.parse(r.at) }));
  }
  const claim = (id, { name, email, what, reason }) => c().from('claims').insert({ annotation_id: id, name, email, what, reason });

  // Following and discovery.
  const follow = (me, id) => c().from('follows').insert({ follower_id: me, followee_id: id });
  const unfollow = (me, id) => c().from('follows').delete().match({ follower_id: me, followee_id: id });
  async function followCounts(id) {
    const [a, b] = await Promise.all([
      c().from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', id),
      c().from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', id),
    ]);
    return { followers: a.count || 0, following: b.count || 0 };
  }
  async function followingIds(me) {
    if (!me) return new Set();
    const { data } = await c().from('follows').select('followee_id').eq('follower_id', me);
    return new Set((data || []).map((r) => r.followee_id));
  }
  async function people(me, lim = 4) {
    const { data } = await c().rpc('people_to_follow', { viewer: me || null, lim: lim + 1 });
    // Signed out the query cannot leave you out, so the last account used here is dropped by hand.
    let skip = me || null;
    if (!skip && typeof Backend !== 'undefined' && Backend.lastId) { try { skip = await Backend.lastId(); } catch { skip = null; } }
    return (data || []).filter((p) => p && p.id && p.handle && (!skip || p.id !== skip)).slice(0, lim)
      .map((p) => ({ id: p.id, name: p.display_name || p.handle, handle: p.handle, avatar: avatarOk(p.avatar_url), annotations: p.annotations }));
  }
  // What is most talked about on annotated lately, weighed in the database by talked_about (migration 13):
  // replies count more than annotations, reactions less, newer counts more, and several people count more
  // than one person posting a lot. There is no count of views on the open web to read, so this is the
  // conversation here. Only rows with a name and an address that opens in a tab come through.
  async function talkedAbout(lim = 3) {
    const { data, error } = await c().rpc('talked_about', { lim });
    if (error) throw new Error(error.message);
    return (data || []).map((r) => ({ ...r,
      url: r.video_id ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(r.video_id) : r.url }))
      .filter((r) => r && r.title && /^https?:\/\//i.test(r.url || '')).slice(0, lim);
  }
  async function trending() {
    const [s, t] = await Promise.all([c().rpc('trending_sources', { lim: 5 }), c().rpc('trending_tags', { lim: 5 })]);
    // A row missing its name or its count drew "undefined" and "NaN annotations" on the page, so only whole
    // rows come through.
    const sources = (s.data || []).filter((x) => x && x.title && x.sample_id && Number.isFinite(Number(x.annotations)));
    // Two different posts by one person carry the same name, so the name alone cannot tell them apart and the
    // list reads as the same row twice. The quote of one annotation on each does tell them apart, and only
    // the ones that share a name need asking about.
    const seen = new Set(), twice = new Set();
    sources.forEach((x) => { if (seen.has(x.title)) twice.add(x.title); seen.add(x.title); });
    const need = sources.filter((x) => twice.has(x.title)).map((x) => x.sample_id);
    if (need.length) {
      const { data } = await c().from('annotations').select('id, source').in('id', need);
      const byId = new Map((data || []).map((r) => [r.id, r.source || {}]));
      sources.forEach((x) => {
        const src = byId.get(x.sample_id) || {};
        const q = src.quote || src.text || '';
        if (q) x.quote = String(q).slice(0, 90);
      });
    }
    return { sources, tags: (t.data || []).filter((x) => x && x.tag && Number.isFinite(Number(x.uses))) };
  }
  // The profile as it is now, rather than the copy taken when an annotation was published. A person who
  // changes their name or handle used to keep the old one on every annotation saved on their own computer.
  async function authorNow(id) {
    if (!id) return null;
    const { data } = await c().from('profiles').select('id, handle, display_name, avatar_url').eq('id', id).maybeSingle();
    return data ? { id: data.id, handle: data.handle, name: data.display_name || data.handle, avatar: avatarOk(data.avatar_url) } : null;
  }
  // "For you": newer and more discussed first, lifted for people you follow and for the tags and sources you annotate.
  // For you. What someone would want to read next, and a reason for each one, so the order makes sense.
  //   Never your own: those are under You, and recommending them back read as the feed not knowing you.
  //   Interest: people you follow count most, then someone you follow joining in, a source you annotated,
  //   people you have replied to or reacted to before, and tags you use.
  //   Worth reading: how many different people joined in, not how many times, and the author's own replies
  //   do not count. Newer counts more, halving about every two days, so the tab turns over.
  //   Variety: no two in a row by one person or on one source, and at most two by one person in the top ten.
  //   Things you have opened, or already joined in on, move down.
  const OPENED = 'annotated-opened';
  const openedIds = () => { try { return new Set(JSON.parse(localStorage.getItem(OPENED) || '[]')); } catch { return new Set(); } };
  function markOpened(id) {
    try { const a = JSON.parse(localStorage.getItem(OPENED) || '[]').filter((x) => x !== id); a.unshift(id); localStorage.setItem(OPENED, JSON.stringify(a.slice(0, 300))); } catch { /* no storage */ }
  }
  const WHAT = { post: 'a post', video: 'a video', audio: 'an episode', article: 'a story' };
  const reactCount = (list) => (list || []).reduce((n, x) => n + (typeof x === 'string' ? 1 : x.count || 1), 0);
  function forYou(records, { followed = new Set(), myTags = new Set(), mySources = new Set(), myId = null, opened = null, names = new Map() } = {}) {
    const now = Date.now();
    const seen = opened || openedIds();
    const theirs = (r) => (r.cloud || r.author) && r.author && r.author.id && r.author.id !== myId && !r.mine;
    const pool = records.filter(theirs);
    // What you have joined in on says who and what you like, as much as what you annotate yourself.
    const joined = myId ? pool.filter((r) => (r.voices || []).includes(myId)) : [];
    const likedAuthors = new Set(joined.map((r) => r.author.id));
    const likedSources = new Set(joined.map((r) => sourceKey(r.item)).filter(Boolean));
    const tags = new Set([...myTags, ...joined.map((r) => r.take && r.take.tag).filter(Boolean)]);
    const scored = pool.map((r) => {
      const ageH = Math.max(0, (now - r.created) / 36e5);
      const voices = (r.voices || []).filter((v) => v !== myId);
      const replies = (r.comments || []).length, reacts = reactCount(r.reactions);
      // A reply is worth far less than a new voice, so nine replies from one person count for less than three
      // different people joining in.
      const worth = Math.log2(1 + 2 * voices.length + 0.3 * replies + 0.2 * reacts);
      let s = 3 * Math.pow(0.5, ageH / 48) + worth;
      const k = sourceKey(r.item), what = WHAT[r.item.kind] || 'a source', why = [];
      const friendIn = voices.find((v) => followed.has(v));
      if (followed.has(r.author.id)) { s += 4; why.push([3, `You follow ${r.author.name || 'them'}`]); }
      if (friendIn) { s += 1.5; why.push([2.5, names.get(friendIn) ? `${names.get(friendIn)}, who you follow, joined in` : 'Someone you follow joined in']); }
      if (k && mySources.has(k)) { s += 2; why.push([2, `On ${what} you annotated`]); }
      else if (k && likedSources.has(k)) { s += 1; why.push([1.2, `On ${what} you joined in on`]); }
      if (likedAuthors.has(r.author.id) && !followed.has(r.author.id)) { s += 1.5; why.push([1.5, `You have replied to or reacted to ${r.author.name || 'them'} before`]); }
      if (r.take && r.take.tag && tags.has(r.take.tag)) { s += 0.8; why.push([1, `Tagged ${r.take.tag}, like yours`]); }
      if (voices.length >= 2) why.push([0.9, `${voices.length} people are talking about this`]);
      // "New today" is left out: the time is already beside the author, and it headed every card (UX audit of 2026-09-25).
      if (seen.has(r.id)) s *= 0.5;
      if (myId && (r.voices || []).includes(myId)) s *= 0.4;
      why.sort((a, b) => b[0] - a[0]);
      return { r, s, why: why.length ? why[0][1] : '', k };
    }).sort((a, b) => b.s - a.s);
    // Variety, picked greedily from the top.
    const out = [], perAuthor = new Map();
    let lastA = '', lastK = '';
    while (scored.length) {
      let idx = scored.findIndex((x) => x.r.author.id !== lastA && (!x.k || x.k !== lastK) && (out.length >= 10 || (perAuthor.get(x.r.author.id) || 0) < 2));
      if (idx < 0) idx = 0;
      const [x] = scored.splice(idx, 1);
      out.push({ ...x.r, why: x.why });
      perAuthor.set(x.r.author.id, (perAuthor.get(x.r.author.id) || 0) + 1);
      lastA = x.r.author.id; lastK = x.k;
    }
    return out;
  }
  const sourceKey = (it) => it.videoId || (it.meta && it.meta.url) || it.url || it.audioUrl || '';

  // Everything the pages need for following and discovery, in one call. signIn is called when a signed-out
  // person presses Follow. Returns the "social" object the page renderers take.
  // Follows, people worth following and trending change slowly and every page asks for all of them, which
  // was five queries each time an annotation was opened. They are held for a minute instead.
  const KEEP = 60000;
  let held = null;
  // A follow is made in one window and read in another. The panel's Home and the full page each hold this
  // for a minute, so following someone on the page left the panel's Following tab empty and saying you
  // follow nobody, for up to a minute after you followed them. Every follow bumps a stamp and every window
  // throws away what it was holding. The website has no chrome.storage and only one window, so it skips this.
  const FOLLOW_STAMP = 'annotatedFollows';
  const bumpFollows = () => { try { chrome.storage.local.set({ [FOLLOW_STAMP]: Date.now() }); } catch { /* not in the extension */ } };
  try {
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch[FOLLOW_STAMP]) held = null; });
  } catch { /* not in the extension */ }
  async function discovery(me, { personId = null, onPerson, signIn } = {}) {
    const key = `${(me && me.id) || ''}|${personId || ''}`;
    if (held && held.key === key && Date.now() - held.at < KEEP) return { ...held.value, onPerson };
    const [followed, ppl0, trend, youCounts, personStats, hidden] = await Promise.all([
      followingIds(me && me.id).catch(() => new Set()),
      people(me && me.id, 6).catch(() => []),
      trending().catch(() => ({ sources: [], tags: [] })),
      me ? followCounts(me.id).catch(() => null) : null,
      personId ? followCounts(personId).catch(() => null) : null,
      me ? blocks(me.id).catch(() => new Map()) : new Map(),
    ]);
    // Nobody you muted or blocked is suggested to you (UX pass: a muted person stayed under People worth following).
    const ppl = ppl0.filter((p) => !hidden.has(p.id)).slice(0, 4);
    const value = {
      signIn: signIn || null,
      followed, people: ppl, trending: trend, youCounts, personStats, onPerson,
      followsPerson: !!(personId && followed.has(personId)),
      async onFollow(id, on) {
        // Signed out nothing was tried, so this is not a failure. The button asks you to sign in instead.
        if (!me) return null;
        const r = on ? await follow(me.id, id) : await unfollow(me.id, id);
        if (r.error) return false;
        if (on) followed.add(id); else followed.delete(id);
        bumpFollows();
        return true;
      },
    };
    // Kept by reference, so following someone is reflected in the held copy as well.
    held = { key, at: Date.now(), value };
    return value;
  }
  // Which tab Home opens on, shared by the panel and the page so they agree. The one last chosen, and For you
  // by default, unless that is For you with nothing in it while Everyone has something. In the recording of
  // 2026-09-23 at 02:48 the page opened on Everyone and the panel on an empty For you. A tab pressed on this
  // screen is kept as it is, even when empty, because that was asked for.
  const TAB_KEY = 'annotated-feed-tab';
  function savedTab() { try { return localStorage.getItem(TAB_KEY) || 'foryou'; } catch { return 'foryou'; } }
  function saveTab(k) { try { localStorage.setItem(TAB_KEY, k); } catch { /* storage refused */ } }
  function startTab(tabs, wanted, pressed = false) {
    const k = tabs[wanted] ? wanted : 'foryou';
    if (pressed) return k;
    // Signed out there is nobody to pick for, so the feed opens on Everyone (exploration of 2026-09-26).
    if (tabs.signedOut) return 'everyone';
    if (k === 'foryou' && !tabs.foryou.records.length && tabs.everyone.records.length) return 'everyone';
    return k;
  }
  // The home feed's three tabs from one list of annotations.
  function homeTabs(records, soc, me, mine = []) {
    const myTags = new Set(mine.map((r) => r.take && r.take.tag).filter(Boolean));
    const mySources = new Set(mine.map((r) => sourceKey(r.item)).filter(Boolean));
    const fy = forYou(records, { followed: soc.followed, myTags, mySources, myId: me && me.id,
      names: new Map(records.filter((r) => r.author && r.author.id).map((r) => [r.author.id, r.author.name])) });
    return {
      // Empty, it says only why it is empty. The explanation of how it picks sat above that and read twice.
      foryou: { records: fy,
        note: !fy.length ? '' : me ? 'Picked from who you follow, what you reply to and react to, and what you annotate. Each one says why.'
          : 'What people are discussing on annotated. Sign in and it learns from who you follow and what you react to.',
        // A visitor has no profile, so it does not point them at one.
        empty: me ? 'Nothing to suggest yet. Your own annotations are under Your profile, and as more people publish, the best of it shows up here.'
          : 'Nothing to suggest yet. Sign in and it learns from who you follow and what you react to.' },
      following: { records: records.filter((r) => r.author && soc.followed.has(r.author.id)),
        // Signed out nobody can follow anyone, so telling them to follow people pointed at nothing they could do.
        note: !me ? 'Sign in to follow people and see their annotations here.'
          : soc.followed.size ? `Annotations from the ${soc.followed.size === 1 ? 'person' : soc.followed.size + ' people'} you follow.` : 'Follow people to see their annotations here.',
        // Said once: the line above already asks for a sign-in, and "from the panel" read oddly inside the panel (UX pass of 2026-09-29).
        empty: !me ? 'Follow people from their annotations, and what they publish shows up here.'
          : soc.followed.size ? 'Nothing from them yet.' : 'Follow someone and their annotations show up here.' },
      // Everyone means what everyone published. Annotations saved only on this computer are in nobody else's
      // feed, so counting them here told you the site held things it did not.
      everyone: (() => {
        const out = records.filter((r) => r.cloud || r.author);
        return { records: out, note: out.length ? `${out.length} annotation${out.length === 1 ? '' : 's'} from everyone, newest first.` : '',
          empty: 'Nobody has published anything yet. Yours would be the first.' };
      })(),
      signedOut: !me,
    };
  }

  return { pin, pinnedOf, quote, blocks, setBlock, hideBlocked, activity, countBy, avatarOk, publish, carryOver, get, gone, list, social, follow, unfollow, followCounts, followingIds, people, trending, talkedAbout, authorNow, forYou, markOpened, sourceKey, discovery, homeTabs, startTab, savedTab, saveTab, addComment, deleteComment, react, reactComment, vote, edit, remove, claim, publicUrl };
})();

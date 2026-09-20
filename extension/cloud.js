// Cloud: publishing and reading shared annotations in Supabase. Extension pages only, after backend.js.
// Files (clips, audio, screenshots, posters, voice notes) go to the public "media" bucket under the author's
// own folder. The database's row level security decides who may write what.
const Cloud = (() => {
  const c = () => Backend.client;
  const BUCKET = 'media';
  const publicUrl = (path) => (path ? c().storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null);
  const EXT = { 'video/webm': 'webm', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const toBlob = async (dataUrl) => (await fetch(dataUrl)).blob();
  const person = (p) => (p ? { id: p.id, name: p.display_name || p.handle || 'Someone', handle: p.handle || '', avatar: p.avatar_url || '' } : null);
  // Named links, because annotations connect to profiles in more than one way (author, reactions, votes).
  const PROFILE = 'author:profiles!annotations_author_id_fkey(id, handle, display_name, avatar_url)';
  const COMMENT_PROFILE = 'author:profiles!comments_author_id_fkey(id, handle, display_name, avatar_url)';

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
    const { blob, poster, shot, mediaUrl, ...source } = item;
    const row = {
      id, author_id: me.id, kind: item.kind, take_text: take.text || '', tag: take.tag || null,
      poll: take.poll ? { question: take.poll.question || '', options: take.poll.options } : null,
      source, ...paths,
    };
    const { error } = await c().from('annotations').insert(row);
    if (error) throw new Error('Could not save the annotation: ' + error.message);
    return me;
  }

  // A database row as the pages expect a record. Files become their public links.
  function toRecord(a) {
    const item = { ...(a.source || {}), kind: a.kind };
    if (a.poster_path) item.poster = publicUrl(a.poster_path);
    if (a.shot_path) item.shot = publicUrl(a.shot_path);
    if (a.media_path) item.mediaUrl = publicUrl(a.media_path);
    return {
      id: a.id, cloud: true, created: Date.parse(a.created_at), author: person(a.author),
      item, take: { text: a.take_text, tag: a.tag, poll: a.poll ? { ...a.poll, vote: null } : null, voice: a.voice_path ? { url: publicUrl(a.voice_path) } : null },
      paths: { media: a.media_path, poster: a.poster_path, shot: a.shot_path, voice: a.voice_path },
      counts: a.counts || null,
    };
  }
  async function get(id) {
    const { data, error } = await c().from('annotations').select(`*, ${PROFILE}`).eq('id', id).maybeSingle();
    if (error || !data) return null;
    return toRecord(data);
  }
  // Newest annotations from everyone, or from one person.
  async function list({ authorId = null, limit = 60 } = {}) {
    let qy = c().from('annotations').select(`*, ${PROFILE}, comments(count), reactions(emoji, user_id)`).order('created_at', { ascending: false }).limit(limit);
    if (authorId) qy = qy.eq('author_id', authorId);
    const { data, error } = await qy;
    if (error) throw error;
    return data.map((a) => {
      const r = toRecord(a);
      r.comments = new Array((a.comments && a.comments[0] && a.comments[0].count) || 0).fill({});
      r.reactions = groupReactions(a.reactions || [], null);
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
      c().from('comments').select(`id, body, created_at, author_id, ${COMMENT_PROFILE}`).eq('annotation_id', id).order('created_at'),
      c().from('reactions').select('emoji, user_id').eq('annotation_id', id),
      c().from('poll_votes').select('option_index, user_id').eq('annotation_id', id),
    ]);
    const cIds = (cm.data || []).map((x) => x.id);
    const crx = cIds.length ? await c().from('comment_reactions').select('comment_id, emoji, user_id').in('comment_id', cIds) : { data: [] };
    const comments = (cm.data || []).map((x) => ({
      dbId: x.id, text: x.body, t: Date.parse(x.created_at), author: person(x.author), mine: !!myId && x.author_id === myId,
      reactions: groupReactions((crx.data || []).filter((r) => r.comment_id === x.id), myId),
    }));
    const counts = [0, 0, 0, 0];
    let vote = null;
    for (const v of pv.data || []) { counts[v.option_index]++; if (myId && v.user_id === myId) vote = v.option_index; }
    return { comments, reactions: groupReactions(rx.data || [], myId), poll: { counts, vote } };
  }

  // Writes. Each one only touches the signed-in person's own rows.
  const addComment = async (id, uid, text) => {
    const { data, error } = await c().from('comments').insert({ annotation_id: id, author_id: uid, body: text }).select('id').single();
    if (error) throw error; return data.id;
  };
  const deleteComment = (dbId) => c().from('comments').delete().eq('id', dbId);
  const react = (id, uid, emoji, on) => (on
    ? c().from('reactions').insert({ annotation_id: id, user_id: uid, emoji })
    : c().from('reactions').delete().match({ annotation_id: id, user_id: uid, emoji }));
  const reactComment = (dbId, uid, emoji, on) => (on
    ? c().from('comment_reactions').insert({ comment_id: dbId, user_id: uid, emoji })
    : c().from('comment_reactions').delete().match({ comment_id: dbId, user_id: uid, emoji }));
  const vote = (id, uid, index) => (index === null || index === undefined
    ? c().from('poll_votes').delete().match({ annotation_id: id, user_id: uid })
    : c().from('poll_votes').upsert({ annotation_id: id, user_id: uid, option_index: index }));
  const edit = (id, { text, tag }) => c().from('annotations').update({ take_text: text || '', tag: tag || null }).eq('id', id);
  async function remove(id, uid) {
    const { data } = await c().storage.from(BUCKET).list(`${uid}/${id}`);
    if (data && data.length) await c().storage.from(BUCKET).remove(data.map((f) => `${uid}/${id}/${f.name}`));
    const { error } = await c().from('annotations').delete().eq('id', id);
    if (error) throw error;
  }
  // Sharing something first saved locally: its comments and reactions come along, as the signed-in person's.
  async function carryOver(id, uid, comments = [], reactions = []) {
    const cs = comments.filter((c) => c && c.text).map((c) => ({ annotation_id: id, author_id: uid, body: String(c.text).slice(0, 1000), created_at: new Date(c.t || Date.now()).toISOString() }));
    if (cs.length) { const { error } = await c().from('comments').insert(cs); if (error) throw error; }
    const mine = [...new Set((reactions || []).map((r) => (typeof r === 'string' ? r : r.mine !== false ? r.emoji : null)).filter(Boolean))];
    if (mine.length) { const { error } = await c().from('reactions').insert(mine.map((emoji) => ({ annotation_id: id, user_id: uid, emoji }))); if (error) throw error; }
    return { comments: cs.length, reactions: mine.length };
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
    const { data } = await c().rpc('people_to_follow', { viewer: me || null, lim });
    return (data || []).map((p) => ({ id: p.id, name: p.display_name || p.handle, handle: p.handle, avatar: p.avatar_url || '', annotations: p.annotations }));
  }
  async function trending() {
    const [s, t] = await Promise.all([c().rpc('trending_sources', { lim: 5 }), c().rpc('trending_tags', { lim: 5 })]);
    return { sources: s.data || [], tags: t.data || [] };
  }
  // "For you": newer and more discussed first, lifted for people you follow and for the tags and sources you annotate.
  function forYou(records, { followed = new Set(), myTags = new Set(), mySources = new Set(), myId = null } = {}) {
    const now = Date.now();
    const key = (it) => it.videoId || (it.meta && it.meta.url) || it.url || it.audioUrl || '';
    const score = (r) => {
      const ageH = Math.max(0, (now - r.created) / 36e5);
      const talk = (r.comments || []).length * 2 + (r.reactions || []).reduce((n, x) => n + (typeof x === 'string' ? 1 : x.count || 1), 0);
      let s = Math.pow(0.5, ageH / 48) * 4 + Math.log2(1 + talk);
      if (r.author && followed.has(r.author.id)) s += 3;
      if (r.take && r.take.tag && myTags.has(r.take.tag)) s += 1;
      if (mySources.has(key(r.item))) s += 1.5;
      if (myId && r.author && r.author.id === myId) s -= 1;
      return s;
    };
    return records.map((r) => [score(r), r]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }
  const sourceKey = (it) => it.videoId || (it.meta && it.meta.url) || it.url || it.audioUrl || '';

  // Everything the pages need for following and discovery, in one call. signIn is called when a signed-out
  // person presses Follow. Returns the "social" object the page renderers take.
  async function discovery(me, { personId = null, onPerson, signIn } = {}) {
    const [followed, ppl, trend, youCounts, personStats] = await Promise.all([
      followingIds(me && me.id).catch(() => new Set()),
      people(me && me.id, 4).catch(() => []),
      trending().catch(() => ({ sources: [], tags: [] })),
      me ? followCounts(me.id).catch(() => null) : null,
      personId ? followCounts(personId).catch(() => null) : null,
    ]);
    return {
      followed, people: ppl, trending: trend, youCounts, personStats, onPerson,
      followsPerson: !!(personId && followed.has(personId)),
      async onFollow(id, on) {
        if (!me) { if (signIn) signIn(); return false; }
        const r = on ? await follow(me.id, id) : await unfollow(me.id, id);
        if (r.error) return false;
        if (on) followed.add(id); else followed.delete(id);
        return true;
      },
    };
  }
  // The home feed's three tabs from one list of annotations.
  function homeTabs(records, soc, me, mine = []) {
    const myTags = new Set(mine.map((r) => r.take && r.take.tag).filter(Boolean));
    const mySources = new Set(mine.map((r) => sourceKey(r.item)).filter(Boolean));
    return {
      foryou: { records: forYou(records, { followed: soc.followed, myTags, mySources, myId: me && me.id }), note: 'Picked for you: newer and more discussed first, with a lift for people you follow and the tags and sources you annotate.' },
      following: { records: records.filter((r) => r.author && soc.followed.has(r.author.id)), note: soc.followed.size ? `Annotations from the ${soc.followed.size === 1 ? 'person' : soc.followed.size + ' people'} you follow.` : 'Follow people to see their annotations here.' },
      everyone: { records, note: `${records.length} annotation${records.length === 1 ? '' : 's'} from everyone, newest first.` },
    };
  }

  return { publish, carryOver, get, list, social, follow, unfollow, followCounts, followingIds, people, trending, forYou, sourceKey, discovery, homeTabs, addComment, deleteComment, react, reactComment, vote, edit, remove, claim, publicUrl };
})();

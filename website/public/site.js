// annotated.app pages: the home feed at /, a person's profile at /@handle, and one annotation at /@handle/id.
// Everything comes from the shared database. Reading needs no account. Commenting, reacting and voting use
// Google sign-in, which returns to the same page.
(async () => {
  Prefs.init(Prefs.localBackend());
  let me = null;
  try { me = await Backend.profile(); AnnotationPage.setMe(me); } catch {}
  const page = document.getElementById('page');
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const query = new URLSearchParams(location.search);
  const handleOf = new Map();
  const linkFor = (id) => `/@${handleOf.get(id) || 'annotated'}/${encodeURIComponent(id)}`;
  const remember = (records) => records.forEach((r) => handleOf.set(r.id, (r.author && r.author.handle) || 'annotated'));
  const signIn = () => Backend.signIn().catch((e) => alert('Sign-in did not start. ' + e.message));
  const TAB_KEY = 'annotated-feed-tab';
  let tab = (() => { try { return localStorage.getItem(TAB_KEY) || 'foryou'; } catch { return 'foryou'; } })();
  const discover = (opts = {}) => Cloud.discovery(me, { signIn: () => { if (confirm('Sign in with Google to follow people?')) signIn(); }, onPerson: (h) => { location.href = '/@' + h; }, ...opts }).catch(() => null);
  const youOf = (soc, n) => (me && soc && soc.youCounts ? { annotations: n, ...soc.youCounts } : null);
  const nav = {
    onHome: () => { location.href = '/'; },
    onAll: () => { location.href = '/'; },
    onProfile: () => { if (me && me.handle) location.href = '/@' + me.handle; else signIn(); },
    onTag: (t) => { location.href = '/?tag=' + encodeURIComponent(t); },
    onOpen: (id) => { location.href = linkFor(id); },
  };

  // Signed out: a sign-in button in the header. Signed in: sign out lives on your own profile.
  function headerAccount() {
    // Signed out, there is no "you" to show in the side rail.
    if (!me) page.querySelectorAll('.rail .railcard').forEach((c) => { if (c.querySelector('.who')) c.remove(); });
    const navEl = page.querySelector('.sitenav');
    if (!navEl) return;
    if (!me) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'navBtn webSignIn'; b.textContent = 'Sign in with Google';
      b.addEventListener('click', signIn);
      navEl.appendChild(b);
      const you = navEl.querySelector('.navProfile'); if (you) you.hidden = true;
    }
  }
  function intro() {
    const main = page.querySelector('.sitemain');
    if (!main) return;
    const box = document.createElement('section');
    box.className = 'webIntro';
    box.innerHTML = `<h1>Say what you think about anything on the web</h1>
      <p>annotated turns a passage from an article, a clip of a video or podcast, or a post on X into a page with your take on top and the source underneath. Every annotation links back to its source.</p>
      <p class="webGet"><a class="primary sm" href="/annotated-extension.zip" download>Get the Chrome extension</a> <a href="/install" class="link">How to install it</a></p>`;
    main.prepend(box);
  }

  async function home(tag) {
    let all = [];
    try { all = await Cloud.list({ limit: 100 }); } catch {}
    all.forEach((r) => { r.mine = !!(me && r.author && r.author.id === me.id); });
    remember(all);
    const soc = await discover();
    const mine = all.filter((r) => r.mine);
    const social = soc ? { ...soc, you: youOf(soc, mine.length) } : null;
    let records = all;
    if (!tag && soc) {
      const tabs = Cloud.homeTabs(all, soc, me, mine);
      const cur = tabs[tab] ? tab : 'foryou';
      records = tabs[cur].records;
      social.tabs = { current: cur, note: tabs[cur].note, onTab: (k) => { tab = k; try { localStorage.setItem(TAB_KEY, k); } catch {} home(tag); } };
    }
    document.title = tag ? `${tag} | annotated` : 'annotated';
    AnnotationPage.renderFeed(page, { records, tag, mode: 'home', social, ...nav });
    headerAccount();
    if (!tag) intro();
  }

  async function profile(handle) {
    const { data: p } = await Backend.client.from('profiles').select('id, handle, display_name, avatar_url').eq('handle', handle).maybeSingle();
    if (!p) return notFound('Nobody has that handle.');
    let records = [];
    try { records = await Cloud.list({ authorId: p.id, limit: 80 }); } catch {}
    records.forEach((r) => { r.mine = !!(me && me.id === p.id); });
    remember(records);
    const person = me && me.id === p.id ? null : { id: p.id, name: p.display_name || p.handle, handle: p.handle, avatar: p.avatar_url || '' };
    const soc = await discover({ personId: p.id });
    const social = soc ? { ...soc, you: youOf(soc, me && me.id === p.id ? records.length : 0) } : null;
    if (social && !person) { social.onFollow = null; social.personStats = soc.personStats; }
    document.title = `${p.display_name || p.handle} | annotated`;
    const deleteAll = me && me.id === p.id ? async (progress) => {
      const all = records.slice(), failed = [];
      let done = 0;
      for (const r of all) {
        try { await Cloud.remove(r.id, me.id); } catch (e) { failed.push(e.message || 'It is still online.'); continue; }
        progress(++done, all.length);
      }
      if (!failed.length) location.reload();
      return failed;
    } : null;
    AnnotationPage.renderFeed(page, { records, mode: 'profile', person, social, onDeleteAll: deleteAll, ...nav });
    headerAccount();
    if (me && me.id === p.id) {
      const out = document.createElement('button');
      out.type = 'button'; out.className = 'link webSignOut'; out.textContent = 'Sign out';
      out.addEventListener('click', async () => { await Backend.signOut(); location.reload(); });
      const head = page.querySelector('.feedHead'); if (head) head.appendChild(out);
    }
  }

  async function annotation(id) {
    const rec = await Cloud.get(id).catch(() => null);
    if (!rec) return notFound('This annotation was deleted, or the link is wrong.');
    const mine = !!(me && rec.author && rec.author.id === me.id);
    const sc = await Cloud.social(id, me && me.id).catch(() => null);
    if (sc && rec.take.poll) rec.take = { ...rec.take, poll: { ...rec.take.poll, counts: sc.poll.counts, vote: sc.poll.vote } };
    let records = [];
    try { records = await Cloud.list({ authorId: rec.author && rec.author.id, limit: 40 }); } catch {}
    remember(records); handleOf.set(id, (rec.author && rec.author.handle) || 'annotated');
    const title = AnnotationPage.titleOf(rec.item);
    document.title = `${rec.take.text || title} | annotated`;
    const soc = await discover();
    const social = soc ? { ...soc, followsAuthor: !!(rec.author && soc.followed.has(rec.author.id)), you: youOf(soc, 0) } : null;
    const needSignIn = () => { if (!me) { if (confirm('Sign in with Google to comment, react or vote?')) signIn(); return true; } return false; };
    await AnnotationPage.render(page, {
      id, item: rec.item, take: rec.take, created: rec.created,
      author: mine ? null : rec.author, mine,
      permalink: location.origin + linkFor(id),
      backLabel: { video: 'Watch the original', post: 'See the post on X', audio: 'Listen to the episode' }[rec.item.kind] || 'Read the original',
      showBanner: false,
      stats: { annotations: records.filter((r) => r.mine || !r.author).length, followers: 0 },
      comments: sc ? sc.comments : [], reactions: sc ? sc.reactions : [], records, social,
    }, {
      ...nav,
      onProfile: () => { location.href = '/@' + ((rec.author && rec.author.handle) || ''); },
      onBack: () => { const u = AnnotationPage.srcUrlOf(rec.item); if (/^https?:\/\//.test(u)) location.href = u; },
      onComments: async (list, change = {}) => {
        if (needSignIn()) return;
        try {
          if (change.added) change.added.dbId = await Cloud.addComment(id, me.id, change.added.text, change.added.gif);
          if (change.removed && change.removed.dbId) await Cloud.deleteComment(change.removed.dbId);
          if (change.reaction && change.comment && change.comment.dbId) await Cloud.reactComment(change.comment.dbId, me.id, change.reaction.emoji, change.reaction.on);
        } catch (e) { alert('That did not save. ' + (e.message || '')); }
      },
      onReactions: async (list, change) => { if (needSignIn() || !change) return; await Cloud.react(id, me.id, change.emoji, change.on); },
      onPollVote: async (vote) => { if (needSignIn()) return; await Cloud.vote(id, me.id, vote); },
      onClaim: (data) => Cloud.claim(id, data).then((r) => { if (r.error) throw r.error; }),
      ...(mine ? {
        onDelete: async () => { await Cloud.remove(id, me.id); location.href = '/@' + me.handle; },
        onEdit: async ({ text, tag }) => { await Cloud.edit(id, { text, tag }); document.title = `${text || title} | annotated`; },
      } : {}),
    });
    headerAccount();
  }

  function notFound(msg) {
    document.title = 'Not found | annotated';
    page.className = 'ann';
    page.innerHTML = '<div class="emptyState shellEmpty"><p class="esTitle">Not found</p><p class="esWhy"></p><p><a href="/">See annotations</a></p></div>';
    page.querySelector('.esWhy').textContent = msg;
  }

  if (parts[0] && parts[0].startsWith('@') && parts[1]) await annotation(parts[1]);
  else if (parts[0] && parts[0].startsWith('@')) await profile(parts[0].slice(1));
  else await home(query.get('tag'));
})();

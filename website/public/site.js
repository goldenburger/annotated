// annotated.app pages: the home feed at /, a person's profile at /@handle, and one annotation at /@handle/id.
// Everything comes from the shared database. Reading needs no account. Commenting, reacting and voting use
// Google sign-in, which returns to the same page.
(async () => {
  Prefs.init(Prefs.localBackend());
  const page = document.getElementById('page');
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const query = new URLSearchParams(location.search);
  // The front page waits for nothing on the network. Whether anyone is signed in is read from this browser,
  // which is instant, and a visitor's front page is drawn before the database is asked anything. It used to
  // wait on the profile and the whole feed, which left a blank page for a second, and for good when the
  // database could not be reached.
  const frontPage = !parts.length && !query.has('tag') && !query.has('feed');
  if (frontPage && typeof Landing !== 'undefined') {
    let session = null;
    try { session = (await Backend.client.auth.getSession()).data.session; } catch { /* no storage */ }
    if (!session || query.has('try')) {
      const signInNow = () => Backend.signIn().catch(() => {});
      const land = Landing.mount(page, { signedIn: !!session, onSignIn: signInNow });
      document.title = 'annotated: say what you think about anything on the web';
      Cloud.list({ limit: 24 }).then((all) => land.fillLatest(all, (id) => {
        const r = all.find((x) => x.id === id); location.href = `/@${(r && r.author && r.author.handle) || 'annotated'}/${encodeURIComponent(id)}`;
      })).catch(() => { /* no row, then */ });
      return;
    }
  }
  // An annotation or a profile takes a moment to arrive, so its outline is drawn at once rather than a blank
  // page with only the footer, which is what opening one from the front page used to show for a second or more.
  if (parts.length) {
    page.innerHTML = `<div class="skel" aria-busy="true" aria-label="Loading">
      <header class="sitebar"><a class="wmBtn" href="/" aria-label="annotated home">${typeof Brand !== 'undefined' ? Brand.wordmark() : 'annotated'}</a></header>
      <div class="skelBody"><div class="skelCol"><i class="sk1"></i><i class="sk2"></i><i class="sk3"></i><i class="sk4"></i><i class="sk5"></i></div>
      <div class="skelRail"><i></i><i></i></div></div></div>`;
  }
  let me = null;
  try { me = await Backend.profile(); AnnotationPage.setMe(me); } catch {}
  const handleOf = new Map();
  const linkFor = (id) => `/@${handleOf.get(id) || 'annotated'}/${encodeURIComponent(id)}`;
  const remember = (records) => records.forEach((r) => handleOf.set(r.id, (r.author && r.author.handle) || 'annotated'));
  const signIn = () => Backend.signIn().catch((e) => AnnotationPage.signInPrompt({ text: 'Sign-in did not start. ' + e.message }));
  // Back is only offered when the page behind you is one of ours. A same origin referrer is how you know,
  // and it is set by every link and every location change this site makes.
  const cameFromHere = () => { try { return new URL(document.referrer).origin === location.origin; } catch { return false; } };
  let tab = Cloud.savedTab(), pressed = false;
  const discover = (opts = {}) => Cloud.discovery(me, { signIn, onPerson: (h) => { location.href = '/@' + h; }, ...opts }).catch(() => null);
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
      b.type = 'button'; b.className = 'navBtn webSignIn'; b.innerHTML = 'Sign in<span class="wideOnly"> with Google</span>'; b.setAttribute('aria-label', 'Sign in with Google');
      b.addEventListener('click', signIn);
      navEl.appendChild(b);
      const you = navEl.querySelector('.navProfile'); if (you) you.hidden = true;
    }
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
      // The same opening tab as the extension's Home: an empty For you gives way to Everyone.
      const cur = Cloud.startTab(tabs, tab, pressed);
      records = tabs[cur].records;
      social.tabs = { current: cur, note: tabs[cur].note, empty: tabs[cur].empty, onTab: (k) => { tab = k; pressed = true; Cloud.saveTab(k); home(tag); } };
    }
    document.title = tag ? `${tag} | annotated` : 'annotated';
    AnnotationPage.renderFeed(page, { records, yours: mine, tag, mode: 'home', social, ...nav });
    headerAccount();
    // Signed in, the front page is the feed, with the try-it one line away.
    if (!tag && me && typeof Landing !== 'undefined') Landing.slimLine(page);
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
    if (Cloud.markOpened) Cloud.markOpened(id);
    const title = AnnotationPage.titleOf(rec.item);
    document.title = `${rec.take.text || title} | annotated`;
    const soc = await discover();
    const social = soc ? { ...soc, followsAuthor: !!(rec.author && soc.followed.has(rec.author.id)), you: youOf(soc, 0) } : null;
    const needSignIn = () => { if (!me) { AnnotationPage.signInPrompt({ text: 'Sign in with Google to comment, react or vote.', onSignIn: signIn }); return true; } return false; };
    await AnnotationPage.render(page, {
      id, item: rec.item, take: rec.take, created: rec.created,
      author: mine ? null : rec.author, mine,
      permalink: location.origin + linkFor(id),
      // The source has its own control now, so this one is free to mean what it says. It is offered only
      // when the page behind you is one of ours, which a same origin referrer is how you know.
      backLabel: 'Back',
      showBanner: false,
      stats: { annotations: records.filter((r) => r.mine || !r.author).length, followers: 0 },
      comments: sc ? sc.comments : [], reactions: sc ? sc.reactions : [], records, social,
      // Who is signed in, so "Your recent annotations" lists yours. The records here are the author's.
      youId: me && me.id,
    }, {
      ...nav,
      onProfile: () => { location.href = '/@' + ((rec.author && rec.author.handle) || ''); },
      onBack: cameFromHere() ? () => history.back() : null,
      onComments: async (list, change = {}) => {
        if (needSignIn()) return;
        try {
          if (change.added) change.added.dbId = await Cloud.addComment(id, me.id, change.added.text, change.added.gif, change.added.upload);
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
    // Most people arrive here from a link on X, not from the front page. Signed out, the page ends by
    // offering to make one, starting with the try-it on the front page, which needs nothing installed.
    if (!me) {
      const main = page.querySelector('.sitemain');
      if (main && !main.querySelector('.makeOne')) {
        const m = document.createElement('section');
        m.className = 'makeOne';
        m.innerHTML = `<h2>Make one like this</h2>
          <p>Mark the words that matter in any article, clip a moment from a video or a podcast, or keep a post from X, and say what you think.
            It gets a page like this one, with the source linked underneath.</p>
          <p class="moRow"><a class="primary" href="/#try">Try it now, nothing to install</a><a class="link" href="/install">Get the Chrome extension</a></p>`;
        main.appendChild(m);
      }
    }
  }

  function notFound(msg) {
    document.title = 'Not found | annotated';
    page.className = 'ann';
    AnnotationPage.stopClock(page);
    page.innerHTML = '<div class="emptyState shellEmpty"><p class="esTitle">Not found</p><p class="esWhy"></p><p><a href="/">See annotations</a></p></div>';
    page.querySelector('.esWhy').textContent = msg;
  }

  if (parts[0] && parts[0].startsWith('@') && parts[1]) await annotation(parts[1]);
  else if (parts[0] && parts[0].startsWith('@')) await profile(parts[0].slice(1));
  else await home(query.get('tag'));
})();

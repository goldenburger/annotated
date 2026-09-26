// annotated.app pages: the home feed at /, a person's profile at /@handle, and one annotation at /@handle/id.
// Everything comes from the shared database. Reading needs no account. Commenting, reacting and voting use
// Google sign-in, which returns to the same page.
// The code for reading and writing annotations (emoji, the take box, GIFs, waveforms) is loaded only by the pages
// that show annotations: a visitor's front page never uses it, and it was about 69 KB of the page (audit of
// 2026-09-24). It is loaded in order, with the version this page was stamped with.
const SITE_V = (document.currentScript && new URL(document.currentScript.src, location.href).searchParams.get('v')) || '';
const loadReading = () => ['/emoji-data.js', '/emojikit.js', '/giphy.js', '/compose.js', '/waveform.js', '/gifmaker.js']
  .reduce((p, src) => p.then(() => new Promise((res) => {
    const el = document.createElement('script'); el.src = src + (SITE_V ? '?v=' + SITE_V : '');
    el.onload = res; el.onerror = res; document.head.appendChild(el);
  })), Promise.resolve());
// A tab left open across a new release catches up when it is next looked at. The logo on the extension's pages
// switched to a home page tab opened before a deploy, and it showed the old wording (recording of 2026-09-25 at
// 23:23, 0:41). It reloads only when nothing is being typed or made, and asks at most once a minute.
let versionAsked = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !SITE_V || Date.now() - versionAsked < 60000) return;
  versionAsked = Date.now();
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const m = html.match(/site\.js\?v=([0-9.]+)/);
    if (!m || m[1] === SITE_V) return;
    const busy = [...document.querySelectorAll('textarea, input[type="text"], input:not([type])')].some((x) => x.value.trim() || x === document.activeElement)
      || document.querySelector('.tryit .tiText mark, .pl-layer');
    if (!busy) location.reload();
  } catch { /* offline: stay as it is */ }
});
// Signing in or out in another tab reaches this one. A tab opened before a sign-in went on offering Sign in with
// Google, and one opened before a sign-out went on showing the account (recording of 2026-09-25 at 03:54, 2:50).
// The change arrives while this tab is in the background, so it is drawn again when it is next looked at, and at
// once if it is in front, which only happens when two windows are side by side.
addEventListener('storage', (e) => {
  if (e.key !== 'annotated-auth') return;
  const had = !!e.oldValue, has = !!e.newValue;
  if (had === has) return;
  if (document.visibilityState === 'visible') location.reload();
  else document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') location.reload(); }, { once: true });
});
// One account on both. Signed out here, the sign-in buttons name the account the extension uses. Signed in here
// as someone else, a line says so and offers to switch (recording of 2026-09-25 at 03:54).
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
function matchExtension(me) {
  const ext = Backend.extUser && Backend.extUser();
  document.querySelectorAll('.webSignIn').forEach((b) => {
    if (!b.dataset.plain) b.dataset.plain = b.innerHTML;
    b.innerHTML = ext && ext.name ? `Sign in as ${firstName(ext.name)}` : b.dataset.plain;
    b.setAttribute('aria-label', ext && ext.name ? `Sign in with Google as ${ext.name}` : 'Sign in with Google');
  });
  const old = document.querySelector('.acctMismatch'); if (old) old.remove();
  if (!me || !ext || ext.id === me.id) return;
  const bar = document.createElement('p');
  bar.className = 'acctMismatch'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span></span> <button type="button" class="link amSwitch"></button>';
  bar.querySelector('span').textContent = `You're signed in here as ${me.name}, and in the extension as ${ext.name || ext.email}.`;
  bar.querySelector('.amSwitch').textContent = `Use ${firstName(ext.name) || ext.email} here`;
  bar.querySelector('.amSwitch').addEventListener('click', async () => { await Backend.signOut().catch(() => {}); Backend.signIn({ hint: ext.email }).catch(() => {}); });
  document.body.prepend(bar);
}
(async () => {
  Prefs.init(Prefs.localBackend());
  const page = document.getElementById('page');
  // Coming back from Google, the sign-in library takes its code out of the address and writes the rest back as
  // "?feed=" (recording of 2026-09-25 at 06:58, 1:08). A flag with no value is written back as it was.
  const tidy = () => { if (/[?&][\w-]+=(?=&|$)/.test(location.search)) history.replaceState(history.state, '', location.pathname + location.search.replace(/([?&][\w-]+)=(?=&|$)/g, '$1') + location.hash); };
  tidy(); setTimeout(tidy, 1500);
  Backend.client.auth.onAuthStateChange(() => setTimeout(tidy, 0));
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
    // The home page for everyone, signed in or not. Signed in it used to be the feed, so "Open annotated's home
    // page" landed on an empty feed and the example was one small link away (recording of 2026-09-25 at 05:34).
    // The feed is at /?feed, a link in the header.
    {
      const signInNow = () => Backend.signIn().catch(() => {});
      const visitor = query.get('preview') === 'visitor';
      const meta = session ? (session.user.user_metadata || {}) : {};
      const me = session ? { name: meta.full_name || meta.name || '', avatar: meta.avatar_url || meta.picture || '' } : null;
      // You goes to your profile, never the feed. It fell back to the feed whenever the account took a moment to
      // read (recording of 2026-09-25 at 14:08, 2:16), so it waits for it, and otherwise uses the handle this
      // browser last saw for this account.
      const toProfile = async () => {
        const known = Backend.lastHandle && Backend.lastHandle(session && session.user.id);
        const p = await Promise.race([Backend.profile().catch(() => null), new Promise((r) => setTimeout(() => r(null), 3000))]);
        const h = (p && p.handle) || known;
        if (h) location.href = '/@' + h; else signInNow();
      };
      const land = Landing.mount(page, { signedIn: !!session && !visitor, onSignIn: signInNow, me, onProfile: toProfile });
      document.title = 'annotated: say what you think about anything on the web';
      void land;
      const who = session ? { id: session.user.id, name: ((session.user.user_metadata || {}).full_name) || 'another account' } : null;
      matchExtension(who);
      document.addEventListener('annotated-user', () => matchExtension(who));
      return;
    }
  }
  // The feed's list and who you are are asked for while the page's code loads, not one after another. The feed
  // sat blank for two to four seconds (recording of 2026-09-25 at 03:54, 1:30 and 2:06).
  let earlyList = !parts.length && !query.has('tag') ? Cloud.list({ limit: 100 }).catch(() => null) : null;
  // A list is asked for again before it is called empty: a request that failed once drew "0 annotations" and
  // "Nothing here yet" on a profile with three (recording of 2026-09-25 at 23:23, 2:51). null means it did not load.
  const listOrNull = async (opts, first = null) => {
    if (first) { const r = await first; if (r) return r; }
    for (let i = 0; i < 3; i++) {
      try { return await Cloud.list(opts); } catch {}
      await new Promise((res) => setTimeout(res, 600 * (i + 1)));
    }
    return null;
  };
  const meP = Backend.profile().catch(() => null);
  // An annotation, a profile or the feed takes a moment to arrive, so its outline is drawn at once, before the
  // page's code has even loaded, rather than a blank page with only the footer (the feed showed that for one to
  // two seconds in the recording of 2026-09-25 at 04:48).
  // The outline carries the header's Feed and You (or Sign in), so they do not pop in a second later (recording of
  // 2026-09-25 at 14:08, 1:05, 1:17 and 2:21). Whether anyone is signed in is read from this browser.
  let hasSession = false; try { hasSession = !!localStorage.getItem('annotated-auth'); } catch { /* no storage */ }
  page.innerHTML = `<div class="skel" aria-busy="true" aria-label="Loading">
    <header class="sitebar"><a class="wmBtn" href="/" aria-label="annotated home">${typeof Brand !== 'undefined' ? Brand.wordmark() : 'annotated'}</a>
      <nav class="sitenav" aria-hidden="true"><span class="navBtn">Feed</span>${hasSession ? '<span class="navBtn"><span class="avatar xs"></span> You</span>' : '<span class="navBtn">Sign in<span class="wideOnly"> with Google</span></span>'}</nav></header>
    <div class="skelBody"><div class="skelCol"><i class="sk1"></i><i class="sk2"></i><i class="sk3"></i><i class="sk4"></i><i class="sk5"></i></div>
    <div class="skelRail"><i></i><i></i></div></div></div>`;
  await loadReading();
  let me = null;
  try { me = await meP; AnnotationPage.setMe(me); } catch {}
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
    // The logo is the home page and Feed is the feed (recording of 2026-09-25 at 05:47).
    onHome: () => { location.href = '/'; },
    onAll: () => { location.href = '/?feed'; },
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
    const first = !tag && earlyList; earlyList = null;   // only the first drawing uses it; a tab switch asks again
    const got = await listOrNull({ limit: 100 }, first);
    const all = got || [];
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
    AnnotationPage.renderFeed(page, { records, yours: mine, tag, mode: 'home', social, ...nav, onSignIn: me ? null : signIn, loadFailed: !got, onRetry: () => home(tag) });
    headerAccount();
    // Signed in, the front page is the feed, with the try-it one line away.
  }

  async function profile(handle) {
    const { data: p } = await Backend.client.from('profiles').select('id, handle, display_name, avatar_url').eq('handle', handle).maybeSingle();
    if (!p) return notFound('Nobody has that handle.');
    const got = await listOrNull({ authorId: p.id, limit: 80 });
    const records = got || [];
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
    AnnotationPage.renderFeed(page, { records, mode: 'profile', person, social, onDeleteAll: deleteAll, ...nav, loadFailed: !got, onRetry: () => profile(handle) });
    headerAccount();
    if (me && me.id === p.id) {
      const out = document.createElement('button');
      out.type = 'button'; out.className = 'link webSignOut'; out.textContent = 'Sign out';
      out.addEventListener('click', async () => { await Backend.signOut(); location.reload(); });
      const foot = page.querySelector('.profileFoot') || page.querySelector('.feedHead'); if (foot) foot.appendChild(out);
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
    // Your own card counts your annotations. It said 0 beside one of your own (recording of 2026-09-25 at 03:54).
    const [soc, yours] = await Promise.all([discover(), mine ? records : me ? Cloud.list({ authorId: me.id, limit: 100 }).catch(() => []) : []]);
    const social = soc ? { ...soc, followsAuthor: !!(rec.author && soc.followed.has(rec.author.id)), you: youOf(soc, yours.length) } : null;
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

  // Drawn in the site's own frame, with the header, like every other page. It was a line of small text alone at
  // the top of a blank page (UX audit of 2026-09-25).
  function notFound(msg) {
    document.title = 'Not found | annotated';
    page.className = '';
    AnnotationPage.renderMissing(page, { title: 'Not found', why: msg, ...nav });
    headerAccount();
  }

  if (parts[0] && parts[0].startsWith('@') && parts[1]) await annotation(parts[1]);
  else if (parts[0] && parts[0].startsWith('@')) await profile(parts[0].slice(1));
  else await home(query.get('tag'));
  // A list is read again when you come back to its tab, since the panel or another tab may have changed it. The
  // profile went on showing an annotation the panel had just deleted (recording of 2026-09-25 at 14:08, 2:28).
  // An annotation's own page is left alone, where a comment may be half written.
  if (!(parts[0] && parts[0].startsWith('@') && parts[1])) {
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < 1500 || page.querySelector('.delAllAsk:not([hidden]), textarea:focus')) return;
      hiddenAt = 0;
      const y = scrollY;
      if (parts[0] && parts[0].startsWith('@')) await profile(parts[0].slice(1)); else await home(query.get('tag'));
      scrollTo(0, y);
    });
  }
  matchExtension(me);
  document.addEventListener('annotated-user', () => matchExtension(me));
})();

// Home, profile and tag pages. Home shows For you, Following and Everyone, from everyone's shared annotations
// plus anything saved only on this computer. A profile shows one person's annotations, with Follow.
// This tab only ever shows annotated's own pages, so a mark left by one of them means there is somewhere
// of ours behind us to go back to. A tab opened straight onto a shared link has no mark and no Back.
const beenHereBefore = (() => { try { const had = sessionStorage.getItem('annSeen'); sessionStorage.setItem('annSeen', '1'); return !!had; } catch { return false; } })();
(async () => {
  Prefs.init(Prefs.chromeBackend());
  let me = null;
  // Read on every load for the same reason as the annotation page. One tab serves Home, every profile and
  // every tag, and the account beside it can change without this page reloading.
  // Who you are, waited for three seconds at most: with the network online but nothing getting through the client retried
  // for about seven, and even an annotation kept on this computer sat on its outline. A late answer that differs draws again.
  // A failed read (FAILED) is not signing out, and a late answer never redraws over a box in use or an open question.
  const FAILED = Symbol('failed');
  const inUse = () => [...document.querySelectorAll('textarea, input[type="text"]')].some((b) => b.value && b.offsetParent) || !!document.querySelector('.delAllAsk:not([hidden]), dialog[open], .signAsk');
  const readMe = async () => {
    const p = Backend.profile().catch(() => FAILED);
    const got = await Promise.race([p, new Promise((r) => setTimeout(() => r(undefined), 3000))]);
    if (got === undefined) p.then((v) => { if (v === FAILED || (v && v.id) === (me && me.id)) return; me = v; AnnotationPage.setMe(me); if (!inUse()) load(); });
    else if (got !== FAILED) me = got;
    AnnotationPage.setMe(me);
  };
  const el = document.getElementById('feed');
  const signIn = (p) => Backend.signIn(p).then(() => load()).catch(() => {});
  let tab = Cloud.savedTab(), pressed = false, tabPress = false, homeList = null;

  let loadGen = 0;
  const load = async () => {
    const my = ++loadGen;
    const h = location.hash;
    const m = h.match(/tag=([^&]+)/), u = h.match(/user=([^&]+)/);
    const tag = m ? decodeURIComponent(m[1]) : null;
    const userId = u ? decodeURIComponent(u[1]) : null;
    const mode = h.startsWith('#profile') || userId ? 'profile' : 'home';
    // Asked for together. One after another (who you are, then this computer's copies, then the shared list,
    // then the rail) kept Home blank for about three seconds (recording of 2026-09-25 at 01:15, 2:36).
    // Only your own profile has to wait for who you are before it can ask for the list.
    const meP = readMe();
    // Copies of annotations deleted online are taken off this computer as the list is read (recording of
    // 2026-09-25 at 06:01, where the profile page went on listing one).
    const localP = Store.allMeta().catch(() => []).then((l) => Store.pruneGone(l)).then((p) => p.records);
    const listFor = (authorId) => Cloud.list({ authorId, limit: 100 }).catch(() => []);
    // A tab press draws from the list already read (For you, Following and Everyone are one list).
    const kept = tabPress && homeList && homeList.ok && mode === 'home' && !tag && Date.now() - homeList.at < 60000 ? homeList.p : null;
    tabPress = false;
    const early = mode === 'home' ? (kept || listFor(null)) : userId ? listFor(userId) : null;
    // Kept for tab presses only once it has loaded something; a failed read is tried again on the next press.
    if (mode === 'home' && !tag && !kept) { const entry = { p: early, at: Date.now(), ok: false }; homeList = entry; early.then((l) => { if (l && l.length) entry.ok = true; }); }
    await meP;
    const authorId = userId || (mode === 'profile' && me ? me.id : null);
    // A profile's pinned annotation, and your mutes and blocks for the feed (migration 28).
    const pinP = mode === 'profile' && authorId ? Cloud.pinnedOf(authorId).catch(() => null) : Promise.resolve(null);
    const hideP = mode === 'home' && me ? Cloud.blocks(me.id).catch(() => new Map()) : Promise.resolve(new Map());
    const person0 = userId && !(me && userId === me.id) ? userId : null;
    const socP = Cloud.discovery(me, {
      personId: person0,
      signIn,
      onPerson: (handle) => { Backend.client.from('profiles').select('id').eq('handle', handle).maybeSingle().then(({ data }) => { if (data) location.hash = 'user=' + encodeURIComponent(data.id); }); },
    });
    // Light copies: cards need no clips or full screenshots. A clip is loaded only when you press play.
    const local = await localP;
    // Signed out, "your profile" is only what is saved on this computer.
    const skipShared = mode === 'profile' && !authorId;
    const shared = skipShared ? [] : await (early || listFor(authorId));
    // One card per annotation. A shared one saved here keeps its local file for instant playback.
    const byId = new Map(local.map((r) => [r.id, r]));
    const merged = shared.map((r) => {
      const l = byId.get(r.id);
      r.mine = !!(me && r.author && r.author.id === me.id);
      return l ? { ...r, item: { ...r.item, ...l.item } } : r;
    });
    const sharedIds = new Set(shared.map((r) => r.id));
    const mineOnly = mode === 'profile' && (!userId || (me && userId === me.id));
    // Another account signed in on this computer leaves its annotations in the same store, so on your own
    // profile a local one counts only when nobody else wrote it. The profile of 2026-09-22 listed eight for
    // someone who had written six.
    const notOthers = (r) => !(r.author && r.author.id && (!me || r.author.id !== me.id));
    const localOnly = local.filter((r) => !sharedIds.has(r.id) && (mode === 'home' || (mineOnly && notOthers(r))));
    let records = [...merged, ...localOnly];
    const person = person0 ? (shared[0] && shared[0].author) || { id: userId, name: 'Someone', handle: '' } : null;

    const soc = await socP;
    const [pinnedId, hideMap] = await Promise.all([pinP, hideP]);
    // On your own profile this card sits beside a list of everything you have, so it counts the same things.
    // On Home it counts what you published, because that is what everyone else can see.
    const youCount = mineOnly ? records.length : records.filter((r) => r.mine).length;
    const social = { ...soc, you: me && soc.youCounts ? { annotations: youCount, ...soc.youCounts } : null };
    const yours = records.filter((r) => r.mine || !r.author);
    if (mode === 'home' && !tag) {
      const tabs = Cloud.homeTabs(records, soc, me, records.filter((r) => r.mine || !r.author));
      const cur = Cloud.startTab(tabs, tab, pressed);
      records = tabs[cur].records;
      social.tabs = { current: cur, note: tabs[cur].note, empty: tabs[cur].empty, onTab: (k) => { tab = k; pressed = true; Cloud.saveTab(k); el.classList.add('busy'); tabPress = true; load(); } };
    }
    document.title = tag ? `${tag} | annotated` : person ? `${person.name} | annotated` : mode === 'profile' ? 'Your profile | annotated' : 'Feed | annotated';
    if (my !== loadGen) return;
    el.className = '';   // also clears the busy mark a tab switch puts there
    AnnotationPage.renderFeed(el, {
      records, yours, tag, mode, person, social, pinnedId, hideAuthors: new Set(hideMap.keys()),
      // The panel beside this page already carries Home and your profile.
      siteNav: false,
      // Signed out, your own profile offers signing in right here rather than in the panel.
      onSignIn: !me && mode === 'profile' && !person ? (p) => Backend.signIn(p).catch(() => {}) : null,
      getMedia: async (id) => { const r = await Store.get(id).catch(() => null); return r && r.item ? r.item.blob || null : null; },
      onOpen: (id) => { location.href = 'annotation.html#' + encodeURIComponent(id); },
      onTag: (t) => { location.hash = 'tag=' + encodeURIComponent(t); },
      onAll: () => { location.hash = ''; },
      onHome: () => { location.hash = ''; },
      onProfile: () => { location.hash = 'profile'; },
      // Deleting one at a time meant opening every annotation and coming back. This deletes the whole list.
      // A published one goes from the database and the media bucket first, so nothing is left online.
      onDeleteAll: mineOnly ? async (progress) => {
        const all = records.slice(), failed = [];
        let done = 0;
        deleting = true;
        try {
          for (const r of all) {
            if ((r.cloud || r.author) && me) {
              try { await Cloud.remove(r.id, me.id); } catch (e) { failed.push(e.message || 'It is still online.'); continue; }
            }
            await Store.del(r.id).catch(() => {});
            progress(++done, all.length);
          }
        } finally { deleting = false; }
        await load();
        return failed;
      } : null,
    });
  };
  window.addEventListener('hashchange', load);
  // Annotations deleted or published from the panel beside this page (or another window) change the store's
  // stamp. The page draws again, so it never lists, or offers to delete, what is already gone (recording of
  // 2026-09-24 at 20:19). Its own delete all is left to finish first.
  let deleting = false, again = 0, staleWhileHidden = false;
  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local' || !ch.annotatedStamp || deleting) return;
      // Every reaction and vote moves the stamp, and a feed in a tab nobody is looking at read its whole list for each.
      if (document.hidden) { staleWhileHidden = true; return; }
      clearTimeout(again); again = setTimeout(() => { if (!deleting) load(); }, 400);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && staleWhileHidden && !deleting) { staleWhileHidden = false; load(); } });
  } catch { /* not in the extension */ }
  Backend.onChange((who) => { if ((who && who.id) !== (me && me.id)) load(); });
  load();
})();

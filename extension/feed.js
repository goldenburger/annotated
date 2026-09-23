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
  const readMe = async () => { try { me = await Backend.profile(); } catch { me = null; } AnnotationPage.setMe(me); };
  const el = document.getElementById('feed');
  const signIn = () => alert('Sign in from the annotated panel to follow people.');
  let tab = Cloud.savedTab(), pressed = false;

  const load = async () => {
    await readMe();
    const h = location.hash;
    const m = h.match(/tag=([^&]+)/), u = h.match(/user=([^&]+)/);
    const tag = m ? decodeURIComponent(m[1]) : null;
    const userId = u ? decodeURIComponent(u[1]) : null;
    const mode = h.startsWith('#profile') || userId ? 'profile' : 'home';
    const authorId = userId || (mode === 'profile' && me ? me.id : null);
    // Light copies: cards need no clips or full screenshots. A clip is loaded only when you press play.
    const local = await Store.allMeta().catch(() => []);
    let shared = [];
    // Signed out, "your profile" is only what is saved on this computer.
    const skipShared = mode === 'profile' && !authorId;
    try { if (!skipShared) shared = await Cloud.list({ authorId: mode === 'profile' ? authorId : null, limit: 100 }); } catch {}
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
    const person = userId && !(me && userId === me.id) ? (shared[0] && shared[0].author) || { id: userId, name: 'Someone', handle: '' } : null;

    const soc = await Cloud.discovery(me, {
      personId: person ? person.id : null,
      signIn,
      onPerson: (handle) => { Backend.client.from('profiles').select('id').eq('handle', handle).maybeSingle().then(({ data }) => { if (data) location.hash = 'user=' + encodeURIComponent(data.id); }); },
    });
    // On your own profile this card sits beside a list of everything you have, so it counts the same things.
    // On Home it counts what you published, because that is what everyone else can see.
    const youCount = mineOnly ? records.length : records.filter((r) => r.mine).length;
    const social = { ...soc, you: me && soc.youCounts ? { annotations: youCount, ...soc.youCounts } : null };
    const yours = records.filter((r) => r.mine || !r.author);
    if (mode === 'home' && !tag) {
      const tabs = Cloud.homeTabs(records, soc, me, records.filter((r) => r.mine || !r.author));
      const cur = Cloud.startTab(tabs, tab, pressed);
      records = tabs[cur].records;
      social.tabs = { current: cur, note: tabs[cur].note, empty: tabs[cur].empty, onTab: (k) => { tab = k; pressed = true; Cloud.saveTab(k); el.classList.add('busy'); load(); } };
    }
    document.title = tag ? `${tag} | annotated` : person ? `${person.name} | annotated` : mode === 'profile' ? 'Your profile | annotated' : 'annotated';
    el.className = '';   // also clears the busy mark a tab switch puts there
    AnnotationPage.renderFeed(el, {
      records, yours, tag, mode, person, social,
      // The panel beside this page already carries Home and your profile.
      siteNav: false,
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
        for (const r of all) {
          if ((r.cloud || r.author) && me) {
            try { await Cloud.remove(r.id, me.id); } catch (e) { failed.push(e.message || 'It is still online.'); continue; }
          }
          await Store.del(r.id).catch(() => {});
          progress(++done, all.length);
        }
        await load();
        return failed;
      } : null,
    });
  };
  window.addEventListener('hashchange', load);
  Backend.onChange((who) => { if ((who && who.id) !== (me && me.id)) load(); });
  load();
})();

// Home, profile and tag pages. Home shows For you, Following and Everyone, from everyone's shared annotations
// plus anything saved only on this computer. A profile shows one person's annotations, with Follow.
(async () => {
  Prefs.init(Prefs.chromeBackend());
  let me = null;
  // Pages show the signed-in account's name and photo. Signed out, they fall back to "You".
  try { me = await Backend.profile(); AnnotationPage.setMe(me); } catch {}
  const el = document.getElementById('feed');
  const signIn = () => alert('Sign in from the annotated panel to follow people.');
  const TAB_KEY = 'annotated-feed-tab';
  let tab = (() => { try { return localStorage.getItem(TAB_KEY) || 'foryou'; } catch { return 'foryou'; } })();

  const load = async () => {
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
    const localOnly = local.filter((r) => !sharedIds.has(r.id) && (mode === 'home' || mineOnly));
    let records = [...merged, ...localOnly];
    const person = userId && !(me && userId === me.id) ? (shared[0] && shared[0].author) || { id: userId, name: 'Someone', handle: '' } : null;

    const soc = await Cloud.discovery(me, {
      personId: person ? person.id : null,
      signIn,
      onPerson: (handle) => { Backend.client.from('profiles').select('id').eq('handle', handle).maybeSingle().then(({ data }) => { if (data) location.hash = 'user=' + encodeURIComponent(data.id); }); },
    });
    const social = { ...soc, you: me && soc.youCounts ? { annotations: records.filter((r) => r.mine || !r.author).length, ...soc.youCounts } : null };
    if (mode === 'home' && !tag) {
      const tabs = Cloud.homeTabs(records, soc, me, records.filter((r) => r.mine || !r.author));
      const cur = tabs[tab] ? tab : 'foryou';
      records = tabs[cur].records;
      social.tabs = { current: cur, note: tabs[cur].note, onTab: (k) => { tab = k; try { localStorage.setItem(TAB_KEY, k); } catch {} load(); } };
    }
    document.title = tag ? `${tag} | annotated` : person ? `${person.name} | annotated` : mode === 'profile' ? 'You | annotated' : 'annotated';
    el.className = '';
    AnnotationPage.renderFeed(el, {
      records, tag, mode, person, social,
      getMedia: async (id) => { const r = await Store.get(id).catch(() => null); return r && r.item ? r.item.blob || null : null; },
      onOpen: (id) => { location.href = 'annotation.html#' + encodeURIComponent(id); },
      onTag: (t) => { location.hash = 'tag=' + encodeURIComponent(t); },
      onAll: () => { location.hash = ''; },
      onHome: () => { location.hash = ''; },
      onProfile: () => { location.hash = 'profile'; },
    });
  };
  window.addEventListener('hashchange', load);
  load();
})();

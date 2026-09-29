// Backend: Supabase for accounts and shared data. Extension pages only.
// The publishable key is public by design. What people can read and change is enforced by the database's
// row level security rules, so this key cannot be used to touch anyone else's data.
const Backend = (() => {
  const SUPABASE_URL = 'https://efuotxdeifqzdfsavekb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Nc3I3-tOJpOQgAS37SfaFg_qyaGKYKk';
  // Sessions live in chrome.storage, so every panel, page and window of the extension shares one sign-in.
  const storage = {
    getItem: async (k) => { const o = await chrome.storage.local.get(k); return o[k] ?? null; },
    setItem: (k, v) => chrome.storage.local.set({ [k]: v }),
    removeItem: (k) => chrome.storage.local.remove(k),
  };
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storage, storageKey: 'annotated-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
  });

  // Sign-in with Google or X: Supabase hands off to the one chosen, it returns to the extension's own address,
  // and the one-time code is swapped for a session here. Connecting X to an account already signed in is the
  // same trip through linkIdentity, so one person keeps one account whichever way they come in.
  async function roundTrip(data) {
    let back;
    try { back = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true }); }
    catch (e) { throw new Error(/cancel|closed|did not approve/i.test(e.message) ? 'Sign-in was cancelled.' : e.message); }
    const u = new URL(back);
    const hash = new URLSearchParams(u.hash.slice(1));
    const code = u.searchParams.get('code');
    if (!code) throw new Error(u.searchParams.get('error_description') || hash.get('error_description') || 'Sign-in did not finish.');
    const r = await client.auth.exchangeCodeForSession(code);
    if (r.error) throw r.error;
    return profile();
  }
  async function signIn(provider = 'google') {
    const redirectTo = chrome.identity.getRedirectURL();
    const x = provider === 'x';
    const { data, error } = await client.auth.signInWithOAuth({
      provider: x ? 'x' : 'google',
      options: { redirectTo, skipBrowserRedirect: true, ...(x ? {} : { queryParams: { prompt: 'select_account' } }) },
    });
    if (error) throw error;
    return roundTrip(data);
  }
  // Which ways in this account has, from Supabase's list of its identities: ['google'], ['x'] or both.
  async function ways() {
    try { const { data } = await client.auth.getUserIdentities(); return (data && data.identities || []).map((i) => i.provider); } catch { return []; }
  }
  async function connectX() {
    const { data, error } = await client.auth.linkIdentity({ provider: 'x', options: { redirectTo: chrome.identity.getRedirectURL(), skipBrowserRedirect: true } });
    if (error) throw new Error(/manual linking/i.test(error.message) ? 'Connecting X is not switched on yet.' : error.message);
    return roundTrip(data);
  }
  // Signing out always leaves this computer signed out. The library keeps the stored session when it cannot load it (a
  // laptop waking offline with an expired token), and it came back once the network did; on a shared computer the
  // next person could publish as the last. The session is then taken out of storage here, and listeners are told.
  async function signOut() {
    let r = null;
    try { r = await client.auth.signOut(); } catch (e) { r = { error: e }; }
    if (r && r.error) {
      try { await chrome.storage.local.remove(['annotated-auth', 'annotated-auth-code-verifier', 'annotated-auth-user']); } catch { /* nothing stored */ }
      tell(null);
    }
  }
  // Who was signed in last on this computer. Kept after signing out so lists can still leave you out of them.
  const LAST = 'annotated-last-id';
  async function lastId() { try { const o = await chrome.storage.local.get(LAST); return o[LAST] || null; } catch { return null; } }

  // The signed-in person's profile, or null when signed out.
  async function profile() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const u = session.user, meta = u.user_metadata || {};
    const { data, error } = await client.from('profiles').select('id, handle, display_name, avatar_url').eq('id', u.id).maybeSingle();
    try { chrome.storage.local.set({ [LAST]: u.id }); } catch { /* nothing to remember with */ }
    // A read that failed is not a changed handle: the last good answer for this person stands (it redrew every open
    // panel with no handle, and a publish then got the fallback link).
    if (error && goodProfile && goodProfile.id === u.id) return goodProfile;
    const p = {
      id: u.id,
      email: u.email || '',
      name: (data && data.display_name) || meta.full_name || meta.name || (u.email || '').split('@')[0] || 'You',
      handle: (data && data.handle) || '',
      avatar: (data && data.avatar_url) || meta.avatar_url || meta.picture || '',
    };
    if (!error) goodProfile = p;
    return p;
  }
  let goodProfile = null;
  // Only a real change reaches the listener. Supabase tells every open page of ours "signed in" again whenever
  // another of them opens, which in the recording of 2026-09-23 at 03:16 redrew the panel three times while a
  // button was being pressed, and the press was lost each time (Back, and Back to what you were reading).
  const sigOf = (p) => (p ? [p.id, p.handle, p.name, p.avatar].join('|') : '');
  // One subscription for all of them, and one profile read per change: each listener used to subscribe and read the
  // profile itself, two reads per open panel whenever any page of ours opened. A newcomer is told who is signed in
  // straight away, as the library's first event told it before.
  const subs = [];
  let subscribed = false, asking = false, again = false;
  function tell(p) { const s = sigOf(p); subs.forEach((x) => { if (x.last === s) return; x.last = s; try { x.cb(p); } catch (e) { console.warn('annotated:', e); } }); }
  function ask() {
    if (asking) { again = true; return; }
    asking = true;
    setTimeout(() => profile().then(tell, () => {}).finally(() => { asking = false; if (again) { again = false; ask(); } }), 0);
  }
  // Asked again by hand, as after a handle change: this page, and every other one through storage.
  function refreshWho() { ask(); try { chrome.storage.local.set({ annotatedWho: Date.now() }); } catch { /* not in the extension */ } }
  function onChange(cb) {
    subs.push({ cb, last: undefined });
    if (!subscribed) {
      subscribed = true; client.auth.onAuthStateChange(() => ask());
      // The session removed from storage by another page's sign-out: this page asks again who is signed in.
      try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ((ch['annotated-auth'] && !ch['annotated-auth'].newValue) || ch.annotatedWho)) { ask(); } }); } catch { /* not in the extension */ }
    } else ask();
  }
  // Where shared annotations live on the web: https://annotated-app.netlify.app/@handle/id
  const SITE = 'https://annotated-app.netlify.app';
  const permalink = (id, handle) => `${SITE}/@${handle || 'annotated'}/${encodeURIComponent(id)}`;
  return { refreshWho, client, signIn, ways, connectX, signOut, profile, lastId, onChange, url: SUPABASE_URL, key: SUPABASE_KEY, site: SITE, permalink };
})();

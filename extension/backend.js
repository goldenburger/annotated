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
  async function signOut() { await client.auth.signOut(); }
  // Who was signed in last on this computer. Kept after signing out so lists can still leave you out of them.
  const LAST = 'annotated-last-id';
  async function lastId() { try { const o = await chrome.storage.local.get(LAST); return o[LAST] || null; } catch { return null; } }

  // The signed-in person's profile, or null when signed out.
  async function profile() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const u = session.user, meta = u.user_metadata || {};
    const { data } = await client.from('profiles').select('id, handle, display_name, avatar_url').eq('id', u.id).maybeSingle();
    try { chrome.storage.local.set({ [LAST]: u.id }); } catch { /* nothing to remember with */ }
    return {
      id: u.id,
      email: u.email || '',
      name: (data && data.display_name) || meta.full_name || meta.name || (u.email || '').split('@')[0] || 'You',
      handle: (data && data.handle) || '',
      avatar: (data && data.avatar_url) || meta.avatar_url || meta.picture || '',
    };
  }
  // Only a real change reaches the listener. Supabase tells every open page of ours "signed in" again whenever
  // another of them opens, which in the recording of 2026-09-23 at 03:16 redrew the panel three times while a
  // button was being pressed, and the press was lost each time (Back, and Back to what you were reading).
  const sigOf = (p) => (p ? [p.id, p.handle, p.name, p.avatar].join('|') : '');
  function onChange(cb) {
    let last;
    client.auth.onAuthStateChange(() => {
      setTimeout(() => profile().catch(() => null).then((p) => { const s = sigOf(p); if (s === last) return; last = s; cb(p); }), 0);
    });
  }
  // Where shared annotations live on the web: https://annotated-app.netlify.app/@handle/id
  const SITE = 'https://annotated-app.netlify.app';
  const permalink = (id, handle) => `${SITE}/@${handle || 'annotated'}/${encodeURIComponent(id)}`;
  return { client, signIn, ways, connectX, signOut, profile, lastId, onChange, url: SUPABASE_URL, key: SUPABASE_KEY, site: SITE, permalink };
})();

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

  // Google sign-in: Supabase hands off to Google, Google returns to the extension's own address,
  // and the one-time code is swapped for a session here.
  async function signIn() {
    const redirectTo = chrome.identity.getRedirectURL();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
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
  async function signOut() { await client.auth.signOut(); }

  // The signed-in person's profile, or null when signed out.
  async function profile() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const u = session.user, meta = u.user_metadata || {};
    const { data } = await client.from('profiles').select('id, handle, display_name, avatar_url').eq('id', u.id).maybeSingle();
    return {
      id: u.id,
      email: u.email || '',
      name: (data && data.display_name) || meta.full_name || meta.name || (u.email || '').split('@')[0] || 'You',
      handle: (data && data.handle) || '',
      avatar: (data && data.avatar_url) || meta.avatar_url || meta.picture || '',
    };
  }
  function onChange(cb) { client.auth.onAuthStateChange(() => { setTimeout(() => profile().then(cb).catch(() => cb(null)), 0); }); }
  // Where shared annotations live on the web: https://annotated-app.netlify.app/@handle/id
  const SITE = 'https://annotated-app.netlify.app';
  const permalink = (id, handle) => `${SITE}/@${handle || 'annotated'}/${encodeURIComponent(id)}`;
  return { client, signIn, signOut, profile, onChange, url: SUPABASE_URL, site: SITE, permalink };
})();

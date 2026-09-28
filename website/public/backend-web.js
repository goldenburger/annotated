// Backend for the annotated website. Same Supabase project as the extension, with the sign-in kept in this
// browser's storage and Google sign-in returning to the page you were on.
// The publishable key is public by design. What people can read and change is enforced by the database's
// row level security rules.
const Backend = (() => {
  const SUPABASE_URL = 'https://efuotxdeifqzdfsavekb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Nc3I3-tOJpOQgAS37SfaFg_qyaGKYKk';
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storageKey: 'annotated-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  // The account the extension is signed in as, when it is installed and tells this page (article.js). Signing in
  // then goes to Google with that account already picked.
  const extUser = () => { const d = document.documentElement.dataset; return d.annotatedUserId ? { id: d.annotatedUserId, name: d.annotatedUserName || '', email: d.annotatedUserEmail || '' } : null; };
  // Google or X. Called with 'x', or { provider, hint }; the hint picks a Google account and means nothing to X.
  async function signIn(opts = {}) {
    const o = typeof opts === 'string' ? { provider: opts } : opts || {};
    const back = location.origin + location.pathname + location.search;
    if (o.provider === 'x') {
      const { error } = await client.auth.signInWithOAuth({ provider: 'x', options: { redirectTo: back } });
      if (error) throw error;
      return;
    }
    const email = o.hint || (extUser() && extUser().email) || '';
    const queryParams = email ? { login_hint: email } : { prompt: 'select_account' };
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back, queryParams } });
    if (error) throw error;
  }
  async function signOut() { await client.auth.signOut(); }
  // Who was signed in last in this browser. Kept after signing out so lists can still leave you out of them.
  const LAST = 'annotated-last-id';
  // The handle this browser last read for an account, for the moments the database is slow to say.
  const LAST_HANDLE = 'annotated-last-handle';
  const lastHandle = (id) => { try { const v = JSON.parse(localStorage.getItem(LAST_HANDLE) || 'null'); return v && v.id === id ? v.handle : ''; } catch { return ''; } };
  async function lastId() { try { return localStorage.getItem(LAST) || null; } catch { return null; } }
  async function profile() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const u = session.user, meta = u.user_metadata || {};
    const { data } = await client.from('profiles').select('id, handle, display_name, avatar_url').eq('id', u.id).maybeSingle();
    try { localStorage.setItem(LAST, u.id); if (data && data.handle) localStorage.setItem(LAST_HANDLE, JSON.stringify({ id: u.id, handle: data.handle })); } catch { /* nothing to remember with */ }
    return { id: u.id, name: (data && data.display_name) || meta.full_name || meta.name || 'You', handle: (data && data.handle) || '', avatar: (data && data.avatar_url) || meta.avatar_url || meta.picture || '' };
  }
  return { client, signIn, signOut, profile, lastId, lastHandle, extUser, url: SUPABASE_URL };
})();

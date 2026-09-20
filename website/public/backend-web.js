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
  async function signIn() {
    const back = location.origin + location.pathname + location.search;
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back, queryParams: { prompt: 'select_account' } } });
    if (error) throw error;
  }
  async function signOut() { await client.auth.signOut(); }
  async function profile() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const u = session.user, meta = u.user_metadata || {};
    const { data } = await client.from('profiles').select('id, handle, display_name, avatar_url').eq('id', u.id).maybeSingle();
    return { id: u.id, name: (data && data.display_name) || meta.full_name || meta.name || 'You', handle: (data && data.handle) || '', avatar: (data && data.avatar_url) || meta.avatar_url || meta.picture || '' };
  }
  return { client, signIn, signOut, profile, url: SUPABASE_URL };
})();

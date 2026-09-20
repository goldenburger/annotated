// Display preferences. Shared by the extension (chrome.storage) and the preview (localStorage).
// Prefs.init(backend) -> Promise<prefs>. Prefs.set(key, value). Prefs.onChange(fn).
const Prefs = (() => {
  const DEFAULTS = { display: 'side', afterPublish: 'stay', density: 'comfortable', theme: 'system', pageButton: true };
  let backend = null, cur = { ...DEFAULTS };
  const subs = [];
  function apply() {
    const r = document.documentElement;
    // Skip color transitions for a moment, so a theme change never shows half-switched colors.
    const want = cur.theme === 'system' ? null : cur.theme;
    if (r.getAttribute('data-theme') !== want) {
      r.classList.add('noTrans');
      requestAnimationFrame(() => requestAnimationFrame(() => r.classList.remove('noTrans')));
    }
    if (cur.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', cur.theme);
    if (document.body) document.body.classList.toggle('compact', cur.density === 'compact');
  }
  async function init(b) {
    backend = b;
    try { cur = { ...DEFAULTS, ...((await b.load()) || {}) }; } catch { cur = { ...DEFAULTS }; }
    if (b.watch) b.watch((v) => { cur = { ...DEFAULTS, ...(v || {}) }; apply(); subs.forEach((f) => f(cur)); });
    apply();
    return cur;
  }
  async function set(k, v) {
    cur = { ...cur, [k]: v };
    apply();
    subs.forEach((f) => f(cur));
    try { await backend.save(cur); } catch {}
  }
  const chromeBackend = () => ({
    load: () => chrome.storage.local.get('annotatedPrefs').then((o) => o.annotatedPrefs),
    save: (v) => chrome.storage.local.set({ annotatedPrefs: v }),
    watch: (cb) => chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.annotatedPrefs) cb(ch.annotatedPrefs.newValue); }),
  });
  const localBackend = () => ({
    load: async () => { try { return JSON.parse(localStorage.getItem('annotatedPrefs') || 'null'); } catch { return null; } },
    save: async (v) => { try { localStorage.setItem('annotatedPrefs', JSON.stringify(v)); } catch {} },
  });
  return { DEFAULTS, init, set, get: () => cur, onChange: (f) => subs.push(f), apply, chromeBackend, localBackend };
})();

// Display preferences. Shared by the extension (chrome.storage) and the preview (localStorage).
// Prefs.init(backend) -> Promise<prefs>. Prefs.set(key, value). Prefs.onChange(fn).
const Prefs = (() => {
  const DEFAULTS = { display: 'side', afterPublish: 'stay', density: 'comfortable', theme: 'system', pageButton: true, snap: 'exact', pen: 'chisel', tint: 'highlighter', suggest: true, planes: true };
  // The colour the whole thing is drawn in. Light or dark is one question and the hue is another, so they
  // are chosen separately and every colour here works in both. The ink is written out as numbers because
  // the stroke on the page you are reading is injected into a page with no stylesheet of ours, so it cannot
  // ask for a variable. The same six palettes are in ui.css, which is where everything else takes colour.
  const TINTS = [
    // Called Yellow, because Highlighter is also the name of the setting beside it, and it did not fit.
    ['highlighter', 'Yellow', { hi: '#FFE14A', deep: '#F2C600', lift: '#FFEE9E', pending: '#FFF0A8' }],
    ['apricot', 'Apricot', { hi: '#FFC98A', deep: '#F09A42', lift: '#FFE4C6', pending: '#FFE9D2' }],
    ['rose', 'Rose', { hi: '#FFB8D0', deep: '#F2739F', lift: '#FFDCE8', pending: '#FFE3EC' }],
    ['lilac', 'Lilac', { hi: '#CDB8FF', deep: '#9E74EE', lift: '#E7DDFF', pending: '#EDE6FF' }],
    ['sky', 'Sky', { hi: '#93D6FF', deep: '#45AEF0', lift: '#CFEBFF', pending: '#DCF0FF' }],
    ['mint', 'Mint', { hi: '#8FE9BE', deep: '#3FC994', lift: '#CCF6E0', pending: '#D9F8E8' }],
  ];
  const inkOf = (name) => (TINTS.find((t) => t[0] === name) || TINTS[0])[2];
  // "After publishing" was three choices once, and the third closed the panel. Staying where you are is what
  // people wanted, so there are two now, and a choice saved from before that is not "Open the page" is read as
  // staying here rather than as whatever used to sit in that slot.
  const tidy = (o) => { const p = { ...DEFAULTS, ...(o || {}) }; if (p.afterPublish !== 'page') p.afterPublish = 'stay';
    if (!TINTS.some((t) => t[0] === p.tint)) p.tint = DEFAULTS.tint;
    return p; };
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
    r.setAttribute('data-pen', cur.pen);
    r.setAttribute('data-tint', cur.tint);
    if (document.body) document.body.classList.toggle('compact', cur.density === 'compact');
  }
  async function init(b) {
    backend = b;
    try { cur = tidy(await b.load()); } catch { cur = { ...DEFAULTS }; }
    if (b.watch) b.watch((v) => { cur = tidy(v); apply(); subs.forEach((f) => f(cur)); });
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
  return { DEFAULTS, TINTS, inkOf, init, set, get: () => cur, onChange: (f) => subs.push(f), apply, chromeBackend, localBackend };
})();

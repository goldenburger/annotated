// GIF search, for adding one to a take the way you would to a message. GIPHY's beta key allows a hundred
// calls an hour and that allowance is shared by everyone running the extension, so this is thrifty on
// purpose: trending is fetched once and kept, every search is remembered, and a search only goes out once
// you stop typing. Running out means requests are refused rather than charged, and the picker says so.
var Giphy = (() => {
  // A client key, public by design, the same as the one the database uses. GIPHY has no way to restrict it,
  // so the protection is that it can only search for GIFs. Paste yours between the quotes. Without one the
  // GIF button stays out of the way rather than offering something that cannot work.
  const KEY = 'rRDPnp7AZRqQbauDXjtyXxSPSsLSdO6x';
  const BASE = 'https://api.giphy.com/v1/gifs';
  const LIMIT = 24;
  const kept = new Map();
  let busyUntil = 0;

  // The small looping one for the grid, and a bigger one for the annotation page. GIPHY offers several sizes
  // and the names here are theirs.
  const pick = (g) => {
    const i = (g && g.images) || {};
    const small = i.fixed_width_downsampled || i.fixed_width_small || i.fixed_width || i.downsized;
    const full = i.downsized_medium || i.downsized || i.fixed_width || small;
    if (!small || !full || !small.url || !full.url) return null;
    return {
      id: String(g.id || ''),
      preview: String(small.url),
      url: String(full.url),
      w: Number(full.width) || 0,
      h: Number(full.height) || 0,
      alt: String(g.title || g.alt_text || 'A GIF'),
    };
  };

  async function call(path, params) {
    if (!KEY) throw new Error('nokey');
    if (Date.now() < busyUntil) throw new Error('busy');
    const u = new URL(BASE + path);
    u.searchParams.set('api_key', KEY);
    u.searchParams.set('limit', String(LIMIT));
    u.searchParams.set('rating', 'pg-13');
    u.searchParams.set('bundle', 'messaging_non_clips');
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
    const r = await fetch(u.href);
    // Out of allowance for the hour. Nothing is charged, the requests are simply refused until it turns over.
    if (r.status === 429) { busyUntil = Date.now() + 60000; throw new Error('busy'); }
    if (!r.ok) throw new Error('GIF search is not answering right now.');
    const body = await r.json();
    return (body.data || []).map(pick).filter(Boolean);
  }

  // Trending, and each search, are asked for once and then remembered for as long as the panel is open.
  async function list(q) {
    const key = q ? 's:' + q.toLowerCase() : 'trending';
    if (kept.has(key)) return kept.get(key);
    const got = q ? await call('/search', { q }) : await call('/trending', {});
    kept.set(key, got);
    return got;
  }

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // The picker itself, so the take box and the comment box offer the same one rather than two that drift.
  // It fills the element it is given and calls back with whichever GIF was chosen.
  function mount(host, { onPick, onClose, title = 'Add a GIF' } = {}) {
    const x = typeof Brand !== 'undefined' ? Brand.icon('close') : '×';
    host.innerHTML = `<div class="gpHead"><b>${esc(title)}</b><button type="button" class="quiet gpClose" aria-label="Close the GIF picker">${x}</button></div>
      <input type="search" class="gpQ" maxlength="60" aria-label="Search for a GIF" placeholder="Search GIFs">
      <p class="note gpStatus" role="status"></p>
      <div class="gpGrid" role="listbox" aria-label="GIFs"></div>
      <p class="note gpMark">Powered by GIPHY</p>`;
    const grid = host.querySelector('.gpGrid'), status = host.querySelector('.gpStatus');
    let seq = 0, timer = null;
    async function draw(term) {
      const mine = ++seq;
      status.textContent = 'Looking';
      try {
        const got = await api.list(term);
        if (mine !== seq) return;
        status.textContent = got.length ? '' : 'Nothing came back for that.';
        grid.innerHTML = got.map((g, i) => `<button type="button" class="gpItem" role="option" data-i="${i}" aria-label="${esc(g.alt)}">`
          + `<img src="${esc(g.preview)}" alt="" loading="lazy"></button>`).join('');
        grid.querySelectorAll('.gpItem').forEach((b) => b.addEventListener('click', () => onPick && onPick(got[Number(b.dataset.i)])));
      } catch (e) {
        if (mine !== seq) return;
        grid.innerHTML = '';
        status.textContent = e && e.message === 'busy'
          ? 'GIF search has had its fill for this hour. Try again in a minute.'
          : 'GIF search is not answering right now.';
      }
    }
    // A search goes out once you stop typing, rather than on every letter, because the allowance is small.
    host.querySelector('.gpQ').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => draw(e.target.value.trim()), 450);
    });
    host.querySelector('.gpClose').addEventListener('click', () => onClose && onClose());
    return {
      opened() { if (!grid.children.length) draw(''); host.querySelector('.gpQ').focus({ preventScroll: true }); },
      clear() { host.querySelector('.gpQ').value = ''; },
    };
  }

  // The picker asks through this rather than the inner function, so anything holding Giphy can stand in for
  // the search without a network.
  const api = { list, pick, mount, ready: () => !!KEY, resting: () => Date.now() < busyUntil };
  return api;
})();

// Local store for annotations, shared by the side panel, annotation.html and feed.html (same extension origin).
// Two stores: "annotations" holds everything, including clips, screenshots and voice notes. "meta" holds a
// light copy of each (no files, a small thumbnail instead of the screenshot) for lists, feeds and duplicate checks,
// so those never load every clip and screenshot. A change stamp lets the panel skip rereading when nothing changed.
const Store = (() => {
  let dbp = null;
  // A light copy: the files are left out, and flags say which ones exist.
  function light(v) {
    if (!v) return v;
    const { blob, shot, ...item } = v.item || {};
    return {
      ...v,
      item: { ...item, hasMedia: !!blob, hasShot: !!shot, shotThumb: v.item && v.item.shotThumb ? v.item.shotThumb : undefined },
      take: v.take ? { ...v.take, voice: v.take.voice ? { has: true, url: v.take.voice.url } : null } : v.take,
    };
  }
  // A small JPEG of a screenshot, for feed cards.
  async function thumbOf(dataUrl, w = 360) {
    try {
      const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const h = Math.round((bmp.height / bmp.width) * w);
      const c = new OffscreenCanvas(w, Math.min(h, w * 1.2));
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.78 });
      return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
    } catch { return undefined; }
  }
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('annotated', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('annotations')) db.createObjectStore('annotations');
      if (!db.objectStoreNames.contains('meta')) {
        const meta = db.createObjectStore('meta');
        // Existing annotations get their light copy now. Thumbnails are added afterwards.
        r.transaction.objectStore('annotations').openCursor().onsuccess = (e) => {
          const cur = e.target.result;
          if (cur) { meta.put(light(cur.value), cur.key); cur.continue(); }
        };
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (stores, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      const out = fn(...[].concat(stores).map((s) => t.objectStore(s)));
      t.oncomplete = () => res(typeof out === 'function' ? out() : out && out.result);
      t.onerror = () => rej(t.error);
    });
  };
  const stamp = () => { try { chrome.storage.local.set({ annotatedStamp: Date.now() }); } catch {} };
  const allOf = (name) => tx(name, 'readonly', (s) => {
    const rows = [];
    s.openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { rows.push({ id: c.key, ...c.value }); c.continue(); } };
    return () => rows;
  });
  async function put(id, value) {
    const shotThumb = value.item && value.item.shot && !value.item.shotThumb ? await thumbOf(value.item.shot) : undefined;
    const full = shotThumb ? { ...value, item: { ...value.item, shotThumb } } : value;
    await tx(['annotations', 'meta'], 'readwrite', (a, m) => { a.put(full, id); m.put(light(full), id); });
    stamp();
  }
  // Light copies missing a thumbnail (made before the index existed) get one, a few at a time.
  async function backfillThumbs() {
    const metas = await allOf('meta');
    for (const m of metas.filter((x) => x.item && x.item.hasShot && !x.item.shotThumb).slice(0, 20)) {
      const full = await Store.get(m.id);
      if (full && full.item && full.item.shot) await put(m.id, full);
    }
  }
  const Store = {
    put,
    get: (id) => tx('annotations', 'readonly', (s) => s.get(id)),
    count: () => tx('meta', 'readonly', (s) => s.count()),
    async del(id) { await tx(['annotations', 'meta'], 'readwrite', (a, m) => { a.delete(id); m.delete(id); }); stamp(); },
    async update(id, patch) { const v = await this.get(id); if (v) await put(id, { ...v, ...patch }); },
    // Everything, files included. Only for the rare case that needs every file.
    all: () => allOf('annotations'),
    // Light copies, for lists, feeds and duplicate checks. Copies still missing a thumbnail get one first.
    async allMeta() {
      const rows = await allOf('meta');
      if (!rows.some((x) => x.item && x.item.hasShot && !x.item.shotThumb)) return rows;
      await backfillThumbs().catch(() => {});
      return allOf('meta');
    },
    async stamp() { try { return (await chrome.storage.local.get('annotatedStamp')).annotatedStamp || 0; } catch { return 0; } },
  };
  return Store;
})();

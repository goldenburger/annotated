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
      take: v.take ? { ...v.take, voice: v.take.voice ? { has: true, url: v.take.voice.url } : null,
        upload: v.take.upload ? { kind: v.take.upload.kind, url: v.take.upload.url, alt: v.take.upload.alt, has: true } : null } : v.take,
    };
  }
  // A small JPEG of a screenshot, for feed cards.
  // The list copy of a screenshot: wide enough for a feed card on a sharp screen, where 360 read as blurry.
  async function thumbOf(dataUrl, w = 760) {
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
      t.onabort = () => rej(t.error || new Error('Saving on this computer was stopped (the disk may be full).'));
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
      if (!(full && full.item && full.item.shot)) continue;
      const shotThumb = await thumbOf(full.item.shot);
      if (!shotThumb) continue;
      // Written onto the record as it is now, since an update may have landed while the picture was made.
      await tx(['annotations', 'meta'], 'readwrite', (a, mm) => {
        const g = a.get(m.id);
        g.onsuccess = () => { const v = g.result; if (!v || !v.item) return; const next = { ...v, item: { ...v.item, shotThumb } }; a.put(next, m.id); mm.put(light(next), m.id); };
      });
    }
  }
  const Store = {
    put,
    get: (id) => tx('annotations', 'readonly', (s) => s.get(id)),
    count: () => tx('meta', 'readonly', (s) => s.count()),
    // Deleted ones are remembered by id, so opening one later can say it was deleted rather than not found.
    async del(id) {
      await tx(['annotations', 'meta'], 'readwrite', (a, m) => { a.delete(id); m.delete(id); }); stamp();
      try { const g = JSON.parse(localStorage.getItem('annotated-deleted') || '[]').filter((x) => x !== id); g.push(id); localStorage.setItem('annotated-deleted', JSON.stringify(g.slice(-300))); } catch { /* nothing to remember with */ }
    },
    wasDeleted: (id) => { try { return JSON.parse(localStorage.getItem('annotated-deleted') || '[]').includes(id); } catch { return false; } },
    async update(id, patch) {
      if (patch && patch.item) { const v = await this.get(id); if (v) await put(id, { ...v, ...patch }); return; }
      let done = false;
      await tx(['annotations', 'meta'], 'readwrite', (a, m) => {
        const g = a.get(id);
        g.onsuccess = () => { const v = g.result; if (!v) return; const full = { ...v, ...patch }; a.put(full, id); m.put(light(full), id); done = true; };
      });
      if (done) stamp();
    },
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
    // Takes out of a list the published ones that have been deleted online, and removes their copies here, so no
    // page of the extension goes on listing what is gone (recording of 2026-09-25 at 06:01). Answers the list
    // that is left and how many went.
    async pruneGone(records) {
      if (typeof Cloud === 'undefined' || !Cloud.gone) return { records, dropped: 0 };
      const shared = records.filter((r) => r.cloud).map((r) => r.id);
      if (!shared.length) return { records, dropped: 0 };
      const gone = new Set(await Cloud.gone(shared).catch(() => []));
      if (!gone.size) return { records, dropped: 0 };
      for (const id of gone) await Store.del(id).catch(() => {});
      return { records: records.filter((r) => !gone.has(r.id)), dropped: gone.size };
    },
  };
  return Store;
})();

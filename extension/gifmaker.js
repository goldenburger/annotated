// An animated GIF of a clip, made here in the browser. Nothing is uploaded and no service is involved, which
// is why this is written out rather than fetched from somewhere. A GIF has no sound and only 256 colours, so
// it is offered beside the clip rather than instead of it.
var GifMaker = (() => {
  const once = (el, ev) => new Promise((res, rej) => {
    const ok = () => { el.removeEventListener('error', bad); res(); };
    const bad = () => { el.removeEventListener(ev, ok); rej(new Error('The clip could not be read.')); };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });

  // ---- colours -------------------------------------------------------------------------------------
  // Median cut down to 256. Every pixel of every frame is more counting than this needs, so colours are
  // sampled and held at five bits a channel, which is as fine as a GIF can tell them apart anyway.
  function palette(frames, want = 256, step = 7) {
    const counts = new Map();
    for (const f of frames) {
      const d = f.data;
      for (let i = 0; i < d.length; i += 4 * step) {
        const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    let boxes = [[...counts.entries()].map(([k, n]) => [((k >> 10) & 31) << 3, ((k >> 5) & 31) << 3, (k & 31) << 3, n])];
    while (boxes.length < want) {
      // Split whichever box covers the widest range of one colour, which is where the banding would show.
      let pick = -1, chan = 0, spread = -1;
      boxes.forEach((b, i) => {
        if (b.length < 2) return;
        for (let c = 0; c < 3; c++) {
          let lo = 255, hi = 0;
          for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
          if (hi - lo > spread) { spread = hi - lo; pick = i; chan = c; }
        }
      });
      if (pick < 0 || spread <= 0) break;
      const b = boxes[pick].slice().sort((x, y) => x[chan] - y[chan]);
      const half = Math.max(1, Math.min(b.length - 1, Math.floor(b.length / 2)));
      boxes.splice(pick, 1, b.slice(0, half), b.slice(half));
    }
    const pal = boxes.map((b) => {
      let r = 0, g = 0, bl = 0, n = 0;
      for (const p of b) { r += p[0] * p[3]; g += p[1] * p[3]; bl += p[2] * p[3]; n += p[3]; }
      return n ? [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] : [0, 0, 0];
    });
    while (pal.length < 256) pal.push([0, 0, 0]);
    return pal.slice(0, 256);
  }

  // Nearest colour, remembered, because a frame asks for the same few thousand colours over and over.
  function mapper(pal) {
    const seen = new Map();
    return (r, g, b) => {
      const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      const had = seen.get(k);
      if (had !== undefined) return had;
      let best = 0, dist = Infinity;
      for (let i = 0; i < pal.length; i++) {
        const p = pal[i], dr = r - p[0], dg = g - p[1], db = b - p[2];
        const d = dr * dr * 3 + dg * dg * 6 + db * db;
        if (d < dist) { dist = d; best = i; }
      }
      seen.set(k, best);
      return best;
    };
  }

  // Floyd and Steinberg, spreading each colour's error into the pixels not yet visited. Without it a face
  // lit from one side comes out in bands.
  function toIndexes(img, pal, near) {
    const { width: w, height: h } = img;
    const src = Float32Array.from(img.data);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = Math.max(0, Math.min(255, src[i])), g = Math.max(0, Math.min(255, src[i + 1])), b = Math.max(0, Math.min(255, src[i + 2]));
        const k = near(Math.round(r), Math.round(g), Math.round(b));
        out[y * w + x] = k;
        const p = pal[k], er = r - p[0], eg = g - p[1], eb = b - p[2];
        const spill = (dx, dy, f) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny >= h) return;
          const j = (ny * w + nx) * 4;
          src[j] += er * f; src[j + 1] += eg * f; src[j + 2] += eb * f;
        };
        spill(1, 0, 7 / 16); spill(-1, 1, 3 / 16); spill(0, 1, 5 / 16); spill(1, 1, 1 / 16);
      }
    }
    return out;
  }

  // ---- the file ------------------------------------------------------------------------------------
  // GIF's own compression. Codes grow a bit at a time and the dictionary starts again once it is full.
  function lzw(indexes, minCode) {
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1, dict = new Map();
    const out = [];
    let hold = 0, bits = 0;
    const emit = (code) => {
      hold |= code << bits; bits += size;
      while (bits >= 8) { out.push(hold & 255); hold >>= 8; bits -= 8; }
    };
    emit(clear);
    let prefix = indexes[0];
    for (let i = 1; i < indexes.length; i++) {
      const k = indexes[i], key = prefix * 4096 + k, found = dict.get(key);
      if (found !== undefined) { prefix = found; continue; }
      emit(prefix);
      if (next === 4096) { emit(clear); dict = new Map(); next = eoi + 1; size = minCode + 1; }
      // The reader builds its dictionary one code behind the writer, so the width has to grow one code
      // early or the two fall out of step the first time it changes.
      else { dict.set(key, next); next += 1; if (next > (1 << size) && size < 12) size += 1; }
      prefix = k;
    }
    emit(prefix); emit(eoi);
    if (bits > 0) out.push(hold & 255);
    return out;
  }

  function build(frames, pal, w, h, delayCs) {
    const b = [];
    const str = (s) => { for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); };
    const u16 = (n) => { b.push(n & 255, (n >> 8) & 255); };
    str('GIF89a');
    u16(w); u16(h);
    b.push(0xF7, 0, 0);                                   // a colour table of 256, which every frame uses
    for (const c of pal) b.push(c[0], c[1], c[2]);
    b.push(0x21, 0xFF, 11); str('NETSCAPE2.0'); b.push(3, 1, 0, 0, 0);   // loop for ever
    for (const idx of frames) {
      b.push(0x21, 0xF9, 4, 0x04); u16(delayCs); b.push(0, 0);           // how long this frame is held
      b.push(0x2C); u16(0); u16(0); u16(w); u16(h); b.push(0);
      b.push(8);
      const data = lzw(idx, 8);
      for (let i = 0; i < data.length; i += 255) {
        const n = Math.min(255, data.length - i);
        b.push(n);
        for (let j = 0; j < n; j++) b.push(data[i + j]);
      }
      b.push(0);
    }
    b.push(0x3B);
    return new Uint8Array(b);
  }

  // ---- the clip ------------------------------------------------------------------------------------
  // Seeking frame by frame rather than playing it through, so the GIF does not depend on the clip keeping
  // time and a page nobody is looking at still makes one.
  async function grab(src, { fps, width, maxFrames, onProgress }) {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.muted = true; v.playsInline = true;
    v.src = src;
    await once(v, 'loadedmetadata');
    // A clip recorded in the browser often arrives with no length until something asks for its end.
    if (!isFinite(v.duration) || v.duration <= 0) {
      v.currentTime = Number.MAX_SAFE_INTEGER;
      await once(v, 'durationchange').catch(() => {});
      v.currentTime = 0;
      await once(v, 'seeked').catch(() => {});
    }
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!dur) throw new Error('The clip has no length to work from.');
    const vw = v.videoWidth || width, vh = v.videoHeight || Math.round(width * 0.5625);
    const w = Math.max(2, Math.round(Math.min(width, vw) / 2) * 2);
    const h = Math.max(2, Math.round((vh / vw) * w / 2) * 2);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    const want = Math.max(1, Math.min(maxFrames, Math.round(dur * fps)));
    const frames = [];
    for (let i = 0; i < want; i++) {
      v.currentTime = Math.min(dur - 0.001, (i / want) * dur);
      await once(v, 'seeked');
      g.drawImage(v, 0, 0, w, h);
      try { frames.push(g.getImageData(0, 0, w, h)); }
      catch { throw new Error('This clip is served without permission to read it, so a GIF cannot be made here.'); }
      if (onProgress) onProgress(i + 1, want + 1);
    }
    v.removeAttribute('src'); v.load();
    return { frames, w, h, dur };
  }

  // A GIF of the clip at this address. Ten frames a second and 320 across keeps a ten second clip to a few
  // megabytes, which the storage bucket and a post on X both take.
  async function fromVideo(src, opts = {}) {
    const fps = opts.fps || 10, width = opts.width || 320, maxFrames = opts.maxFrames || 200;
    const { frames, w, h, dur } = await grab(src, { fps, width, maxFrames, onProgress: opts.onProgress });
    const pal = palette(frames);
    const near = mapper(pal);
    const idx = frames.map((f) => toIndexes(f, pal, near));
    if (opts.onProgress) opts.onProgress(frames.length + 1, frames.length + 1);
    const delay = Math.max(2, Math.round((dur / frames.length) * 100));
    return new Blob([build(idx, pal, w, h, delay)], { type: 'image/gif' });
  }

  return { fromVideo, palette, build, lzw };
})();

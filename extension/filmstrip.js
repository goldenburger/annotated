// Filmstrips for the video trimmer: small frames laid behind the track, the way waveforms sit behind podcasts.
// A filmstrip is { draw(ctx, t, x, y, w, h) -> bool, onupdate }.
const Filmstrip = (() => {
  // From YouTube's own preview thumbnails (the "storyboard" sprite sheets the player uses when you hover its timeline).
  // sb: { base, level: { L, w, h, count, cols, rows, interval, name, sigh }, duration }
  function fromStoryboard(sb) {
    const lv = sb.level, per = lv.cols * lv.rows, sheets = new Map();
    const strip = { onupdate: null };
    const urlFor = (n) => sb.base.replace('$L', lv.L).replace('$N', lv.name.replace('$M', n)) + (lv.sigh ? (sb.base.includes('?') ? '&' : '?') + 'sigh=' + encodeURIComponent(lv.sigh) : '');
    const sheet = (n) => {
      if (sheets.has(n)) return sheets.get(n);
      const img = new Image();
      const rec = { img, ok: false };
      img.onload = () => { rec.ok = true; strip.onupdate && strip.onupdate(); };
      img.src = urlFor(n);
      sheets.set(n, rec);
      return rec;
    };
    strip.draw = (ctx, t, x, y, w, h) => {
      const idx = Math.max(0, Math.min(lv.count - 1, lv.interval > 0 ? Math.floor((t * 1000) / lv.interval) : Math.floor((t / sb.duration) * lv.count)));
      const rec = sheet(Math.floor(idx / per));
      if (!rec.ok) return false;
      const k = idx % per;
      ctx.drawImage(rec.img, (k % lv.cols) * lv.w, Math.floor(k / lv.cols) * lv.h, lv.w, lv.h, x, y, w, h);
      return true;
    };
    return strip;
  }

  // From a video file the page can read: a hidden copy seeks through it and keeps a small frame at each step.
  // Frames that come back blank are not kept. They are retried once, and if no frame ever arrives the strip
  // reports failure so the trimmer stays plain rather than showing an empty strip.
  function fromVideo(src, duration, steps = 48) {
    const strip = { onupdate: null, failed: false, stats: { kept: 0, blank: 0, method: 'draw' } };
    const fw = 128, fh = 72, frames = new Array(steps).fill(null);
    const at = (i) => ((i + 0.5) / steps) * duration;
    strip.draw = (ctx, t, x, y, w, h) => {
      let i = Math.max(0, Math.min(steps - 1, Math.floor((t / duration) * steps)));
      for (let d = 0; d < steps; d++) {
        const c = frames[i - d] || frames[i + d];
        if (c) { ctx.drawImage(c, 0, 0, fw, fh, x, y, w, h); return true; }
      }
      return false;
    };
    const blank = (g) => {
      const d = g.getImageData(0, 0, fw, fh).data;
      for (let k = 0; k < d.length; k += 64) if (d[k + 3] > 0 && d[k] + d[k + 1] + d[k + 2] > 36) return false;
      return true;
    };
    (async () => {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      // Kept in the page, out of sight, so the browser decodes its frames.
      v.setAttribute('aria-hidden', 'true');
      v.style.cssText = 'position:fixed;left:-10000px;top:0;width:160px;height:90px;opacity:0;pointer-events:none;';
      document.body.appendChild(v);
      v.src = src;
      await new Promise((r) => { v.addEventListener('canplay', r, { once: true }); setTimeout(r, 6000); });
      const grab = async (i) => {
        await new Promise((r) => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 2000); v.currentTime = at(i); });
        // Wait until the frame at the new position has actually been painted.
        if (v.requestVideoFrameCallback) await new Promise((r) => { v.requestVideoFrameCallback(() => r()); setTimeout(r, 300); });
        const c = document.createElement('canvas'); c.width = fw; c.height = fh;
        const g = c.getContext('2d', { willReadFrequently: true });
        try { g.drawImage(v, 0, 0, fw, fh); } catch { return false; }
        if (blank(g) && typeof VideoFrame !== 'undefined') {
          try { const f = new VideoFrame(v); g.drawImage(f, 0, 0, fw, fh); f.close(); strip.stats.method = 'frame'; } catch {}
        }
        if (blank(g)) { strip.stats.blank++; return false; }
        frames[i] = c; strip.stats.kept++;
        return true;
      };
      const order = [];
      for (let stride = 8; stride >= 1; stride = Math.floor(stride / 2)) for (let i = 0; i < steps; i += stride) if (!order.includes(i)) order.push(i);
      const finish = () => { strip.done = true; strip.failed = strip.stats.kept === 0; strip.onupdate && strip.onupdate(); v.removeAttribute('src'); v.load(); v.remove(); };
      let tried = 0;
      for (const i of order) {
        await grab(i); tried++;
        // If the first few frames all come back blank, this browser is not giving frames. Stop early so the
        // hidden copy does not keep seeking while a capture runs.
        if (tried === 6 && strip.stats.kept === 0) return finish();
        if (i % 4 === 0) strip.onupdate && strip.onupdate();
      }
      // One retry for any frame that came back blank.
      for (let i = 0; i < steps; i++) if (!frames[i]) await grab(i);
      finish();
    })();
    return strip;
  }
  return { fromStoryboard, fromVideo };
})();

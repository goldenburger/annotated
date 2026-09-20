// Waveforms for podcast clips: peaks from audio data, drawn into the trimmer or into a small image.
// Shared by the extension and the preview.
const Waveform = (() => {
  // Decodes at 8 kHz mono to keep memory small, then keeps the loudest point in each bucket.
  async function fromArrayBuffer(buf, pps = 20) {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctx(1, 1, 8000);
    const ab = await ctx.decodeAudioData(buf.slice(0));
    const size = Math.max(1, Math.floor(ab.sampleRate / pps));
    const out = new Float32Array(Math.ceil(ab.length / size));
    const chans = [];
    for (let c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
    let top = 0;
    for (let b = 0; b < out.length; b++) {
      let m = 0;
      const s = b * size, e = Math.min(ab.length, s + size);
      for (const d of chans) for (let i = s; i < e; i += 2) { const v = Math.abs(d[i]); if (v > m) m = v; }
      out[b] = m; if (m > top) top = m;
    }
    if (top > 0) for (let b = 0; b < out.length; b++) out[b] /= top;
    return { pps, data: out, duration: ab.duration, peak: top };
  }
  const fromBlob = async (blob, pps) => fromArrayBuffer(await blob.arrayBuffer(), pps);

  // Draws the window from t0 to t1 as rounded bars across the canvas.
  // progress (0 to 1) colors the bars already played with playedColor.
  function draw(canvas, w, t0, t1, { color = '#9AA1AF', bar = 3, gap = 2, progress = -1, playedColor = color } = {}) {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!w || !w.data.length || !(t1 > t0)) return;
    g.fillStyle = color;
    const step = bar + gap, n = Math.floor(W / step);
    for (let i = 0; i < n; i++) {
      const a = t0 + (i / n) * (t1 - t0), b = t0 + ((i + 1) / n) * (t1 - t0);
      let m = 0;
      for (let k = Math.floor(a * w.pps); k <= Math.ceil(b * w.pps) && k < w.data.length; k++) if (k >= 0 && w.data[k] > m) m = w.data[k];
      const h = Math.max(2, m * (H - 6));
      g.fillStyle = progress >= 0 && (i + 0.5) / n <= progress ? playedColor : color;
      g.beginPath();
      if (g.roundRect) g.roundRect(i * step, (H - h) / 2, bar, h, 1.5); else g.rect(i * step, (H - h) / 2, bar, h);
      g.fill();
    }
  }

  // A small image of a clip: yellow bars on ink, used where video clips show a frame.
  function image(w, { width = 480, height = 270, color = '#FFE14A', bg = '#16181D' } = {}) {
    const c = document.createElement('canvas');
    c.style.width = width + 'px'; c.style.height = height + 'px';
    c.width = width; c.height = height;
    Object.defineProperty(c, 'clientWidth', { value: width }); Object.defineProperty(c, 'clientHeight', { value: height });
    draw(c, w, 0, w.duration, { color, bar: 5, gap: 3 });
    const out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
    const g = out.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, out.width, out.height); g.drawImage(c, 0, 0);
    return out.toDataURL('image/png');
  }
  return { fromArrayBuffer, fromBlob, draw, image };
})();

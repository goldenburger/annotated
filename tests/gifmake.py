# A clip can be saved as an animated GIF, written here in the browser rather than sent anywhere. The file has
# to be one a browser will actually decode, so this makes one and hands it back to the browser to read.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
# Three flat frames through a colour table, then read back as an image.
MADE = """async () => {
  const frame = (r, g, b, w, h) => { const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255; }
    return new ImageData(d, w, h); };
  const w = 24, h = 16;
  const frames = [frame(220, 30, 30, w, h), frame(30, 200, 60, w, h), frame(40, 60, 220, w, h)];
  const pal = GifMaker.palette(frames);
  const near = (r, g, b) => { let best = 0, dist = Infinity;
    pal.forEach((p, i) => { const d = (r-p[0])**2 + (g-p[1])**2 + (b-p[2])**2; if (d < dist) { dist = d; best = i; } });
    return best; };
  const idx = frames.map((f) => { const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = near(f.data[i*4], f.data[i*4+1], f.data[i*4+2]);
    return out; });
  const bytes = GifMaker.build(idx, pal, w, h, 10);
  const head = String.fromCharCode(...bytes.slice(0, 6));
  const blob = new Blob([bytes], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  const ok = await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = url; });
  // Read the first frame back, to be sure the colours and the compression came out the right way round.
  let seen = null;
  if (ok) { const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(3, 3, 1, 1).data; seen = [d[0], d[1], d[2]]; }
  URL.revokeObjectURL(url);
  return { head, tail: bytes[bytes.length - 1], bytes: bytes.length, ok, w: img.naturalWidth, h: img.naturalHeight, seen };
}"""
# Compression, read back with a decoder written the ordinary way. This is what catches the width of the
# codes growing at the wrong moment, which a small picture never reaches and which Chrome forgave while
# stricter readers would not open the file at all.
ROUND = """() => {
  const decode = (bytes, minCode) => {
    const clear = 1 << minCode, eoi = clear + 1;
    let size, dict, out = [];
    const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict.push([i]); dict.push(null); dict.push(null); size = minCode + 1; };
    reset();
    let hold = 0, bits = 0, prev = null, i = 0;
    for (;;) {
      while (bits < size && i < bytes.length) { hold |= bytes[i++] << bits; bits += 8; }
      if (bits < size) break;
      const code = hold & ((1 << size) - 1); hold >>= size; bits -= size;
      if (code === clear) { reset(); prev = null; continue; }
      if (code === eoi) break;
      let entry;
      if (code < dict.length && dict[code]) entry = dict[code];
      else if (prev) entry = prev.concat([prev[0]]);
      else return { bad: 'a code nothing had defined, at ' + out.length };
      out = out.concat(entry);
      if (prev) { dict.push(prev.concat([entry[0]])); if (dict.length === (1 << size) && size < 12) size++; }
      prev = entry;
    }
    return { out };
  };
  const runs = [];
  for (const n of [40, 900, 20000, 70000]) {
    const idx = new Uint8Array(n);
    for (let i = 0; i < n; i++) idx[i] = (i * 7 + Math.floor(i / 13)) & 255;
    const got = decode(GifMaker.lzw(idx, 8), 8);
    let same = !got.bad && got.out.length === n;
    if (same) for (let i = 0; i < n; i++) if (got.out[i] !== idx[i]) { same = 'differs at ' + i; break; }
    runs.push({ n, same: got.bad || same });
  }
  return runs;
}"""
# And the whole way, from a clip recorded in this browser to a GIF of it.
WHOLE = """async () => {
  const c = document.createElement('canvas'); c.width = 96; c.height = 64;
  const g = c.getContext('2d');
  const stream = c.captureStream(20);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start();
  const t0 = performance.now();
  await new Promise((res) => { const tick = () => {
    const k = (performance.now() - t0) / 1200;
    g.fillStyle = `rgb(${Math.round(240 * k)}, 40, ${Math.round(240 * (1 - k))})`;
    g.fillRect(0, 0, 96, 64);
    if (k < 1) requestAnimationFrame(tick); else res();
  }; tick(); });
  rec.stop();
  await done;
  const url = URL.createObjectURL(new Blob(parts, { type: 'video/webm' }));
  const steps = [];
  const gif = await GifMaker.fromVideo(url, { fps: 8, width: 96, maxFrames: 20, onProgress: (a, b) => steps.push(a + '/' + b) });
  URL.revokeObjectURL(url);
  const gurl = URL.createObjectURL(gif);
  const img = new Image();
  const ok = await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = gurl; });
  URL.revokeObjectURL(gurl);
  return { size: gif.size, type: gif.type, ok, w: img.naturalWidth, h: img.naturalHeight, steps: steps.length };
}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profGIF'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':700})
    pg.on('pageerror',lambda e: errs.append('PAGE '+str(e)))
    await pg.goto(f'chrome-extension://{extid}/annotation.html'); await asyncio.sleep(1.4)

    r=await pg.evaluate(MADE)
    print('the file says:',repr(r['head']),'| ends with',hex(r['tail']),'|',r['bytes'],'bytes')
    print('the browser read it back:',r['ok'],r['w'],'x',r['h'],'| first frame is',r['seen'])
    if r['head']!='GIF89a': errs.append(f"the file does not begin as a GIF, it begins {r['head']!r}")
    if r['tail']!=0x3B: errs.append('the file has no end marker')
    if not r['ok']: errs.append('the browser would not decode the GIF at all')
    if (r['w'],r['h'])!=(24,16): errs.append(f"it decoded as {r['w']}x{r['h']}, not the size it was made at")
    if r['seen'] and abs(r['seen'][0]-220)>24 or (r['seen'] and abs(r['seen'][1]-30)>24):
        errs.append(f"the first frame came back {r['seen']}, not the red it was drawn in")

    rt=await pg.evaluate(ROUND)
    print('compression, read back:',rt)
    for r in rt:
        if r['same'] is not True: errs.append(f"{r['n']} pixels did not survive being compressed: {r['same']}")

    w=await pg.evaluate(WHOLE)
    print('from a recorded clip:',w)
    if not w['ok']: errs.append('the GIF made from a clip would not decode')
    if w['type']!='image/gif': errs.append(f"it came back as {w['type']}")
    if (w['w'],w['h'])!=(96,64): errs.append(f"the GIF is {w['w']}x{w['h']}, not the size of the clip")
    if w['size']<600: errs.append(f"the GIF is only {w['size']} bytes, so it holds nothing")
    if w['steps']<4: errs.append(f"it reported progress {w['steps']} times, so there is no sign of life while it works")

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())

// Podcasts from their public feeds. Podcast apps (Spotify, Amazon, iHeartRadio and others) wrap the same audio
// file the show publishes openly. This finds that file through Apple's free podcast directory and clips it by
// downloading only the part needed. Extension pages only: the extension's host permission lets it read the file.
const FeedPod = (() => {
  // Episodes matching a search, newest first within Apple's ranking.
  async function search(term, limit = 8) {
    const q = String(term || '').replace(/[|·•]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return [];
    const r = await fetch(`https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&limit=${limit}&term=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error('The podcast directory did not answer.');
    const d = await r.json();
    // Some shows publish through more than one feed. Keep one result per episode.
    const seen = new Set();
    return (d.results || []).filter((x) => x.episodeUrl).map((x) => ({
      title: x.trackName || '', show: x.collectionName || '', audioUrl: x.episodeUrl,
      duration: (x.trackTimeMillis || 0) / 1000, released: x.releaseDate || '',
      artwork: x.artworkUrl600 || x.artworkUrl160 || '', thumb: x.artworkUrl160 || x.artworkUrl600 || '', link: x.trackViewUrl || '', feedUrl: x.feedUrl || '',
      ext: (x.episodeFileExtension || '').toLowerCase(),
    })).filter((x) => { const k = x.title.toLowerCase() + '|' + Math.round(x.duration / 60); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  // MP3 frame header: bitrate, sample rate and frame length.
  const BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  function frameAt(b, i) {
    if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) return null; // Layer III only
    const kbps = BR[ver === 3 ? 1 : 2][bri], sr = SR[ver][sri], spf = ver === 3 ? 1152 : 576;
    const len = Math.floor(((spf / 8) * kbps * 1000) / sr) + pad;
    return { kbps, sr, spf, len, mono: (b[i + 3] >> 6) === 3, ver };
  }
  // Next frame start at or after i, confirmed by a second frame right after it.
  function syncFrom(b, i) {
    for (let k = Math.max(0, i); k < b.length - 4; k++) {
      const f = frameAt(b, k);
      if (f && frameAt(b, k + f.len)) return { at: k, f };
    }
    return null;
  }

  // Reads the start of the file: where the audio begins, its bitrate, and (for variable bitrate) its seek table.
  async function probe(url) {
    const r = await fetch(url, { headers: { Range: 'bytes=0-131071' } });
    if (!(r.status === 206 || r.status === 200)) throw new Error(r.status === 403 || r.status === 401 ? "The show's server refused to share this episode's file." : `The audio file could not be opened (error ${r.status}).`);
    const type = (r.headers.get('content-type') || '').toLowerCase();
    const cr = r.headers.get('content-range');
    const total = cr ? Number(cr.split('/')[1]) : Number(r.headers.get('content-length')) || 0;
    const ranges = r.status === 206;
    const b = new Uint8Array(await r.arrayBuffer());
    const finalUrl = r.url || url;
    if (!ranges) throw new Error("This show's server doesn't allow downloading part of an episode.");
    let audioStart = 0;
    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) audioStart = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) + ((b[5] & 0x10) ? 10 : 0);
    let head = b;
    if (audioStart + 4096 > b.length) { // a large cover image in the tag: fetch where the audio starts
      const r2 = await fetch(finalUrl, { headers: { Range: `bytes=${audioStart}-${audioStart + 65535}` } });
      head = new Uint8Array(await r2.arrayBuffer());
    } else head = b.subarray(audioStart);
    const s = syncFrom(head, 0);
    if (!s) throw new Error(/mpeg|mp3/.test(type) || !type ? 'The audio file could not be read.' : 'This episode is not an MP3, so it cannot be clipped part by part.');
    const first = s.f, firstAt = audioStart + s.at;
    // Xing or Info header in the first frame: exact frame count and a seek table for variable bitrate files.
    const side = first.ver === 3 ? (first.mono ? 17 : 32) : (first.mono ? 9 : 17);
    const x = s.at + 4 + side, tag = String.fromCharCode(head[x], head[x + 1], head[x + 2], head[x + 3]);
    let frames = 0, bytes = 0, toc = null, vbr = false;
    if (tag === 'Xing' || tag === 'Info') {
      const flags = (head[x + 4] << 24) | (head[x + 5] << 16) | (head[x + 6] << 8) | head[x + 7];
      let p = x + 8;
      if (flags & 1) { frames = ((head[p] << 24) | (head[p + 1] << 16) | (head[p + 2] << 8) | head[p + 3]) >>> 0; p += 4; }
      if (flags & 2) { bytes = ((head[p] << 24) | (head[p + 1] << 16) | (head[p + 2] << 8) | head[p + 3]) >>> 0; p += 4; }
      if (flags & 4) { toc = [...head.subarray(p, p + 100)]; }
      vbr = tag === 'Xing';
    }
    const audioBytes = (bytes || (total - firstAt)) || 1;
    const duration = frames ? (frames * first.spf) / first.sr : audioBytes / ((first.kbps * 1000) / 8);
    // Time to byte: the seek table for variable bitrate, straight proportion for constant bitrate.
    const byteAt = (t) => {
      const f = Math.max(0, Math.min(1, t / duration));
      if (vbr && toc) {
        const i = Math.min(99, Math.floor(f * 100)), a = toc[i], b2 = i < 99 ? toc[i + 1] : 256;
        return firstAt + ((a + (b2 - a) * (f * 100 - i)) / 256) * audioBytes;
      }
      return firstAt + f * audioBytes;
    };
    return { url: finalUrl, total, type, duration, kbps: first.kbps, sr: first.sr, vbr, byteAt };
  }

  // The clip itself: only the bytes for start to end, cut on MP3 frame boundaries. No re-encoding.
  async function slice(p, start, end) {
    const pad = 8192;
    const b0 = Math.max(0, Math.floor(p.byteAt(start)) - pad), b1 = Math.min(p.total - 1, Math.ceil(p.byteAt(end)) + pad);
    const r = await fetch(p.url, { headers: { Range: `bytes=${b0}-${b1}` } });
    if (r.status !== 206) throw new Error('The clip could not be downloaded.');
    const b = new Uint8Array(await r.arrayBuffer());
    const s = syncFrom(b, Math.floor(p.byteAt(start)) - b0);
    if (!s) throw new Error('The clip could not be cut from the file.');
    // Walk whole frames until the clip's length is covered.
    let i = s.at, t = 0;
    const want = end - start;
    while (i < b.length && t < want) {
      const f = frameAt(b, i);
      if (!f) { const n = syncFrom(b, i + 1); if (!n) break; i = n.at; continue; }
      if (i + f.len > b.length) break;
      i += f.len; t += f.spf / f.sr;
    }
    return { blob: new Blob([b.subarray(s.at, i)], { type: 'audio/mpeg' }), seconds: t, bytes: i - s.at, downloaded: b.length };
  }

  // Waveform for the part of the episode in view, fetched a window at a time as the trimmer moves.
  function waveform(p, pps = 10) {
    const n = Math.ceil(p.duration * pps), data = new Float32Array(n), done = new Set();
    let busy = false;
    const w = { pps, data, duration: p.duration, peak: 1, onupdate: null };
    w.ensure = async (t0, t1) => {
      if (busy) return;
      const need = [];
      for (let s = Math.floor(Math.max(0, t0) / 30) * 30; s < Math.min(p.duration, t1); s += 30) if (!done.has(s)) need.push(s);
      if (!need.length) return;
      busy = true;
      try {
        for (const s of need.slice(0, 3)) {
          done.add(s);
          const cut = await slice(p, s, Math.min(p.duration, s + 30));
          const pk = await Waveform.fromArrayBuffer(await cut.blob.arrayBuffer(), pps);
          // Raw levels (not normalized per window), so windows line up with each other.
          const scale = pk.peak || 1;
          for (let k = 0; k < pk.data.length && s * pps + k < n; k++) data[s * pps + k] = pk.data[k] * scale;
          w.onupdate && w.onupdate();
        }
      } catch { /* leave the window empty */ } finally { busy = false; }
    };
    return w;
  }
  return { search, probe, slice, waveform };
})();

// YouTube content script. Wires the shared ClipEngine to extension messaging.
(() => {
  if (window.__annotatedClip) return;
  window.__annotatedClip = true;
  const getVideo = () => document.querySelector('#movie_player video.html5-main-video') || document.querySelector('video.html5-main-video') || document.querySelector('video');
  const adShowing = () => { const p = document.getElementById('movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); };
  const meta = () => {
    let videoId = null; try { videoId = new URL(location.href).searchParams.get('v'); } catch {}
    // YouTube swaps videos without reloading, and can keep an older video's details in the page. Read them from the
    // watch area for this video id, and trust the tab title when the two disagree.
    const flexy = (videoId && document.querySelector(`ytd-watch-flexy[video-id="${CSS.escape(videoId)}"]`)) || document.querySelector('ytd-watch-flexy:not([hidden])') || document;
    const h = flexy.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata, h1.title');
    const ch = flexy.querySelector('ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a, ytd-video-owner-renderer ytd-channel-name a');
    const tabTitle = document.title.replace(/^\(\d+\+?\)\s*/, '').replace(/ - YouTube$/, '').trim();
    const domTitle = (h?.textContent || '').trim();
    const fresh = tabTitle && tabTitle !== 'YouTube' && domTitle !== tabTitle;
    return { videoId, url: location.href, title: fresh ? tabTitle : (domTitle || tabTitle),
      channel: fresh ? '' : (ch?.textContent || '').trim(), thumb: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '',
      // A live stream: YouTube marks the time display, and the length it reports is only the stream so far.
      live: !!document.querySelector('.ytp-time-display.ytp-live') };
  };
  const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const send = async (m) => {
    if (m.blob) { const { blob, ...rest } = m; m = { ...rest, dataUrl: await toDataUrl(blob) }; }
    // A copy left behind by an extension reload throws at the call itself, so the call is guarded.
    try { if (chrome.runtime && chrome.runtime.id) chrome.runtime.sendMessage(m).catch(() => {}); } catch { /* the extension went away */ }
  };
  const engine = ClipEngine.create({ getVideo, adShowing, meta, send });
  // YouTube's preview thumbnails (the sprite sheets its player shows when you hover the timeline), for the trimmer's filmstrip.
  async function storyboard() {
    let id = null; try { id = new URL(location.href).searchParams.get('v'); } catch {}
    if (!id) return null;
    const find = (txt) => { const m = txt && txt.match(/"playerStoryboardSpecRenderer":\{"spec":"([^"]+)"/); return m && m[1].includes(id) ? m[1] : null; };
    let spec = null;
    for (const s of document.scripts) { if (s.textContent.includes(id) && (spec = find(s.textContent))) break; }
    if (!spec) { try { spec = find(await (await fetch(location.href, { credentials: 'include' })).text()); } catch {} }
    if (!spec) return null;
    spec = spec.replace(/\\u0026/g, '&');
    const parts = spec.split('|'), base = parts[0];
    const levels = parts.slice(1).map((p, L) => { const [w, h, count, cols, rows, interval, name, sigh] = p.split('#'); return { L, w: +w, h: +h, count: +count, cols: +cols, rows: +rows, interval: +interval, name, sigh }; })
      .filter((l) => l.w && l.count && l.cols && l.rows);
    if (!levels.length) return null;
    // A middle size: sharp enough for small tiles without loading large sheets.
    const level = levels.filter((l) => l.w <= 160).pop() || levels[0];
    const v = getVideo();
    return { base, level, duration: v ? v.duration : 0 };
  }
  // The video's transcript, read from YouTube's own transcript panel (2.38.0). Downloading the captions directly now
  // needs a token YouTube does not hand out, but the page shows the same lines once its panel is opened. It is opened
  // out of sight and put back as it was; a panel the person opened themselves is left open. Lines a previous video
  // left behind are marked first, so only the new video's are read. Nothing here is trusted: the panel draws it as text.
  const TPANEL = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
  const SEG = 'transcript-segment-view-model, ytd-transcript-segment-renderer';
  const TS = /^(\d+):(\d{2})(?::(\d{2}))?$/, LABEL = /^(\d+ (hours?|minutes?|seconds?),? ?)+$/;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const leaves = (el) => [...el.querySelectorAll('*')].filter((e) => !e.children.length).map((e) => e.textContent.trim()).filter(Boolean);
  function readLines() {
    const out = [];
    document.querySelectorAll(SEG).forEach((seg) => {
      const bits = leaves(seg);
      const ti = bits.findIndex((x) => TS.test(x));
      if (ti < 0) return;
      const m = bits[ti].match(TS);
      const t = m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
      const text = bits.filter((x, i) => i !== ti && !LABEL.test(x)).join(' ').replace(/\s+/g, ' ').trim();
      if (text) out.push({ t, text: text.slice(0, 400) });
    });
    return out.sort((a, b) => a.t - b.t);
  }
  const transcripts = new Map(), noButton = new Map();
  // Whose rows are in YouTube's panel is known from YouTube's own navigation: as it starts moving to another video,
  // the rows showing belong to the one being left (audit of 2026-09-29, third pass). Rows unlike those are the
  // current video's, including a panel the person opened themselves, or rows that came late on a first load.
  const sig = (ls) => ls.slice(0, 4).map((l) => l.t + ' ' + l.text).join('|');
  let staleSig = '';
  document.addEventListener('yt-navigate-start', () => { staleSig = sig(readLines()); });
  // The rows must also fit the video now playing: the first near its start, the last within its length.
  const fits = (ls) => { const v = document.querySelector('#movie_player video') || document.querySelector('video'); const D = v && isFinite(v.duration) ? v.duration : Infinity;
    return ls.length > 0 && ls[0].t < Math.min(600, D) && ls[ls.length - 1].t <= D + 2; };
  const fresh = (ls) => ls.length > 0 && sig(ls) !== staleSig && fits(ls);
  // One reading per video. A single shared one handed a video you had just moved to the transcript of the one before
  // it (audit of 2026-09-29).
  const vidNow = () => { try { return new URL(location.href).searchParams.get('v'); } catch { return null; } };
  const transcriptBusy = new Map();
  async function transcript() {
    const id = vidNow();
    if (!id) return null;
    if (transcripts.has(id)) return transcripts.get(id);
    if (transcriptBusy.has(id)) return transcriptBusy.get(id);
    // This video's rows are already in the page (the person opened YouTube's transcript): no need to open anything.
    const already = readLines();
    if (fresh(already)) { transcripts.set(id, already); return already; }
    const job = (async () => {
      const find = () => [...document.querySelectorAll('ytd-video-description-transcript-section-renderer button, button')]
        .find((b) => /show transcript/i.test(b.getAttribute('aria-label') || b.textContent || ''));
      let btn = find(), expanded = false;
      if (!btn) {
        const more = document.querySelector('ytd-watch-metadata #description-inline-expander #expand, #description #expand');
        if (more) { more.click(); expanded = true; await sleep(500); btn = find(); }
      }
      if (!btn) {
        if (expanded) { const c = document.querySelector('#description-inline-expander #collapse, #description #collapse'); if (c) c.click(); }
        const n = (noButton.get(id) || 0) + 1; noButton.set(id, n);
        if (n >= 3) transcripts.set(id, null);
        return null;
      }
      const panel0 = document.querySelector(TPANEL);
      const wasOpen = !!panel0 && panel0.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
      // Rows left from another video are told apart by their words (YouTube may reuse the same row elements), and only
      // rows that are this video's are used. Missing a transcript is better than publishing another video's words.
      btn.click();
      let lines = [];
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        if (vidNow() !== id) break;
        lines = readLines(); if (fresh(lines)) break;
      }
      await sleep(300); lines = vidNow() === id ? readLines() : [];
      if (!fresh(lines)) lines = [];
      const panel = document.querySelector(TPANEL);
      if (panel && !wasOpen) panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
      if (expanded) { const c = document.querySelector('#description-inline-expander #collapse, #description #collapse'); if (c) c.click(); }
      // The page moved on to another video while this one was read: its lines are not this video's.
      if (vidNow() !== id) return null;
      if (!lines.length) { const n = (noButton.get(id) || 0) + 1; noButton.set(id, n); if (n >= 2) transcripts.set(id, null); return null; }
      transcripts.set(id, lines);
      return lines;
    })().finally(() => { transcriptBusy.delete(id); });
    transcriptBusy.set(id, job);
    return job;
  }
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    switch (msg?.type) {
      case 'ping': reply({ ok: true }); return;
      case 'transcript': if (msg.v && msg.v !== vidNow()) { reply(null); return; } transcript().then((r) => reply(r)).catch(() => reply(null)); return true;
      case 'info': reply(engine.info()); return;
      case 'seek': engine.seek(msg.t); reply({ ok: true }); return;
      case 'preview': engine.preview(msg.start, msg.end); reply({ ok: true }); return;
      case 'pause': engine.pause(); reply({ ok: true }); return;
      case 'storyboard': storyboard().then((r) => reply(r)).catch(() => reply(null)); return true;
      case 'capture': engine.capture(msg.start, msg.end).then(() => reply({ ok: true })).catch((e) => reply({ ok: false, error: e.message })); return true;
      case 'abort': engine.abort(); reply({ ok: true }); return;
    }
  });
})();

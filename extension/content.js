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
    const flexy = (videoId && document.querySelector(`ytd-watch-flexy[video-id="${videoId}"]`)) || document.querySelector('ytd-watch-flexy:not([hidden])') || document;
    const h = flexy.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata, h1.title');
    const ch = flexy.querySelector('ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a, ytd-video-owner-renderer ytd-channel-name a');
    const tabTitle = document.title.replace(/^\(\d+\+?\)\s*/, '').replace(/ - YouTube$/, '').trim();
    const domTitle = (h?.textContent || '').trim();
    const fresh = tabTitle && tabTitle !== 'YouTube' && domTitle !== tabTitle;
    return { videoId, url: location.href, title: fresh ? tabTitle : (domTitle || tabTitle),
      channel: fresh ? '' : (ch?.textContent || '').trim(), thumb: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '' };
  };
  const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const send = async (m) => {
    if (m.blob) { const { blob, ...rest } = m; m = { ...rest, dataUrl: await toDataUrl(blob) }; }
    chrome.runtime.sendMessage(m).catch(() => {});
  };
  const engine = ClipEngine.create({ getVideo, adShowing, meta, send });
  // YouTube's preview thumbnails (the sprite sheets its player shows when you hover the timeline), for the trimmer's filmstrip.
  async function storyboard() {
    let id = null; try { id = new URL(location.href).searchParams.get('v'); } catch {}
    if (!id) return null;
    const find = (txt) => { const m = txt && txt.match(/"playerStoryboardSpecRenderer":\{"spec":"([^"]+)"/); return m ? m[1] : null; };
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
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    switch (msg?.type) {
      case 'ping': reply({ ok: true }); return;
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

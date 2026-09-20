// Content script for any non-YouTube page. Wires the shared ArticlePage controller to extension messaging.
(() => {
  if (window.__annotatedArticle) return;
  window.__annotatedArticle = true;
  const style = document.createElement('style');
  style.textContent = 'mark.annotated-hl{background:#FFE14A!important;color:#1C2433!important;border-radius:2px;box-shadow:0 0 0 2px #FFE14A!important}' +
    '::highlight(annotated-pending){background-color:rgba(255,225,74,.55);color:inherit}';
  (document.head || document.documentElement).appendChild(style);
  const send = (m) => chrome.runtime.sendMessage(m).catch(() => {});
  // The Annotate button beside selected text can be turned off under Display.
  let pageButton = true;
  chrome.storage.local.get('annotatedPrefs').then((o) => { if (o.annotatedPrefs) pageButton = o.annotatedPrefs.pageButton !== false; }).catch(() => {});
  chrome.storage.onChanged.addListener((ch, a) => { if (a === 'local' && ch.annotatedPrefs) pageButton = (ch.annotatedPrefs.newValue || {}).pageButton !== false; });
  const page = ArticlePage.create({
    root: () => document.body,
    metaRoot: () => document,
    loc: () => location,
    send,
    scrollBy: (dy) => window.scrollBy({ top: dy, behavior: 'instant' }),
    viewport: () => ({ top: 0, bottom: window.innerHeight }),
    buttonEnabled: () => pageButton,
  });
  // Podcasts: a page with an audio player can be clipped the same way as a video, as sound only.
  const pickAudio = () => {
    const list = [...document.querySelectorAll('audio')];
    return list.find((a) => isFinite(a.duration) && a.duration > 0) || list.find((a) => a.currentSrc || a.src || a.querySelector('source')) || null;
  };
  const metaContent = (sel) => { const m = document.querySelector(sel); return m ? (m.getAttribute('content') || '').trim() : ''; };
  const podMeta = () => ({
    url: location.href.split('#')[0],
    title: metaContent('meta[property="og:title"]') || (document.querySelector('h1') || {}).textContent?.trim() || document.title,
    show: metaContent('meta[property="og:site_name"]') || metaContent('meta[name="application-name"]'),
    artwork: metaContent('meta[property="og:image"]'),
  });
  const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const podSend = async (m) => {
    if (m.blob) { const { blob, ...rest } = m; m = { ...rest, dataUrl: await toDataUrl(blob) }; }
    chrome.runtime.sendMessage(m).catch(() => {});
  };
  const pod = ClipEngine.create({ getVideo: pickAudio, meta: podMeta, send: podSend, audioOnly: true });
  // How this episode can be recorded: 'direct' from the page's player, 'copy' through a second player the
  // audio server allows, or 'tab' by recording the tab's sound. Checked once per episode.
  const routes = new Map();
  function route(a) {
    const src = a.currentSrc || a.src || (a.querySelector('source') || {}).src;
    // Encrypted audio (Spotify and similar services) is protected, so annotated never records it.
    if (a.mediaKeys) return 'protected';
    if (!src || a.readyState < 1) return 'unknown';
    if (routes.has(src)) return routes.get(src);
    let r = 'direct';
    try { const es = a.captureStream(); es.getTracks().forEach((t) => t.stop()); }
    catch (e) { r = /cross-origin/i.test(e.message) ? 'checking' : 'blocked'; }
    routes.set(src, r);
    if (r === 'checking') {
      const c = document.createElement('audio');
      c.crossOrigin = 'anonymous'; c.preload = 'metadata';
      const done = (v) => { if (routes.get(src) === 'checking') routes.set(src, v); c.removeAttribute('src'); };
      c.addEventListener('loadedmetadata', () => done('copy'));
      c.addEventListener('error', () => done('tab'));
      setTimeout(() => done('tab'), 10000);
      c.src = src;
    }
    return r;
  }
  function podInfo() {
    const a = pickAudio();
    if (!a) return { ok: false, found: false };
    // Some players only load the episode on play. Ask for its length without starting it.
    if (!isFinite(a.duration) && a.readyState === 0 && a.paused && a.preload === 'none') { a.preload = 'metadata'; try { a.load(); } catch {} }
    const type = metaContent('meta[property="og:type"]').toLowerCase();
    const textLen = (document.body.innerText || '').length;
    const likely = /podcast|episode|audio|music/.test(type + ' ' + location.pathname.toLowerCase()) || textLen < 2500;
    return { ...pod.info(), found: true, src: a.currentSrc || a.src || (a.querySelector('source') || {}).src || '', likely, route: route(a) };
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    switch (msg?.type) {
      case 'aping': reply({ ok: true }); return;
      case 'pod-info': reply(podInfo()); return;
      case 'clear-captured': ArticleCore.clearHighlights(document); reply({ ok: true }); return;
      case 'pod-seek': pod.seek(msg.t); reply({ ok: true }); return;
      case 'pod-preview': pod.preview(msg.start, msg.end); reply({ ok: true }); return;
      case 'pod-pause': pod.pause(); reply({ ok: true }); return;
      case 'pod-capture': pod.capture(msg.start, msg.end).then(() => reply({ ok: true })).catch((e) => reply({ ok: false, error: e.message, code: e.code })); return true;
      case 'pod-play-range': pod.playRange(msg.start, msg.end).then(() => reply({ ok: true })).catch((e) => reply({ ok: false, error: e.message })); return true;
      case 'pod-abort': pod.abort(); pod.stopRange(); reply({ ok: true }); return;
      case 'a-info': reply(page.info()); return;
      case 'capture-passage':
        page.capture().then((r) => { const { marks, ...rest } = r; reply({ ...rest, vw: window.innerWidth }); })
          .catch((e) => reply({ ok: false, error: e.message }));
        return true;
      case 'set-exact': page.setExact(msg.exact); reply({ ok: true }); return;
      case 'clear-selection': page.clear(); reply({ ok: true }); return;
      case 'pin-and-annotate': page.requestAnnotate(); reply({ ok: true }); return;
      case 'p-info': {
        const r = PostCore.extract(document, location);
        if (!r) { reply({ ok: false, error: 'Waiting for the post to load.' }); return; }
        const { el, ...rest } = r; reply({ ok: true, ...rest }); return;
      }
      case 'capture-post': {
        // A selection inside a reply annotates that reply. Otherwise the page's main post.
        const inPost = page.selectedPost();
        const r = inPost ? PostCore.read(inPost, location) : PostCore.extract(document, location);
        if (!r) { reply({ ok: false, error: 'Could not find the post on this page.' }); return; }
        // Words selected inside the post become its quote. Taking them also clears the highlight before the screenshot.
        const picked = page.takeWithin(r.el);
        if (picked && picked !== r.text) r.quote = picked;
        // Posts taller than the window (with a video, say) are framed from their top, so the author and text are in the screenshot.
        const tall = r.el.getBoundingClientRect().height > window.innerHeight - 80;
        r.el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'instant' });
        if (tall) window.scrollBy(0, -64);
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
          const b = r.el.getBoundingClientRect();
          const { el, ...rest } = r;
          reply({ ok: true, ...rest, clip: { x: b.left, y: b.top, w: b.width, h: b.height }, vw: window.innerWidth });
        }, 150)));
        return true;
      }
    }
  });
})();

// Content script for any non-YouTube page. Wires the shared ArticlePage controller to extension messaging.
(() => {
  // Reloading the extension leaves an older copy of this script on the page with a dead connection. The newest
  // copy claims the page and the older one stays quiet, so the panel works again without reloading the page.
  // Take the older copy off the page before claiming it, so its button and its highlights go with it.
  const older = window.__annotatedArticle;
  if (older && older.page && typeof older.page.destroy === 'function') { try { older.page.destroy(); } catch { /* already gone */ } }
  const mine = {};
  window.__annotatedArticle = mine;
  const orphaned = () => window.__annotatedArticle !== mine;
  const style = document.createElement('style');
  // The pens, with their colours written out. This sits on pages we do not own, so nothing here fades to
  // transparent, which would vanish on a dark page, and nothing uses a blend mode.
  const HI = '#FFE14A', DEEP = '#F2C600', LIFT = '#FFEE9E';
  // background-image rather than the background shorthand. The shorthand resets background-size to auto, and
  // with !important on it neither the longhand below nor the keyframes could ever widen the stroke.
  const PENS = {
    chisel: `background-image:linear-gradient(103deg,${DEEP} 0 6%,${HI} 14% 88%,${LIFT} 100%)!important;padding:1px 5px 3px 3px!important;margin:0 -2px!important;border-radius:4px 11px 5px 12px!important`,
    wet: `background-image:radial-gradient(9px 60% at 3% 52%,${DEEP},transparent 70%),radial-gradient(12px 62% at 98% 48%,${DEEP},transparent 72%),linear-gradient(180deg,${LIFT} 0 14%,${HI} 22% 78%,${DEEP} 100%)!important;padding:1px 6px 3px!important;margin:0 -3px!important;border-radius:3px 10px 4px 9px!important`,
    twice: `background-image:linear-gradient(101deg,${LIFT} 0 18%,${HI} 34% 70%,${DEEP} 78%,${HI} 100%)!important;padding:2px 6px 3px!important;margin:0 -3px!important;border-radius:5px 12px 6px 11px!important`,
    streak: `background-image:repeating-linear-gradient(94deg,transparent 0 11px,${LIFT} 11px 13px,transparent 13px 27px),linear-gradient(180deg,${LIFT},${HI} 46%,${DEEP})!important;padding:1px 6px 3px!important;margin:0 -3px!important;border-radius:4px 10px 5px 11px!important`,
    flat: `background-image:linear-gradient(${HI},${HI})!important;padding:1px 2px!important;border-radius:2px!important;box-shadow:0 0 0 2px ${HI}!important`,
  };
  // The pen runs across the words once, per line, the first time the mark appears.
  const DRAW = '@keyframes annotated-draw{from{background-size:0% 100%}to{background-size:100% 100%}}'
    + '@media (prefers-reduced-motion:reduce){mark.annotated-hl{animation:none!important}}';
  // A passage can land in more than one piece when the page splits its text. Only the ends of the run are
  // capped, so the pieces between them butt together and read as one stroke.
  const JOIN = 'mark.annotated-hl:not(.hl-a){border-top-left-radius:0!important;border-bottom-left-radius:0!important;'
    + 'padding-left:0!important;margin-left:0!important}'
    + 'mark.annotated-hl:not(.hl-z){border-top-right-radius:0!important;border-bottom-right-radius:0!important;'
    + 'padding-right:0!important;margin-right:0!important}';
  const penCss = (name) => `mark.annotated-hl{${PENS[name] || PENS.chisel};color:#1C2433!important;`
    + 'background-repeat:no-repeat!important;background-size:100% 100%;'
    + 'animation:annotated-draw .72s cubic-bezier(.45,.05,.25,1) both;'
    + '-webkit-box-decoration-break:clone;box-decoration-break:clone}' + JOIN + DRAW;
  // The faint one while you are still dragging uses the browser's own highlight API, which takes a colour and
  // nothing else, so it stays flat whichever pen is chosen.
  // What would be taken if you captured now. A paler tint of the same yellow with the same ink, so it reads
  // as the pen resting rather than a second colour. The highlight API takes a colour and nothing else.
  const PENDING = '::highlight(annotated-pending){background-color:#FFF0A8;color:#1C2433}';
  style.textContent = penCss('chisel') + PENDING;
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
  mine.page = page;
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
    if (orphaned()) return;
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
      case 'set-snap': page.setSnap(msg.exact); reply({ ok: true }); return;
      case 'set-pen': style.textContent = penCss(msg.pen) + PENDING; reply({ ok: true }); return;
      case 'clear-selection': page.clear(); reply({ ok: true }); return;
      case 'pin-and-annotate': page.requestAnnotate(); reply({ ok: true }); return;
      case 'p-info': {
        const r = PostCore.extract(document, location);
        if (!r) { reply({ ok: false, error: 'Waiting for the post to load.' }); return; }
        const { el, ...rest } = r; reply({ ok: true, ...rest }); return;
      }
      // Sent once the screenshot has been taken, so a post folded behind Show more goes back to how it was.
      // Sent once the screenshot has been taken. The fold goes back, and the words that were quoted get their
      // highlight drawn on, so capturing a post leaves the same mark on the page that a passage does.
      case 'fold-restore': { page.refold(); page.paintTaken(); reply({ ok: true }); return; }
      case 'capture-post': {
        // A selection inside a reply annotates that reply. Otherwise the page's main post.
        const inPost = page.selectedPost();
        const r = inPost ? PostCore.read(inPost, location) : PostCore.extract(document, location);
        if (!r) { reply({ ok: false, error: 'Could not find the post on this page.' }); return; }
        // Words selected inside the post become its quote. Taking them also clears the highlight before the screenshot.
        const picked = page.takeWithin(r.el);
        if (picked && picked !== r.text) r.quote = picked;
        // A long post is folded behind Show more. Open it so the screenshot holds the whole post.
        page.unfold(r.el);
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

// Content script for any non-YouTube page. Wires the shared ArticlePage controller to extension messaging.
(() => {
  // Reloading the extension leaves an older copy of this script on the page with a dead connection. The newest
  // copy claims the page and the older one stays quiet, so the panel works again without reloading the page.
  // Take the older copy off the page before claiming it, so its button and its highlights go with it.
  const older = window.__annotatedArticle;
  if (older && older.page && typeof older.page.destroy === 'function') { try { older.page.destroy(); } catch { /* already gone */ } }
  // And anything a copy older than that left behind. Reloading the extension leaves the script that was
  // already on the page running with no way to reach the extension, and if it came from a version that could
  // not be asked to tidy up, its button stayed there. Two Annotate buttons, one of which did nothing.
  document.querySelectorAll('.annotated-ui').forEach((el) => el.remove());
  const mine = {};
  window.__annotatedArticle = mine;
  const orphaned = () => window.__annotatedArticle !== mine;
  const style = document.createElement('style');
  // The pens, with their colours written out. This sits on pages we do not own, so nothing here fades to
  // transparent, which would vanish on a dark page, and nothing uses a blend mode.
  const HI = '#FFE14A', DEEP = '#F2C600', LIFT = '#FFEE9E';
  // Each pen is a layer that sits behind one word. t and b are how far it reaches above and below the line,
  // o is how far it runs past the first and last word, and the four radii are the corners of the stroke.
  const PENS = {
    chisel: { img: `linear-gradient(103deg,${DEEP} 0 6%,${HI} 14% 88%,${LIFT} 100%)`, t: -1, b: -3, o: 3, tl: 4, tr: 11, br: 5, bl: 12 },
    wet: { img: `radial-gradient(9px 60% at 3% 52%,${DEEP},transparent 70%),radial-gradient(12px 62% at 98% 48%,${DEEP},transparent 72%),linear-gradient(180deg,${LIFT} 0 14%,${HI} 22% 78%,${DEEP} 100%)`, t: -1, b: -3, o: 3, tl: 3, tr: 10, br: 4, bl: 9 },
    twice: { img: `linear-gradient(101deg,${LIFT} 0 18%,${HI} 34% 70%,${DEEP} 78%,${HI} 100%)`, t: -2, b: -3, o: 3, tl: 5, tr: 12, br: 6, bl: 11 },
    streak: { img: `repeating-linear-gradient(94deg,transparent 0 11px,${LIFT} 11px 13px,transparent 13px 27px),linear-gradient(180deg,${LIFT},${HI} 46%,${DEEP})`, t: -1, b: -3, o: 3, tl: 4, tr: 10, br: 5, bl: 11 },
    flat: { img: `linear-gradient(${HI},${HI})`, t: -3, b: -3, o: 2, tl: 2, tr: 2, br: 2, bl: 2 },
  };
  // The pen runs across one word at a time. It is a transform on a layer, which the browser's compositor
  // draws by itself. Widening a background instead put the stroke on the page's own thread, and the page is
  // busy taking a screenshot at exactly that moment, so the stroke arrived finished and nobody ever saw it.
  const SWEEP = '@keyframes annotated-sweep{from{transform:scaleX(0)}to{transform:scaleX(1)}}'
    + '@media (prefers-reduced-motion:reduce){mark.annotated-hl.hl-go::before{animation:none}}';
  const penCss = (name) => {
    const p = PENS[name] || PENS.chisel;
    return 'mark.annotated-hl{background:none!important;color:#1C2433!important;position:relative!important;'
      + 'isolation:isolate!important;padding:0!important;margin:0!important;border-radius:0!important;'
      + 'text-shadow:none!important;text-decoration-color:currentColor}'
      // Pale words on a dark page would go to ink before the pen reached them, so they keep the page's own
      // colour until it does.
      + 'mark.annotated-hl.hl-lit{color:inherit!important}'
      + 'mark.annotated-hl.hl-lit.hl-inked{color:#1C2433!important}'
      + `mark.annotated-hl::before{content:"";position:absolute;z-index:-1;pointer-events:none;left:0;right:0;`
      + `top:${p.t}px;bottom:${p.b}px;background-image:${p.img};background-repeat:no-repeat;`
      + 'background-size:var(--bw,100%) 100%;background-position:var(--bx,0) 0;transform-origin:left center}'
      // A hair of overlap between words, so no seam shows where two layers meet.
      + 'mark.annotated-hl:not(.hl-z)::before{right:-.6px}'
      // Only the ends of the run are capped and run past the words. The pieces between butt together.
      + `mark.annotated-hl.hl-a::before{left:-${p.o}px;border-top-left-radius:${p.tl}px;border-bottom-left-radius:${p.bl}px}`
      + `mark.annotated-hl.hl-z::before{right:-${p.o}px;border-top-right-radius:${p.tr}px;border-bottom-right-radius:${p.br}px}`
      + 'mark.annotated-hl.hl-go::before{animation:annotated-sweep var(--sw,160ms) linear var(--d,0ms) both}'
      + SWEEP;
  };
  // The faint one while you are still dragging uses the browser's own highlight API, which takes a colour and
  // nothing else, so it stays flat whichever pen is chosen.
  // What would be taken if you captured now. A paler tint of the same yellow with the same ink, so it reads
  // as the pen resting rather than a second colour. The highlight API takes a colour and nothing else.
  const PENDING = '::highlight(annotated-pending){background-color:#FFF0A8;color:#1C2433}';
  style.textContent = penCss('chisel') + PENDING;
  (document.head || document.documentElement).appendChild(style);
  // Talking to nobody means the extension has been reloaded or removed and this copy is a leftover, so it
  // takes itself off the page rather than leaving a button that cannot do anything.
  const send = (m) => chrome.runtime.sendMessage(m).catch(() => {
    if (!chrome.runtime || !chrome.runtime.id) { try { if (mine.page) mine.page.destroy(); } catch { /* already gone */ } }
  });
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
  // How much writing is on the page, which is only used to guess whether this looks like a podcast and is
  // read when a panel is first made. Measuring it asks the page for a full layout, and the panel asks for
  // this two and a half times a second, so it is measured now and then rather than every time.
  let textLen = -1, textAt = 0;
  function pageTextLen() {
    const now = Date.now();
    if (textLen < 0 || now - textAt > 10000) { textLen = (document.body.innerText || '').length; textAt = now; }
    return textLen;
  }
  function podInfo() {
    const a = pickAudio();
    if (!a) return { ok: false, found: false };
    // Some players only load the episode on play. Ask for its length without starting it.
    if (!isFinite(a.duration) && a.readyState === 0 && a.paused && a.preload === 'none') { a.preload = 'metadata'; try { a.load(); } catch {} }
    const type = metaContent('meta[property="og:type"]').toLowerCase();
    const likely = /podcast|episode|audio|music/.test(type + ' ' + location.pathname.toLowerCase()) || pageTextLen() < 2500;
    return { ...pod.info(), found: true, src: a.currentSrc || a.src || (a.querySelector('source') || {}).src || '', likely, route: route(a) };
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (orphaned()) return;
    switch (msg?.type) {
      case 'aping': reply({ ok: true }); return;
      case 'pod-info': reply(podInfo()); return;
      case 'clear-captured': ArticleCore.clearHighlights(document); page.forgetTaken(); reply({ ok: true }); return;
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
      // The stroke is already on the page by then, drawn before the picture rather than after it.
      case 'fold-restore': { page.refold(); reply({ ok: true }); return; }
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
        // The post settles, then the pen crosses the words that were quoted, and the picture waits for it.
        // Drawing it finished for the picture and again afterwards marked the passage twice over.
        // The reply is sent whatever happens in here. Without this, anything that threw left the panel
        // waiting on a reply that was never going to come, sitting on Capturing for good.
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
          let drawing = 0;
          try { drawing = page.paintTaken(); } catch (e) { reply({ ok: false, error: e.message }); return; }
          setTimeout(() => {
            try {
              const b = r.el.getBoundingClientRect();
              const { el, ...rest } = r;
              reply({ ok: true, ...rest, clip: { x: b.left, y: b.top, w: b.width, h: b.height }, vw: window.innerWidth });
            } catch (e) { reply({ ok: false, error: e.message }); }
          }, drawing + 40);
        }, 150)));
        return true;
      }
    }
  });
})();

// The front page, drawn at once. It needs nothing from the database, so a slow or unreachable database
// never leaves a first visitor looking at a blank page: the headline, the try-it and the install steps
// appear straight away, and the latest annotations fill in when they arrive, or never show at all.
//   One try-it with four tabs (a passage, a clip, a podcast moment, a post), the tab setting the headline's
//   word. The brief's paper is TryIt, the other three are SceneTry.
//   One motion at a time: the headline's word only starts changing after the example has played.
//   Someone who has the extension is told so, and not told to get it.
var Landing = (() => {
  const TABS = [
    { kind: 'article', label: 'Article', icon: 'article', word: 'a passage' },
    { kind: 'video', label: 'YouTube clip', icon: 'clip', word: 'a clip' },
    { kind: 'audio', label: 'Podcast', icon: 'podcast', word: 'a podcast' },
    { kind: 'post', label: 'Post on X', icon: 'post', word: 'a post on X' },
  ];
  const WORDS = ['anything', ...TABS.map((t) => t.word)];
  const icon = (n) => (typeof Brand !== 'undefined' ? Brand.icon(n) : '');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ?preview=visitor shows the page as a first-time visitor sees it, extension or not, install plane and all
  // (David, 2026-09-25: with annotated installed he could never see the plane that brings the install button).
  const PREVIEW = new URLSearchParams(location.search).get('preview') === 'visitor';
  const installed = () => !PREVIEW && document.documentElement.dataset.annotatedInstalled === '1';

  // Signed in, the header carries You, as every other page of the site does. It carried only Feed, so the
  // home page was the one page with no way to your profile (recording of 2026-09-25 at 06:58, 1:14).
  const escH = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function header(root, { signedIn, onSignIn, me = null, onProfile = null }) {
    const bar = document.createElement('header');
    bar.className = 'sitebar landBar';
    const pic = me && /^https:\/\//.test(me.avatar || '') ? `<img src="${escH(me.avatar)}" alt="" referrerpolicy="no-referrer">` : escH(((me && me.name) || 'Y').trim().slice(0, 1).toUpperCase());
    const you = `<button type="button" class="navBtn navProfile"><span class="avatar xs ${me && me.avatar ? 'hasImg' : ''}" aria-hidden="true">${pic}</span> You</button>`;
    bar.innerHTML = `<a class="wmBtn" href="/" aria-label="annotated home">${typeof Brand !== 'undefined' ? Brand.wordmark() : 'annotated'}</a>
      <nav class="sitenav" aria-label="Site"><a class="navBtn navFeed" href="/?feed">Feed</a>${signedIn ? you : '<button type="button" class="navBtn webSignIn">Sign in</button>'}</nav>`;
    const s = bar.querySelector('.webSignIn');
    if (s) { s.setAttribute('aria-label', 'Sign in with Google or X'); s.addEventListener('click', onSignIn); }
    const y = bar.querySelector('.navProfile');
    if (y && onProfile) y.addEventListener('click', onProfile);
    // The logo on the home page itself goes to the top rather than loading the page again, which replayed the
    // brief's flight and the install plane on every press (recording of 2026-09-25 at 06:58, 0:38 and 0:52).
    bar.querySelector('.wmBtn').addEventListener('click', (e) => {
      if (location.pathname !== '/' || /[?&](feed|tag)\b/.test(location.search)) return;
      e.preventDefault();
      scrollTo({ top: 0, behavior: still() ? 'auto' : 'smooth' });
    });
    root.appendChild(bar);
  }

  function hero(root) {
    const el = document.createElement('section');
    el.className = 'hero landHero'; el.id = 'try';
    el.innerHTML = `
      <div class="heroCopy">
        <p class="heroKicker">For Chrome</p>
        <h1 class="heroH" aria-label="Say what you think about anything: a passage, a clip, a podcast, or a post on X.">Say what you think about <mark class="heroMark" aria-hidden="true">anything</mark><span class="heroTail" aria-hidden="true">.</span></h1>
        <p class="heroSub">Highlight a sentence, clip a video or podcast, or quote a post. Add what you think. Share the link.</p>
        <p class="heroDo heroGetRow"><a class="primary heroGet" href="#get">Get the Chrome extension</a><a class="link heroLook" href="/?feed">Look around first</a></p>
        <p class="heroTrust"><a class="heroDemo" href="https://youtu.be/VTbDJ9a-2XE" target="_blank" rel="noopener"><span class="hdPlay" aria-hidden="true"></span>Watch the demo <span class="num">2:44</span></a><span class="heroFree">Free and open source. No ads.</span></p>
        <p class="heroHave" hidden>You're set. Go to any article, video or post and press the annotated plane in your toolbar.</p>
      </div>
      <div class="heroTry">
        <div class="tryTabs" role="tablist" aria-label="Try it on">${TABS.map((t, i) => `<button type="button" role="tab" class="tryTab" id="tab-${t.kind}" aria-controls="panel-${t.kind}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-i="${i}">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}</div>
        ${TABS.map((t, i) => `<div class="tryPanel tp-${t.kind}" role="tabpanel" id="panel-${t.kind}" aria-labelledby="tab-${t.kind}" ${i ? 'hidden' : ''}></div>`).join('')}
      </div>`;
    root.appendChild(el);
    // The try-it sits in a box of its own that eases to its height (set up before anything is mounted in it).
    { const t = el.querySelector('.heroTry'), box = document.createElement('div'); box.className = 'heroTryBox'; t.replaceWith(box); box.appendChild(t); smooth(box, t); }
    const panels = [...el.querySelectorAll('.tryPanel')];
    const art = typeof TryIt !== 'undefined' && TryIt.mount(panels[0]);
    TABS.slice(1).forEach((t, i) => { if (typeof SceneTry !== 'undefined') SceneTry.mount(panels[i + 1], t.kind); });
    if (!art) panels[0].innerHTML = '<p class="note">Select any words on any page with the extension, and add your take.</p>';
    const cyc = cycle(el);
    // Tabs as tabs: arrows move between them, and choosing one sets the headline's word for good.
    const tabs = [...el.querySelectorAll('.tryTab')];
    const tryBox = el.querySelector('.heroTry');
    const pick = (i, focus) => {
      const before = tryBox.offsetHeight;
      tabs.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; panels[j].hidden = i !== j; });
      // Grows to a taller tab, and keeps that height when a shorter one is chosen (web.css, .heroTry).
      tryBox.style.minHeight = Math.max(before, parseFloat(tryBox.style.minHeight) || 0) + 'px';
      if (focus) tabs[i].focus();
      cyc.set(TABS[i].word);
      document.dispatchEvent(new CustomEvent('annotated-tryit-touched'));
      // A card measured while its panel was hidden sits in the wrong place, so shown again it is placed again.
      window.dispatchEvent(new Event('resize'));
    };
    // A card in Yours so far opens the tab it was made in (landing.js yoursCard), since its install link goes
    // nowhere once the extension is installed (recording of 2026-09-24 at 21:48, five clicks with no answer).
    document.addEventListener('annotated-open-kind', (e) => {
      const i = TABS.findIndex((t) => t.kind === (e.detail && e.detail.kind));
      if (i < 0) return;
      pick(i);
      // Only when the try-it is out of sight: scrolling a page already showing it nudged it on every click
      // (recording of 2026-09-24 at 23:56, 1:56 to 1:59).
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.top > innerHeight * .5) el.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' });
    });
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => pick(i));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); pick((i + 1) % tabs.length, true); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); pick((i + tabs.length - 1) % tabs.length, true); }
      });
    });
    return el;
  }

  // The headline's word, redrawn by the pen. It waits for the example to finish, so two pens are never
  // moving at once, runs two rounds, and stops for good the moment anything on the try-it is touched.
  function cycle(hero) {
    const h = hero.querySelector('.heroH'), mark = hero.querySelector('.heroMark');
    let tallest = 0;
    for (const w of WORDS) { mark.textContent = w; tallest = Math.max(tallest, h.offsetHeight); }
    mark.textContent = 'anything'; h.style.minHeight = tallest + 'px';
    let i = 0, rounds = 0, timer = null, stopped = false;
    const show = (w) => { mark.textContent = w; mark.classList.remove('lifting', 'drawn'); void mark.offsetWidth; mark.classList.add('redraw'); };
    const stop = () => { stopped = true; clearTimeout(timer); mark.classList.remove('lifting'); };
    const next = () => {
      if (stopped) return;
      mark.classList.remove('redraw', 'drawn'); mark.classList.add('lifting');
      timer = setTimeout(() => {
        if (stopped) return;
        i = (i + 1) % WORDS.length; if (i === 0) rounds += 1;
        show(WORDS[i]);
        if (rounds >= 2 && i === 0) { stopped = true; return; }
        timer = setTimeout(next, 4000);
      }, 320);
    };
    // It used to go round the four words on its own after the example, which put "a clip" and "a podcast" over
    // the article while the Article tab was chosen (recording of 2026-09-24 at 20:19). It follows the tab now.
    void next;
    document.addEventListener('annotated-tryit-touched', stop);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stop(); });
    return { set: (w) => { stop(); if (mark.textContent !== w) { mark.classList.remove('lifting'); show(w); } } };
  }

  // Getting it, three steps in a row. The first ticks when the file is taken and the second has the address
  // to copy, since a web page may not link to Chrome's own pages.
  // A download button, once pressed, reads Downloaded and still downloads again if pressed.
  function markDownloaded(b) {
    if (!b || b.classList.contains('didDownload')) return;
    b.classList.add('didDownload');
    b.innerHTML = `${icon('check')} Downloaded`;
    b.title = 'Download it again';
  }
  document.addEventListener('click', (e) => { const g = e.target.closest && e.target.closest('.heroGet[download]'); if (g) markDownloaded(g); });

  function install(root) {
    const box = document.createElement('section');
    box.className = 'getIt landGet'; box.id = 'get';
    box.innerHTML = `<h2 class="giH">Get it in about a minute</h2>
      <p class="marginNote mnGet" aria-hidden="true"><svg class="mnArrow" viewBox="0 0 90 60" aria-hidden="true"><path d="M86 10 C 60 6, 26 16, 12 46" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 34 L 11 47 L 23 42" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>not in the Chrome store yet, so it takes these three steps</p>
      <ol class="giSteps">
        <li><b>Download it</b><span><a href="/annotated-extension.zip" download>annotated-extension.zip</a>, then unzip it.</span></li>
        <li><b>Turn on Developer mode</b><span>Paste <code>chrome://extensions</code> into the address bar <button type="button" class="link giCopy">Copy it</button> and flip the switch at the top right.</span></li>
        <li><b>Load it</b><span>Load unpacked, choose the folder, and pin annotated from the puzzle piece.</span></li>
      </ol>
      <p class="giDo"><a class="primary" href="/annotated-extension.zip" download>Download the extension</a><a class="link" href="https://github.com/goldenburger/annotated" target="_blank" rel="noopener">See the code on GitHub</a></p>`;
    root.appendChild(box);
    const cp = box.querySelector('.giCopy');
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText('chrome://extensions'); cp.textContent = 'Copied'; } catch { cp.textContent = 'Select it and copy'; }
      setTimeout(() => { cp.textContent = 'Copy it'; }, 2200);
    });
    box.querySelectorAll('a[download]').forEach((a) => a.addEventListener('click', () => {
      const first = box.querySelector('.giSteps li');
      first.classList.add('done'); first.querySelector('span').textContent = 'Downloaded. Unzip it wherever you keep things.';
      box.querySelector('.giSteps li:nth-child(2)').classList.add('now');
      // The button says so too. The small tick on the first step was missed, and it was pressed twice in the
      // recording of 2026-09-25 at 14:08 (0:48, 0:50).
      markDownloaded(box.querySelector('.giDo .primary'));
    }));
    return box;
  }

  // The four newest published annotations, drawn with the feed's own cards, and ahead of them your own latest
  // annotation from the try-it, whichever tab it came from. Yours is kept in this browser (annotated-yours) and
  // drawn again whenever the page is, since it is only ever here. The published ones are hidden with fewer than
  // three, so a quiet week or no database is no row, unless there is one of yours to show.
  const YOURS = 'annotated-yours';
  const readYours = () => { try { return JSON.parse(localStorage.getItem(YOURS) || 'null'); } catch { return null; } };
  const ago = (at) => { const m = Math.floor((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : 'earlier'; };
  // A clip on a card: muted, inline, playing from its start to its end and round again while the card is in sight.
  // `from`: where the first play starts, the brightest frame of the clip, since the launch clip opens on night
  // and the card showed a black square for its first seconds (recording of 2026-09-25 at 03:54, 1:06 and 1:28).
  // The clip's frames are fetched as the page opens, so a new card shows its frame at once. It was a black box for
  // half a second while the picture of frames arrived (recording of 2026-09-25 at 16:45, 2:24). Only the front
  // page asks for it (in `mount`); the feed, profiles and annotations load this file too and never show it.
  function loopClip(frame, src, a, z, from = a) {
    const v = document.createElement('video');
    v.className = 'yClip'; v.muted = true; v.playsInline = true; v.preload = 'none';
    v.setAttribute('muted', ''); v.setAttribute('aria-hidden', 'true');
    // Only the start in the address: with the end in it too, the browser pauses there instead of going round.
    v.src = `${src}#t=${from}`;
    frame.appendChild(v);
    const round = () => { if (v.currentTime >= z - .05 || v.currentTime < a - .5) v.currentTime = a; };
    v.addEventListener('timeupdate', round);
    v.addEventListener('ended', () => { v.currentTime = a; v.play().catch(() => {}); });
    // The still frame shows until the video is really playing, and again while it jumps back to the start or
    // waits for data. Revealed early it showed black in Edge and white in Firefox (recording of 2026-09-25 at 04:48).
    const hide = () => frame.classList.remove('playing');
    v.addEventListener('playing', () => frame.classList.add('playing'));
    v.addEventListener('seeked', () => { if (!v.paused) frame.classList.add('playing'); });
    ['seeking', 'waiting', 'pause', 'emptied'].forEach((n) => v.addEventListener(n, hide));
    if (still()) return;
    const go = () => { if (v.readyState < 1) { v.addEventListener('loadedmetadata', () => { v.currentTime = from; v.play().catch(() => {}); }, { once: true }); v.load(); } else v.play().catch(() => {}); };
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => es.forEach((x) => (x.isIntersecting ? go() : v.pause())), { threshold: .4 }).observe(frame);
    else go();
  }
  // A moment on a card: a play button over its waveform. Playing, a line crosses the bars; it stops at the end.
  let listening = null;
  function listenClip(wave, src, a, z) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'yListen'; b.setAttribute('aria-label', 'Listen to this moment');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    const head = document.createElement('span'); head.className = 'yHead'; head.hidden = true;
    wave.append(head, b);
    // The whole waveform plays it, not only the button: it was clicked four times in the recording at 23:56.
    wave.addEventListener('click', (e) => { if (e.target !== b && !b.contains(e.target)) { e.preventDefault(); e.stopPropagation(); b.click(); } });
    let au = null, raf = 0;
    const stop = () => {
      if (!au) return;
      au.pause(); cancelAnimationFrame(raf); head.hidden = true; wave.classList.remove('playing');
      b.setAttribute('aria-label', 'Listen to this moment');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
      if (listening === stop) listening = null;
    };
    const tick = () => {
      const p = Math.max(0, Math.min(1, (au.currentTime - a) / (z - a)));
      head.style.left = `calc(44px + (100% - 50px) * ${p.toFixed(4)})`;
      if (au.currentTime >= z || au.ended) { stop(); return; }
      raf = requestAnimationFrame(tick);
    };
    b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (wave.classList.contains('playing')) { stop(); return; }
      if (listening) listening();
      if (!au) { au = new Audio(src); au.preload = 'metadata'; }
      const go = () => { au.currentTime = a; au.play().catch(stop); };
      if (au.readyState >= 1) go(); else au.addEventListener('loadedmetadata', go, { once: true });
      listening = stop;
      wave.classList.add('playing'); head.hidden = false;
      b.setAttribute('aria-label', 'Stop');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>';
      raf = requestAnimationFrame(tick);
    });
  }
  function yoursCard(y) {
    const li = document.createElement('li');
    li.className = 'cardItem yours';
    const get = y.example ? 'Now make your own, above' : 'Get the extension to do this on any page';
    if (y.example) li.classList.add('example');
    li.innerHTML = `<a class="card mf nothumb" href="${y.example ? '#try' : '#get'}" aria-label="${y.example ? 'An example annotation' : 'Your annotation, only on this computer'}. ${get}.">
      <span class="cbody"><span class="cmeta">You <span class="dotsep"></span></span>
      <span class="ctake"></span><span class="yMedia"></span>
      <span class="csource">${icon({ video: 'clip', audio: 'podcast', post: 'post' }[y.kind] || 'article')}<span><span class="cst"></span><span class="csn"></span></span></span>
      ${y.example ? `<span class="yGet">${get}</span>` : ''}</span></a>
      <button type="button" class="yDel" aria-label="Remove this one" title="Remove">×</button>`;
    li.dataset.at = String(y.at || '');
    li.firstElementChild.addEventListener('click', (e) => {
      if (!y.example && !installed()) return;
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('annotated-open-kind', { detail: { kind: y.kind || 'article' } }));
    });
    li.querySelector('.dotsep').textContent = ago(y.at || Date.now());
    if (y.example) { li.querySelector('.cmeta').innerHTML = '<span class="yEx">Example</span>'; }
    li.querySelector('.ctake').textContent = y.take || '';
    li.querySelector('.cst').textContent = y.source || '';
    const m = li.querySelector('.yMedia');
    // Words are the picture of a passage or a post: shown large and inked, where they used to sit small in the
    // source box above a card of white space (recording of 2026-09-24 at 23:56).
    const words = y.quote && !y.thumb && !Array.isArray(y.wave);
    li.querySelector('.csn').textContent = words ? (y.kind === 'post' ? 'Post' : 'Passage') : y.quote ? `“${y.quote}”` : (y.what || '');
    if (words) { const q = document.createElement('span'); q.className = 'yQuote'; const k = document.createElement('span'), t = document.createElement('span'); t.textContent = y.quote; k.appendChild(t); q.appendChild(k); m.appendChild(q); }
    if (y.thumb && /^\/media\//.test(y.thumb.src)) {
      // A frame of the clip, cut from the video's own sprite of frames.
      const t = y.thumb, col = t.idx % t.cols, row = Math.floor(t.idx / t.cols);
      const e = document.createElement('span'); e.className = 'yThumb';
      e.style.backgroundImage = `url("${t.src}")`;
      e.style.backgroundSize = `${t.cols * 100}% ${t.rows * 100}%`;
      e.style.backgroundPosition = `${t.cols > 1 ? (col / (t.cols - 1)) * 100 : 0}% ${t.rows > 1 ? (row / (t.rows - 1)) * 100 : 0}%`;
      m.appendChild(e);
      // The clip itself, silent and on repeat, over its frame, as a clip plays on a card in the feed. Cards kept
      // from before this carry the range only in their words ("Clip 2:57 to 3:19 of 5:47").
      let a = Number(y.a), z = Number(y.z);
      if (!(z > a)) {
        const sec = (s) => s.split(':').reduce((n, x) => n * 60 + Number(x), 0);
        const hit = /(\d+:\d{2}) to (\d+:\d{2})/.exec(y.what || '');
        if (hit) { a = sec(hit[1]); z = sec(hit[2]); }
      }
      if (z > a) loopClip(e, '/media/artemis-i.mp4', a, z, Math.min(z - 1, Math.max(a, t.idx * 2)));
    } else if (Array.isArray(y.wave)) {
      const e = document.createElement('span'); e.className = 'yWave';
      y.wave.slice(0, 40).forEach((v) => { const i = document.createElement('i'); i.style.height = Math.round(Math.max(.1, Math.min(1, +v || 0)) * 100) + '%'; e.appendChild(i); });
      m.appendChild(e);
      // Its moment can be listened to from the card: the episode's own audio from the start of the moment to its end.
      let a = Number(y.a), z = Number(y.z);
      if (!(z > a)) {
        const sec = (s) => s.split(':').reduce((n, x) => n * 60 + Number(x), 0);
        const hit = /(\d+:\d{2}) to (\d+:\d{2})/.exec(y.what || '');
        if (hit) { a = sec(hit[1]); z = sec(hit[2]); }
      }
      if (z > a) listenClip(e, '/media/astronaut.mp3', a, z);
    }
    return li;
  }
  // A region that eases to its new height instead of snapping (recording of 2026-09-29 at 16:31: Annotate opened the take
  // box and everything below jumped 200 pixels in one frame, and Yours so far vanished and came back two seconds later).
  // `inner` holds everything and keeps its own height; `el` around it eases to that height over half a second, gently at both ends, so the page below
  // slides rather than jumps. A ResizeObserver reports the new size after layout and before paint, so the move starts
  // in the frame of the change and the new size is never painted first. `fold(true)` folds it away before hiding it.
  // With reduced motion nothing moves.
  function smooth(el, inner) {
    const off = still() || typeof ResizeObserver === 'undefined';
    let shown = null, done = 0, folding = false, delta = 0, edges = '';
    // Its margins, top padding and rule slide in and out with it; they snapped in at once, about 48 pixels.
    const EDGE = ['marginTop', 'marginBottom', 'paddingTop', 'borderTopWidth'];
    const calibrate = () => { if (!el.hidden && !el.style.height) delta = el.offsetHeight - inner.offsetHeight; };
    const natural = () => (el.hidden ? 0 : inner.offsetHeight + delta);
    const settle = () => { el.style.height = ''; el.style.transition = ''; el.style.overflow = ''; el.style.overflowClipMargin = ''; EDGE.forEach((k) => { el.style[k] = ''; }); edges = ''; calibrate(); };
    const go = (to, then) => {
      // From where it is now: mid-move that is the moving height, not where the last move was headed.
      const from = el.style.height ? el.getBoundingClientRect().height : shown == null ? to : shown;
      shown = to;
      if (Math.abs(to - from) < 2) { if (!el.style.height || then) { clearTimeout(done); settle(); } if (then) then(); return; }
      clearTimeout(done);
      // Edges still sliding keep where they are, or restarting the move would drop them straight to their end.
      if (edges) { const cs = getComputedStyle(el), now = EDGE.map((k) => cs[k]); EDGE.forEach((k, i) => { el.style[k] = now[i]; }); }
      // Clipped while it moves, so what is coming is revealed rather than laid over the section below; the margin keeps
      // the paper's shadows.
      el.style.transition = 'none'; el.style.height = from + 'px'; el.style.overflow = 'clip'; el.style.overflowClipMargin = '28px';
      el.offsetHeight;   // the start is laid out before the move begins
      const E = '.5s cubic-bezier(.4, 0, .2, 1)';
      el.style.transition = `height ${E}, margin ${E}, padding ${E}, border-width ${E}`; el.style.height = to + 'px';
      if (edges === 'in') EDGE.forEach((k) => { el.style[k] = ''; });
      if (edges === 'out') EDGE.forEach((k) => { el.style[k] = '0px'; });
      done = setTimeout(() => { settle(); if (then) then(); }, 530);
    };
    const check = () => { if (el.isConnected && !folding) go(natural()); };
    if (!off) {
      new ResizeObserver(check).observe(inner);
      shown = el.hidden ? 0 : el.offsetHeight;
      calibrate();
    }
    return {
      fold(hide) {
        if (off) { el.hidden = hide; return; }
        if (!hide) {
          if (folding) { folding = false; clearTimeout(done); check(); return; }
          // Shown at no height before it is painted, or it would flash at full size for a frame.
          if (el.hidden) { el.hidden = false; calibrate(); shown = 0; el.style.height = '0px'; el.style.overflow = 'clip'; EDGE.forEach((k) => { el.style[k] = '0px'; }); edges = 'in'; check(); }
          return;
        }
        if (el.hidden || folding) return;
        folding = true; edges = 'out';
        go(0, () => { folding = false; el.hidden = true; settle(); shown = 0; });
      },
    };
  }
  function latest(root) {
    const box = document.createElement('section');
    box.className = 'landLatest'; box.hidden = true;
    box.innerHTML = '<div class="llHead"><h2>Yours so far</h2>' + (typeof PaperDeco !== 'undefined' ? PaperDeco.rule() : '') + '<p class="llNote"><span class="llUndo" role="status" hidden><span></span> <button type="button" class="link llUndoBtn">Undo</button></span> Only on this computer <button type="button" class="link llClear">Clear all</button></p></div><ul class="llRow"></ul><p class="llEmpty" hidden>All cleared. <button type="button" class="link llMake">Make one above</button>.</p><p class="llGet"><a class="link" href="#get">Get the extension to do this on any page</a></p>';
    { const inner = document.createElement('div'); inner.className = 'llIn'; inner.append(...box.childNodes); box.appendChild(inner); }
    root.appendChild(box);
    const row = box.querySelector('.llRow');
    const ease = smooth(box, box.querySelector('.llIn'));
    let drawn = false;
    const list = () => { const y = readYours(); return (Array.isArray(y) ? y : y ? [y] : []).filter((x) => x && typeof x === 'object'); };
    const drawRow = () => { list().forEach((y) => { try { row.appendChild(yoursCard(y)); } catch (e) { console.warn('annotated: a saved card could not be drawn', e); } }); };
    const save = (arr) => { try { localStorage.setItem(YOURS, JSON.stringify(arr.slice(0, 4))); } catch { /* private window */ } };
    const tidy = () => {
      // Said once under the row, where every card used to say it (David, 2026-09-25), and not at all once
      // the extension is installed, or when the only card is the example, which has its own line.
      const get = box.querySelector('.llGet');
      if (get) get.hidden = installed() || !row.querySelector('.yours:not(.example)');
      while (row.children.length > 4) row.lastElementChild.remove();
      row.style.setProperty('--n', Math.max(1, row.children.length));
      // Folded away and back smoothly, never just gone (only the first drawing is immediate).
      if (drawn) ease.fold(!row.children.length); else box.hidden = !row.children.length;
      drawn = true;
      // While Undo is offered over an emptied row, the row says so rather than sitting blank under its heading
      // (recording of 2026-09-25 at 03:14, 2:26 to 2:34).
      const empty = box.querySelector('.llEmpty');
      if (empty) empty.hidden = !!row.children.length;
    };
    drawRow();
    tidy();
    document.addEventListener('annotated-installed', tidy);
    // Another tab's takes and removals reach this one. A front page left open showed only what was made in it,
    // one card where there were four (recording of 2026-09-25 at 03:54, 3:02).
    addEventListener('storage', (e) => {
      if (e.key !== YOURS || row.querySelector('.pl-hidden')) return;
      if (listening) listening();
      row.innerHTML = ''; drawRow(); tidy();
    });
    // Removing: one card by its ×, or all of them. Undo puts them back for six seconds.
    const undoBar = box.querySelector('.llUndo');
    let undoTimer = 0, lastGone = null;
    const redraw = () => { if (listening) listening(); row.innerHTML = ''; drawRow(); tidy(); };
    const remove = (pick, said) => {
      const all = list(), gone = all.filter(pick), kept = all.filter((y) => !pick(y));
      if (!gone.length) { row.querySelectorAll('.example').forEach((x) => x.remove()); tidy(); return; }
      save(kept);
      // Emptying the row is not an invitation to the example: it waits for another visit or Show me an example.
      try { sessionStorage.setItem('annotated-example-shown', '1'); } catch {}
      lastGone = { gone };
      redraw();
      undoBar.querySelector('span').textContent = said;
      undoBar.hidden = false; ease.fold(false);
      box.querySelector('.llEmpty').hidden = !!row.children.length;
      clearTimeout(undoTimer);
      undoTimer = setTimeout(() => { undoBar.hidden = true; lastGone = null; tidy(); }, 6000);
    };
    box.querySelector('.llUndoBtn').addEventListener('click', () => {
      if (!lastGone) return;
      const back = [...lastGone.gone, ...list()].filter((y, i, a) => a.findIndex((z) => z.at === y.at) === i).sort((a, b) => (b.at || 0) - (a.at || 0));
      save(back);
      lastGone = null; clearTimeout(undoTimer); undoBar.hidden = true; redraw();
    });
    row.addEventListener('click', (e) => {
      const x = e.target.closest && e.target.closest('.yDel');
      if (!x) return;
      e.preventDefault();
      const li = x.closest('li');
      if (li.classList.contains('example')) { li.remove(); tidy(); return; }
      const at = li.dataset.at;
      remove((y) => String(y.at) === at, 'Removed.');
    });
    box.querySelector('.llClear').addEventListener('click', () => remove(() => true, 'All of yours removed.'));
    // origin: what it was made from, for anything that wants to show it travelling here.
    document.addEventListener('annotated-tryit-example', (e) => {
      if (list().length || row.querySelector('.example')) return;
      e.preventDefault();
      const li = yoursCard({ example: true, kind: 'article', take: e.detail.take, quote: e.detail.quote, source: 'The annotated.com brief', at: Date.now() });
      row.prepend(li); tidy();
      document.dispatchEvent(new CustomEvent('annotated-yours-drawn', { detail: { card: li.firstElementChild, li, fresh: true, example: true, origin: document.querySelector('.tp-article .tiTilt > .tiPaper'), kind: 'article' } }));
    });
    const endUndo = () => { lastGone = null; clearTimeout(undoTimer); undoBar.hidden = true; };
    const add = (y, origin) => {
      endUndo();
      row.querySelectorAll('.example').forEach((x) => x.remove());
      y.at = Date.now();
      save([y, ...list()]);
      const li = yoursCard(y);
      row.prepend(li); tidy();
      document.dispatchEvent(new CustomEvent('annotated-yours-drawn', { detail: { card: li.firstElementChild, li, fresh: true, origin, kind: y.kind } }));
    };
    document.addEventListener('annotated-tryit-made', () => {
      let t = null; try { t = JSON.parse(localStorage.getItem('annotated-tryit') || 'null'); } catch {}
      if (t) add({ kind: 'article', take: t.take, quote: t.quote, source: 'The annotated.com brief', tryitAt: t.at }, document.querySelector('.tp-article .tiTilt > .tiPaper'));
    });
    document.addEventListener('annotated-scene-made', (e) => {
      const d = e.detail || {};
      const src = { video: 'NASA, To the Moon and Back: The Journey of Artemis I', audio: 'NASA, Houston We Have a Podcast', post: 'Dario Amodei on X', article: 'An example article' }[d.kind] || d.source;
      add({ kind: d.kind, take: d.take, quote: d.quote || '', what: d.what, source: src, thumb: d.thumb, wave: d.wave, a: d.a, z: d.z }, d.card);
    });
    return { fill() {} };
  }
  // "See it", wherever it is offered: to Latest on annotated, where yours is.
  document.addEventListener('click', (e) => {
    // "Make one above", after Clear all: up to the try-it, which is off screen by then (2026-09-26 at 04:06, 2:04).
    const mk = e.target.closest && e.target.closest('.llMake');
    if (mk) { const t = document.querySelector('.heroTry, .tryit'); if (t) t.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' }); return; }
    const b = e.target.closest && e.target.closest('.seeYours');
    if (!b) return;
    const row = document.querySelector('.landLatest .llRow');
    if (row) row.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' });
  });

  function footer(root) {
    const f = document.createElement('footer');
    f.className = 'webFoot'; f.innerHTML = '<a href="/">annotated</a> <a href="/install">Get the extension</a> <a href="/privacy">Privacy</a> <a href="/terms">Terms</a>';
    root.appendChild(f);
  }

  // Someone who has the extension. Its page script marks our pages, and may do so a moment after they load.
  function watchInstalled(root) {
    const fresh = new URLSearchParams(location.search).has('installed');
    const apply = () => {
      if (!installed()) return;
      // The install button stays, and still arrives by plane: someone with annotated may want the link for a
      // friend or another computer (David, 2026-09-25). It downloads the extension, since the steps under it hide.
      root.querySelectorAll('.landGet').forEach((e) => { e.hidden = true; });
      const get = root.querySelector('.heroGet');
      if (get && !get.hasAttribute('download')) { get.href = '/annotated-extension.zip'; get.setAttribute('download', ''); }
      const have = root.querySelector('.heroHave'); if (!have) return;
      have.hidden = false;
      if (fresh && !have.dataset.fresh) {
        // Opened by the extension right after it was installed.
        have.dataset.fresh = '1';
        have.innerHTML = `<b>You're set.</b> Pin annotated from the puzzle piece in your toolbar, then go to any article, video or post and press the annotated plane.`;
      }
    };
    apply();
    // The extension marks the page a moment after it loads, and the hero used to show the install steps and then
    // swap them for "You have annotated" in front of you (recording of 2026-09-24 at 20:19). They wait unseen for
    // up to 0.8 seconds, the time the mark takes, and appear at once if it comes.
    if (!installed()) {
      root.classList.add('landChecking');
      const reveal = () => root.classList.remove('landChecking');
      const t = setTimeout(reveal, 800);
      document.addEventListener('annotated-installed', () => { clearTimeout(t); apply(); reveal(); }, { once: true });
    }
    document.addEventListener('annotated-installed', apply);
    new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-annotated-installed'] });
  }

  // The paper planes can be turned off, and back on, from the foot of the home page. The page reloads, since the
  // planes are set up as it loads.
  function planesSwitch() {
    const foot = document.querySelector('.webFoot');
    if (!foot || foot.querySelector('.planesSwitch')) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 760px), (hover: none)').matches) return;
    let off = false; try { off = localStorage.getItem('annotated-planes-off') === '1'; } catch {}
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'link planesSwitch';
    b.textContent = off ? 'Turn paper planes on' : 'Turn paper planes off';
    b.addEventListener('click', () => {
      try { if (off) localStorage.removeItem('annotated-planes-off'); else localStorage.setItem('annotated-planes-off', '1'); } catch {}
      location.reload();
    });
    foot.appendChild(document.createTextNode(' '));
    foot.appendChild(b);
  }

  // The plane at the end of the trail at the foot of the page is a button while the planes are on: pressed, it flies
  // off along its way and the page plays its flights again from the top, the examples under Other things it does
  // included, which otherwise wait an hour (David, 2026-09-26: "you already have the plane drawn, just use that").
  function footTrail() {
    const planesOn = !matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(max-width: 760px), (hover: none)').matches
      && (() => { try { return localStorage.getItem('annotated-planes-off') !== '1'; } catch { return true; } })();
    if (!planesOn || !PaperDeco.ART.flyTrail) return PaperDeco.make('trail');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pd pd-trail flyAgain';
    b.setAttribute('aria-label', 'Watch the page fly again'); b.title = 'Watch it fly again';
    b.innerHTML = PaperDeco.ART.flyTrail();
    b.addEventListener('click', () => {
      if (b.classList.contains('taking')) return;
      // Everything flies again, the brief's opening included, which has its own once-a-visit mark (recording of
      // 2026-09-26 at 04:06, 0:42, where only the examples below flew).
      try { localStorage.removeItem('annotated-features-flown'); ['annotated-example-shown', 'annotated-plane-seen'].forEach((k) => sessionStorage.removeItem(k)); } catch {}
      b.classList.add('taking');
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      // Straight to the top, not a glide up through every section, which took two and a half seconds (0:39).
      setTimeout(() => { scrollTo({ top: 0, behavior: 'instant' }); location.reload(); }, 700);
    });
    return b;
  }

  // The real extension, in Chrome. Nothing else on the page showed the panel the brief asks for (comparison with the
  // other entries, 2026-09-29), so 0:03 to 0:30 of the submitted demo plays here silently, in a browser frame, while
  // it is in sight. With reduced motion it is the still with controls.
  function inChrome(root) {
    const s = document.createElement('section');
    s.className = 'landChrome'; s.id = 'chrome';
    s.innerHTML = `<div class="lcCopy"><h2 class="lcH">In Chrome</h2>${typeof PaperDeco !== 'undefined' ? PaperDeco.rule() : ''}
        <p>annotated opens as a panel beside whatever you are reading. Select words, write your take, publish. This is the demo, recorded in Chrome, on a post on X.</p>
        <p><a class="heroDemo" href="https://youtu.be/VTbDJ9a-2XE" target="_blank" rel="noopener"><span class="hdPlay" aria-hidden="true"></span>Watch the whole demo <span class="num">2:44</span></a></p></div>
      <figure class="lcFrame">
        <div class="lcPrint"><video class="lcVideo" muted playsinline loop preload="none" poster="/media/panel-demo.jpg" aria-label="The annotated panel beside a post on X: words selected and marked, a take written and tagged, then published."></video></div>
        <figcaption>From the demo, recorded in Chrome.</figcaption></figure>`;
    root.appendChild(s);
    const v = s.querySelector('video');
    const src = () => { if (!v.src) v.src = '/media/panel-demo.mp4'; };
    if (still()) { v.controls = true; v.preload = 'metadata'; src(); return; }
    if (!('IntersectionObserver' in window)) { src(); v.autoplay = true; return; }
    new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { src(); v.play().catch(() => {}); } else v.pause();
    }), { threshold: 0.35 }).observe(v);
  }

  function mount(root, { signedIn = false, onSignIn = () => {}, me = null, onProfile = null } = {}) {
    try { const warm = new Image(); warm.src = '/media/artemis-i-frames.jpg'; } catch { /* no images */ }
    planesSwitch();
    root.className = 'land';
    root.innerHTML = '';
    header(root, { signedIn, onSignIn, me, onProfile });
    const main = document.createElement('main'); main.className = 'landMain'; root.appendChild(main);
    // Yours so far sits right under the try-it, so a take lands where it can be seen, and getting the extension
    // comes after (audit of 2026-09-24: on a laptop the row was below the fold and the planes flew off screen).
    hero(main);
    const l = latest(main);
    inChrome(main);
    // What else the extension does, shown working, before the steps to get it (David, 2026-09-25).
    if (typeof Features !== 'undefined') Features.mount(main);
    install(main);
    // The foot of the page ends on the desk: planes thrown in a pile, one still flying off, a sheet half folded.
    if (typeof PaperDeco !== 'undefined') {
      const desk = document.createElement('div'); desk.className = 'pdFoot';
      desk.append(PaperDeco.make('pile'), footTrail(), PaperDeco.make('sheet'));
      main.appendChild(desk);
    }
    watchInstalled(root);
    return { fillLatest: l.fill };
  }

  // Signed in, "/" is your feed. One slim line at its top keeps the try-it a click away.
  function slimLine(page) {
    const main = page.querySelector('.sitemain');
    if (!main || main.querySelector('.slimTry')) return;
    const p = document.createElement('p');
    p.className = 'slimTry';
    p.innerHTML = `${icon('highlighter')}<span>Try annotated on this page, nothing to install.</span><a class="link" href="/?try">Try it</a>`;
    main.prepend(p);
  }

  // /install, the page the footer's Get the extension opens: the same three steps as the front page, under
  // the same header. It used to be an older list of four, worded differently, with no way back but the footer.
  function mountInstall(root) {
    root.className = 'land';
    root.innerHTML = '';
    const bar = document.createElement('header');
    bar.className = 'sitebar landBar';
    bar.innerHTML = `<a class="wmBtn" href="/" aria-label="annotated home">${typeof Brand !== 'undefined' ? Brand.wordmark() : 'annotated'}</a>
      <nav class="sitenav" aria-label="Site"><a class="navBtn navFeed" href="/?feed">Feed</a><a class="navBtn" href="/">Try it first</a></nav>`;
    root.appendChild(bar);
    const main = document.createElement('main'); main.className = 'landMain installMain'; root.appendChild(main);
    const have = document.createElement('p'); have.className = 'heroHave installHave'; have.hidden = true;
    have.innerHTML = "You're set. Go to any article, video or post and press the annotated plane in your toolbar.<br><a class='link' href='/?feed'>See the feed</a>";
    main.appendChild(have);
    install(main);
    main.insertAdjacentHTML('beforeend', '<p class="note installAfter">Sign in from the panel, with Google or X, to publish annotations everyone can see.</p>');
    watchInstalled(root);
  }

  return { mount, mountInstall, slimLine, TABS };
})();

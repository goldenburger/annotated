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
  const installed = () => document.documentElement.dataset.annotatedInstalled === '1';

  function header(root, { signedIn, onSignIn }) {
    const bar = document.createElement('header');
    bar.className = 'sitebar landBar';
    bar.innerHTML = `<a class="wmBtn" href="/" aria-label="annotated home">${typeof Brand !== 'undefined' ? Brand.wordmark() : 'annotated'}</a>
      <nav class="sitenav" aria-label="Site"><a class="navBtn" href="/?feed">Feed</a>${signedIn ? '' : '<button type="button" class="navBtn webSignIn">Sign in<span class="wideOnly"> with Google</span></button>'}</nav>`;
    const s = bar.querySelector('.webSignIn');
    if (s) { s.setAttribute('aria-label', 'Sign in with Google'); s.addEventListener('click', onSignIn); }
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
        <p class="heroHave" hidden>You're set. Go to any article, video or post and press the pen in your toolbar. <a class="link" href="/?feed">What people are saying</a></p>
      </div>
      <div class="heroTry">
        <div class="tryTabs" role="tablist" aria-label="Try it on">${TABS.map((t, i) => `<button type="button" role="tab" class="tryTab" id="tab-${t.kind}" aria-controls="panel-${t.kind}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-i="${i}">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}</div>
        ${TABS.map((t, i) => `<div class="tryPanel tp-${t.kind}" role="tabpanel" id="panel-${t.kind}" aria-labelledby="tab-${t.kind}" ${i ? 'hidden' : ''}></div>`).join('')}
      </div>`;
    root.appendChild(el);
    const panels = [...el.querySelectorAll('.tryPanel')];
    const art = typeof TryIt !== 'undefined' && TryIt.mount(panels[0]);
    TABS.slice(1).forEach((t, i) => { if (typeof SceneTry !== 'undefined') SceneTry.mount(panels[i + 1], t.kind); });
    if (!art) panels[0].innerHTML = '<p class="note">Select any words on any page with the extension, and add your take.</p>';
    const cyc = cycle(el);
    // Tabs as tabs: arrows move between them, and choosing one sets the headline's word for good.
    const tabs = [...el.querySelectorAll('.tryTab')];
    const pick = (i, focus) => {
      tabs.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; panels[j].hidden = i !== j; });
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
  function install(root) {
    const box = document.createElement('section');
    box.className = 'getIt landGet'; box.id = 'get';
    box.innerHTML = `<h2 class="giH">Get it in about a minute</h2>
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
  function latest(root) {
    const box = document.createElement('section');
    box.className = 'landLatest'; box.hidden = true;
    box.innerHTML = '<div class="llHead"><h2>Yours so far</h2><p class="llNote"><span class="llUndo" role="status" hidden><span></span> <button type="button" class="link llUndoBtn">Undo</button></span> Only on this computer <button type="button" class="link llClear">Clear all</button></p></div><ul class="llRow"></ul><p class="llEmpty" hidden>All cleared. Make one above.</p><p class="llGet"><a class="link" href="#get">Get the extension to do this on any page</a></p>';
    root.appendChild(box);
    const row = box.querySelector('.llRow');
    const list = () => { const y = readYours(); return Array.isArray(y) ? y : y ? [y] : []; };
    const save = (arr) => { try { localStorage.setItem(YOURS, JSON.stringify(arr.slice(0, 4))); } catch { /* private window */ } };
    const tidy = () => {
      // Said once under the row, where every card used to say it (David, 2026-09-25), and not at all once
      // the extension is installed, or when the only card is the example, which has its own line.
      const get = box.querySelector('.llGet');
      if (get) get.hidden = installed() || !row.querySelector('.yours:not(.example)');
      while (row.children.length > 4) row.lastElementChild.remove();
      row.style.setProperty('--n', Math.max(1, row.children.length));
      box.hidden = !row.children.length;
      // While Undo is offered over an emptied row, the row says so rather than sitting blank under its heading
      // (recording of 2026-09-25 at 03:14, 2:26 to 2:34).
      const empty = box.querySelector('.llEmpty');
      if (empty) empty.hidden = !!row.children.length;
    };
    list().forEach((y) => row.appendChild(yoursCard(y)));
    tidy();
    document.addEventListener('annotated-installed', tidy);
    // Another tab's takes and removals reach this one. A front page left open showed only what was made in it,
    // one card where there were four (recording of 2026-09-25 at 03:54, 3:02).
    addEventListener('storage', (e) => {
      if (e.key !== YOURS || row.querySelector('.pl-hidden')) return;
      row.innerHTML = ''; list().forEach((y) => row.appendChild(yoursCard(y))); tidy();
    });
    // Removing: one card by its ×, or all of them. Undo puts them back for six seconds.
    const undoBar = box.querySelector('.llUndo');
    let undoTimer = 0, lastGone = null;
    const redraw = () => { row.innerHTML = ''; list().forEach((y) => row.appendChild(yoursCard(y))); tidy(); };
    const remove = (pick, said) => {
      const all = list(), gone = all.filter(pick), kept = all.filter((y) => !pick(y));
      if (!gone.length) { row.querySelectorAll('.example').forEach((x) => x.remove()); tidy(); return; }
      save(kept);
      lastGone = { all };
      redraw();
      undoBar.querySelector('span').textContent = said;
      undoBar.hidden = false; box.hidden = false;
      box.querySelector('.llEmpty').hidden = !!row.children.length;
      clearTimeout(undoTimer);
      undoTimer = setTimeout(() => { undoBar.hidden = true; lastGone = null; tidy(); }, 6000);
    };
    box.querySelector('.llUndoBtn').addEventListener('click', () => {
      if (!lastGone) return;
      save(lastGone.all);
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
      const src = { video: 'NASA, To the Moon and Back: The Journey of Artemis I', audio: 'NASA, Houston We Have a Podcast', post: 'Elon Musk on X', article: 'An example article' }[d.kind] || d.source;
      add({ kind: d.kind, take: d.take, quote: d.quote || '', what: d.what, source: src, thumb: d.thumb, wave: d.wave, a: d.a, z: d.z }, d.card);
    });
    return { fill() {} };
  }
  // "See it", wherever it is offered: to Latest on annotated, where yours is.
  document.addEventListener('click', (e) => {
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
      root.querySelectorAll('.heroGetRow, .landGet').forEach((e) => { e.hidden = true; });
      const have = root.querySelector('.heroHave'); if (!have) return;
      have.hidden = false;
      if (fresh && !have.dataset.fresh) {
        // Opened by the extension right after it was installed.
        have.dataset.fresh = '1';
        have.innerHTML = `<b>You're set.</b> Pin annotated from the puzzle piece in your toolbar, then go to any article, video or post and press the pen. <a class="link" href="/?feed">What people are saying</a>`;
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

  function mount(root, { signedIn = false, onSignIn = () => {} } = {}) {
    planesSwitch();
    root.className = 'land';
    root.innerHTML = '';
    header(root, { signedIn, onSignIn });
    const main = document.createElement('main'); main.className = 'landMain'; root.appendChild(main);
    // Yours so far sits right under the try-it, so a take lands where it can be seen, and getting the extension
    // comes after (audit of 2026-09-24: on a laptop the row was below the fold and the planes flew off screen).
    hero(main);
    const l = latest(main);
    install(main);
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
      <nav class="sitenav" aria-label="Site"><a class="navBtn" href="/">Try it first</a></nav>`;
    root.appendChild(bar);
    const main = document.createElement('main'); main.className = 'landMain installMain'; root.appendChild(main);
    const have = document.createElement('p'); have.className = 'heroHave installHave'; have.hidden = true;
    have.innerHTML = "You're set. Go to any article, video or post and press the pen in your toolbar. <a class='link' href='/?feed'>What people are saying</a>";
    main.appendChild(have);
    install(main);
    main.insertAdjacentHTML('beforeend', '<p class="note installAfter">Sign in with Google from the panel to publish annotations everyone can see.</p>');
    watchInstalled(root);
  }

  return { mount, mountInstall, slimLine, TABS };
})();

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
      <nav class="sitenav" aria-label="Site">${signedIn ? '<a class="navBtn" href="/">Your feed</a>' : '<button type="button" class="navBtn webSignIn">Sign in<span class="wideOnly"> with Google</span></button>'}</nav>`;
    const s = bar.querySelector('.webSignIn');
    if (s) { s.setAttribute('aria-label', 'Sign in with Google'); s.addEventListener('click', onSignIn); }
    root.appendChild(bar);
  }

  function hero(root) {
    const el = document.createElement('section');
    el.className = 'hero landHero'; el.id = 'try';
    el.innerHTML = `
      <div class="heroCopy">
        <p class="heroKicker">A Chrome sidebar for the open web</p>
        <h1 class="heroH" aria-label="Say what you think about anything: a passage, a clip, a podcast, or a post on X.">Say what you think about <mark class="heroMark" aria-hidden="true">anything</mark><span class="heroTail" aria-hidden="true">.</span></h1>
        <p class="heroSub">Your take on top, the source underneath, always linked back to where it came from.</p>
        <p class="heroDo heroGetRow"><a class="primary heroGet" href="#get">Get the Chrome extension</a><a class="link heroLook" href="/?feed">Look around first</a></p>
        <p class="heroHave" hidden>You have annotated. Open any article, video, podcast or post and press the pen. <a class="link" href="/?feed">See what people are annotating</a></p>
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
    const begin = () => { if (!stopped && !still()) timer = setTimeout(next, 1500); };
    document.addEventListener('annotated-tryit-demo-done', begin, { once: true });
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
      <p class="giDo"><a class="primary" href="/annotated-extension.zip" download>Download the extension</a><a class="link" href="https://github.com/goldenburger/annotated" target="_blank" rel="noopener">Open source on GitHub</a></p>`;
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
  function yoursCard(y) {
    const li = document.createElement('li');
    li.className = 'cardItem yours';
    li.innerHTML = `<a class="card mf nothumb" href="#get" aria-label="Your annotation. It is only on this computer; get the extension to publish it.">
      <span class="cbody"><span class="cmeta">You <span class="dotsep"></span> <span class="localTag">Only on this computer</span></span>
      <span class="ctake"></span><span class="yMedia"></span>
      <span class="csource"><span><span class="cst"></span><span class="csn"></span></span></span>
      <span class="yGet">Get the extension to publish it</span></span></a>`;
    li.querySelector('.dotsep').textContent = ago(y.at || Date.now());
    li.querySelector('.ctake').textContent = y.take || '';
    li.querySelector('.cst').textContent = y.source || '';
    li.querySelector('.csn').textContent = y.quote ? `“${y.quote}”` : (y.what || '');
    const m = li.querySelector('.yMedia');
    if (y.thumb && /^\/media\//.test(y.thumb.src)) {
      // A frame of the clip, cut from the video's own sprite of frames.
      const t = y.thumb, col = t.idx % t.cols, row = Math.floor(t.idx / t.cols);
      const e = document.createElement('span'); e.className = 'yThumb';
      e.style.backgroundImage = `url("${t.src}")`;
      e.style.backgroundSize = `${t.cols * 100}% ${t.rows * 100}%`;
      e.style.backgroundPosition = `${t.cols > 1 ? (col / (t.cols - 1)) * 100 : 0}% ${t.rows > 1 ? (row / (t.rows - 1)) * 100 : 0}%`;
      m.appendChild(e);
    } else if (Array.isArray(y.wave)) {
      const e = document.createElement('span'); e.className = 'yWave';
      y.wave.slice(0, 40).forEach((v) => { const i = document.createElement('i'); i.style.height = Math.round(Math.max(.1, Math.min(1, +v || 0)) * 100) + '%'; e.appendChild(i); });
      m.appendChild(e);
    }
    return li;
  }
  function latest(root) {
    const box = document.createElement('section');
    box.className = 'landLatest'; box.hidden = true;
    box.innerHTML = '<div class="llHead"><h2>Latest on annotated</h2><a class="link" href="/?feed">See everything</a></div><ul class="llRow"></ul>';
    root.appendChild(box);
    const row = box.querySelector('.llRow');
    let shared = [], yours = null;
    const draw = () => {
      const lis = (yours ? [yours] : []).concat(shared).slice(0, 4);
      [...row.children].forEach((li) => { if (!lis.includes(li)) li.remove(); });
      lis.forEach((li, i) => { if (row.children[i] !== li) row.insertBefore(li, row.children[i] || null); });
      row.style.setProperty('--n', row.children.length);
      box.hidden = !yours && shared.length < 3;
    };
    // origin: what it was made from, for anything that wants to show it travelling here.
    const setYours = (y, fresh, origin) => {
      if (!y) return;
      yours = yoursCard(y);
      draw();
      document.dispatchEvent(new CustomEvent('annotated-yours-drawn', { detail: { card: yours.firstElementChild, li: yours, fresh, origin, kind: y.kind } }));
    };
    setYours(readYours(), false, null);
    const keep = (y, origin) => { y.at = Date.now(); try { localStorage.setItem(YOURS, JSON.stringify(y)); } catch { /* private window */ } setYours(y, true, origin); };
    document.addEventListener('annotated-tryit-made', () => {
      let t = null; try { t = JSON.parse(localStorage.getItem('annotated-tryit') || 'null'); } catch {}
      if (t) keep({ kind: 'article', take: t.take, quote: t.quote, source: 'The annotated.com brief' }, document.querySelector('.tp-article .tiTilt > .tiPaper'));
    });
    document.addEventListener('annotated-scene-made', (e) => {
      const d = e.detail || {};
      const src = { video: 'NASA, To the Moon and Back: The Journey of Artemis I', audio: 'NASA, Houston We Have a Podcast', post: 'An example post on X', article: 'An example article' }[d.kind] || d.source;
      keep({ kind: d.kind, take: d.take, quote: d.quote || '', what: d.what, source: src, thumb: d.thumb, wave: d.wave }, d.card);
    });
    return {
      fill(records, onOpen) {
        const list = (records || []).filter((r) => r.cloud || r.author).sort((a, b) => b.created - a.created).slice(0, 4);
        if (typeof AnnotationPage === 'undefined') return;
        const tmp = document.createElement('div');
        if (list.length) AnnotationPage.renderFeed(tmp, { records: list, mode: 'home', social: null, siteNav: false, onOpen, onHome() {}, onAll() {}, onProfile() {}, onTag() {} });
        shared = [...tmp.querySelectorAll('.cards > .cardItem')];
        draw();
      },
    };
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
    const apply = () => {
      if (!installed()) return;
      root.querySelectorAll('.heroGetRow, .landGet').forEach((e) => { e.hidden = true; });
      const have = root.querySelector('.heroHave'); if (have) have.hidden = false;
    };
    apply();
    document.addEventListener('annotated-installed', apply);
    new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-annotated-installed'] });
  }

  function mount(root, { signedIn = false, onSignIn = () => {} } = {}) {
    root.className = 'land';
    root.innerHTML = '';
    header(root, { signedIn, onSignIn });
    const main = document.createElement('main'); main.className = 'landMain'; root.appendChild(main);
    hero(main);
    install(main);
    const l = latest(main);
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
    have.innerHTML = 'You have annotated already. Open any article, video, podcast or post and press the pen. <a class="link" href="/?feed">See what people are annotating</a>';
    main.appendChild(have);
    install(main);
    main.insertAdjacentHTML('beforeend', '<p class="note installAfter">Sign in with Google from the panel to publish annotations everyone can see.</p>');
    watchInstalled(root);
  }

  return { mount, mountInstall, slimLine, TABS };
})();

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
        <h1 class="heroH" aria-label="Say what you think about anything on the web: a passage, a clip, a podcast, or a post on X.">Say what you think about <mark class="heroMark" aria-hidden="true">anything</mark><span class="heroTail" aria-hidden="true"> on the web</span></h1>
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
    const h = hero.querySelector('.heroH'), mark = hero.querySelector('.heroMark'), tail = hero.querySelector('.heroTail');
    let tallest = 0;
    for (const w of WORDS) { mark.textContent = w; tail.hidden = w !== 'anything'; tallest = Math.max(tallest, h.offsetHeight); }
    mark.textContent = 'anything'; tail.hidden = false; h.style.minHeight = tallest + 'px';
    let i = 0, rounds = 0, timer = null, stopped = false;
    const show = (w) => { mark.textContent = w; tail.hidden = w !== 'anything'; mark.classList.remove('lifting', 'drawn'); void mark.offsetWidth; mark.classList.add('redraw'); };
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

  // The four newest published annotations, drawn with the feed's own cards. Hidden until they arrive, and
  // for good with fewer than three, so a quiet week or no database is simply no row.
  function latest(root) {
    const box = document.createElement('section');
    box.className = 'landLatest'; box.hidden = true;
    box.innerHTML = '<div class="llHead"><h2>Latest on annotated</h2><a class="link" href="/?feed">See everything</a></div><ul class="llRow"></ul>';
    root.appendChild(box);
    return {
      fill(records, onOpen) {
        const shared = (records || []).filter((r) => r.cloud || r.author).sort((a, b) => b.created - a.created).slice(0, 4);
        if (shared.length < 3 || typeof AnnotationPage === 'undefined') return;
        const tmp = document.createElement('div');
        AnnotationPage.renderFeed(tmp, { records: shared, mode: 'home', social: null, siteNav: false, onOpen, onHome() {}, onAll() {}, onProfile() {}, onTag() {} });
        const row = box.querySelector('.llRow');
        tmp.querySelectorAll('.cards > .cardItem').forEach((li) => row.appendChild(li));
        box.hidden = !row.children.length;
      },
    };
  }

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

  return { mount, slimLine, TABS };
})();

// The front page. Everything else on this site is a list of annotations, which is the wrong first thing to
// show someone who has never seen one. This is the promise, the pen actually drawing, and a short loop of
// the panel taking a passage and turning it into a page.
var Hero = (() => {
  // The loop runs on classes rather than one long keyframe chain, so a step can be read and changed on its
  // own. Each entry is how long that step holds.
  const STEPS = [
    ['rest', 900],      // the page as you found it
    ['picked', 900],    // words selected
    ['offered', 1100],  // Annotate, beside them
    ['inked', 1500],    // the pen crosses them
    ['taking', 2600],   // the panel, with your take going in
    ['done', 3000],     // it has a page of its own
  ];
  const TAKE = 'Two point four million for six months of buses, and the grant covers most of it.';

  function build() {
    const el = document.createElement('div');
    el.className = 'heroShow';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="show rest">
        <div class="showPage">
          <div class="showBar"><span class="showDot"></span><span class="showDot"></span><span class="showDot"></span><span class="showUrl">harborline.example</span></div>
          <div class="showBody">
            <p class="showH">Council backs overnight buses for six months</p>
            <p class="showP"><mark class="showMark">The trial will cost $2.4 million over six months, paid mostly from a state transport grant.</mark></p>
            <p class="showP">The council met on a Tuesday, and every member arrived on time for once. The clerk noted the attendance in the minutes with some surprise.</p>
            <p class="showP">A second reading is expected before the end of the month, once the transport committee has seen the figures.</p>
            <p class="showP">Drivers will be recruited over the winter.</p>
          </div>
          <span class="showBtn"><i></i>Annotate</span>
        </div>
        <aside class="showPanel">
          <div class="showPanelHead"><span class="showWm">annotated</span></div>
          <div class="showSteps"><span class="on">Capture</span><span class="two">Take</span><span class="three">Publish</span></div>
          <p class="showK">Quoting</p>
          <blockquote class="showQuote">The trial will cost $2.4 million over six months, paid mostly from a state transport grant.</blockquote>
          <p class="showK showK2">Your take</p>
          <div class="showTake"><span class="showTyped"></span><span class="showCaret"></span></div>
          <div class="showPub"><span class="showTick">✓</span><div><b>Published</b><span>It has a page of its own now.</span></div></div>
        </aside>
      </div>`;
    return el;
  }

  function run(el) {
    const show = el.querySelector('.show');
    const typed = el.querySelector('.showTyped');
    const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Nothing moves for anyone who asked for that. The last step is the one worth seeing, so it is the one
    // that stays.
    if (slow) { show.className = 'show done'; typed.textContent = TAKE; return () => {}; }
    let i = 0, timer = null, typer = null, stopped = false;
    const type = () => {
      let n = 0;
      clearInterval(typer);
      typer = setInterval(() => {
        n += 1;
        typed.textContent = TAKE.slice(0, n);
        if (n >= TAKE.length) clearInterval(typer);
      }, 26);
    };
    const step = () => {
      if (stopped) return;
      const [name, hold] = STEPS[i];
      show.className = 'show ' + name;
      if (name === 'rest') typed.textContent = '';
      if (name === 'taking') type();
      i = (i + 1) % STEPS.length;
      timer = setTimeout(step, hold);
    };
    step();
    return () => { stopped = true; clearTimeout(timer); clearInterval(typer); };
  }

  // The headline says what annotated takes, one kind at a time. The pen lifts off the word, it changes while
  // the ink is off, and the pen draws under the new one. Two rounds and it rests on anything, and it stops the
  // moment someone starts using the try-it, so it never competes with their own marking. The headline is
  // held at its tallest, so the words under it never jump.
  const WORDS = ['anything', 'a passage', 'a clip', 'a podcast', 'a post on X'];
  function cycle(hero) {
    const h = hero.querySelector('.heroH'), mark = hero.querySelector('.heroMark'), tail = hero.querySelector('.heroTail');
    if (!h || !mark || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let tallest = 0;
    for (const w of WORDS) { mark.textContent = w; tail.hidden = w !== 'anything'; tallest = Math.max(tallest, h.offsetHeight); }
    mark.textContent = 'anything'; tail.hidden = false;
    h.style.minHeight = tallest + 'px';
    let i = 0, rounds = 0, timer = null, stopped = false;
    const stop = () => { stopped = true; clearTimeout(timer); mark.classList.remove('lifting'); mark.textContent = 'anything'; tail.hidden = false; mark.classList.add('drawn'); };
    const next = () => {
      if (stopped) return;
      mark.classList.remove('redraw', 'drawn'); mark.classList.add('lifting');
      timer = setTimeout(() => {
        if (stopped) return;
        i = (i + 1) % WORDS.length;
        if (i === 0) rounds += 1;
        mark.textContent = WORDS[i];
        tail.hidden = WORDS[i] !== 'anything';
        mark.classList.remove('lifting', 'drawn'); void mark.offsetWidth; mark.classList.add('redraw');
        if (rounds >= 2 && i === 0) { stopped = true; return; }
        timer = setTimeout(next, 4000);
      }, 320);
    };
    timer = setTimeout(next, 4200);
    document.addEventListener('annotated-tryit-touched', stop, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stop(); });
  }

  // The band under the site's own header, above the list. It is only for someone who has not signed in and
  // is looking at the home page, because everyone else came here for the annotations.
  function mount(page, { onLook }) {
    const grid = page.querySelector('.sitegrid');
    if (!grid || page.querySelector('.hero')) return;
    const hero = document.createElement('section');
    hero.className = 'hero'; hero.id = 'try';
    hero.innerHTML = `
      <div class="heroCopy">
        <p class="heroKicker">A Chrome sidebar for the open web</p>
        <h1 class="heroH" aria-label="Say what you think about anything on the web: a passage, a clip, a podcast, or a post on X.">Say what you think about <mark class="heroMark" aria-hidden="true">anything</mark><span class="heroTail" aria-hidden="true"> on the web</span></h1>
        <p class="heroSub">Mark a passage in an article, clip a moment out of a video or a podcast, or keep a post from X.
          Add your take and it becomes a page with your take on top and the source underneath, linking back to where it came from.</p>
        <p class="heroDo"><a class="primary heroGet" href="/annotated-extension.zip" download>Get the Chrome extension</a>
          <button type="button" class="link heroLook">Look around first</button></p>
        <p class="note heroWhere">Any article, YouTube, most podcasts, and posts on X.</p>
      </div>`;
    // The visitor makes an annotation right here, with the extension's own pen. The scripted loop of a
    // made-up article is the fallback, for a page where the shared highlighter did not load.
    grid.parentNode.insertBefore(hero, grid);
    const side = document.createElement('div'); side.className = 'heroTry';
    hero.appendChild(side);
    const tried = typeof TryIt !== 'undefined' && TryIt.mount(side);
    cycle(hero);
    if (!tried) { side.remove(); hero.appendChild(build()); }
    const stop = tried ? () => {} : run(hero);
    hero.querySelector('.heroLook').addEventListener('click', () => {
      onLook && onLook();
      grid.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    // The loop costs nothing once it is off screen, and a tab nobody is looking at should not run it either.
    const io = new IntersectionObserver((rows) => rows.forEach((r) => { if (!r.isIntersecting) stop(); }), { threshold: 0 });
    io.observe(hero);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stop(); }, { once: true });
  }

  // The four kinds, told by scrolling. Each scene is drawn in the pen's own lines and plays as it scrolls into
  // view (CSS scroll-driven animations, so scrolling back rewinds it and nothing runs off screen). Each ends on
  // a card: the newest real published annotation of that kind when there is one, the feed's own card, and
  // otherwise a card plainly labelled Example that goes nowhere.
  const SCENES = [
    { kind: 'article', label: 'A passage', line: 'Mark any words on any page.', ex: 'This is the sentence the whole piece hangs on.', exSrc: 'An article', art: () => {
      const lines = [30, 48, 66, 84, 102, 120, 138, 156].map((y, i) => `<rect x="${i === 3 ? 44 : 40}" y="${y}" width="${[220, 236, 210, 228, 232, 200, 224, 150][i]}" height="7" rx="3.5" class="ln"/>`).join('');
      return `<svg viewBox="0 0 320 200" class="scSvg"><rect x="24" y="14" width="272" height="172" rx="6" class="pg"/>${lines}
        <rect x="42" y="81" width="230" height="13" rx="4" class="a-hl hl"/><rect x="40" y="84" width="228" height="7" rx="3.5" class="ln ink"/>
        <g class="a-lift"><rect x="150" y="40" width="150" height="46" rx="7" class="card"/><rect x="162" y="52" width="110" height="6" rx="3" class="ln dark"/><rect x="162" y="66" width="80" height="6" rx="3" class="ln"/></g></svg>`; } },
    { kind: 'video', label: 'A YouTube clip', line: 'Drag out up to 90 seconds.', ex: 'Watch his face at 0:42. That is the real answer.', exSrc: 'A YouTube video', art: () => {
      const frames = [...Array(8)].map((_, i) => `<rect x="${24 + i * 34}" y="70" width="32" height="54" rx="3" class="fr"/><rect x="${30 + i * 34}" y="84" width="20" height="14" rx="2" class="frl"/>`).join('');
      return `<svg viewBox="0 0 320 200" class="scSvg">${frames}<rect x="24" y="70" width="272" height="54" rx="3" class="filmEdge"/>
        <rect x="92" y="66" width="136" height="62" rx="4" class="v-sel hl"/>
        <g class="v-hl"><rect x="86" y="60" width="6" height="74" rx="3" class="handle"/></g><g class="v-hr"><rect x="228" y="60" width="6" height="74" rx="3" class="handle"/></g>
        <g class="v-badge"><rect x="128" y="146" width="64" height="26" rx="13" class="badge"/><text x="160" y="164" class="badgeT">0:42</text></g></svg>`; } },
    { kind: 'audio', label: 'A podcast moment', line: 'Clip a podcast, even from Spotify.', ex: 'Here is where the guest finally gives a number.', exSrc: 'A podcast episode', art: () => {
      const hs = [18, 30, 22, 44, 36, 52, 28, 40, 60, 34, 48, 26, 56, 42, 30, 50, 38, 24, 46, 32, 54, 28, 40, 22, 36, 18, 30, 44];
      const bars = hs.map((h, i) => `<rect x="${30 + i * 9.5}" y="${100 - h / 2}" width="5" height="${h}" rx="2.5" class="bar p-bar" style="--i:${i}"/>`).join('');
      return `<svg viewBox="0 0 320 200" class="scSvg"><defs><clipPath id="podSel"><rect x="115" y="60" width="95" height="80" class="p-clip"/></clipPath></defs>${bars}
        <g clip-path="url(#podSel)">${hs.map((h, i) => `<rect x="${30 + i * 9.5}" y="${100 - h / 2}" width="5" height="${h}" rx="2.5" class="bar on"/>`).join('')}</g>
        <g class="p-lift"><rect x="108" y="150" width="104" height="28" rx="14" class="badge"/><path d="M126 158l10 6-10 6z" class="play"/><text x="170" y="169" class="badgeT">0:20</text></g>
        <text x="160" y="32" class="svc">Spotify · Apple Podcasts · YouTube</text></svg>`; } },
    { kind: 'post', label: 'A post on X', line: 'Keep a post, or just the words you mean.', ex: 'Two words in this post change what it means.', exSrc: 'A post on X', art: () => `<svg viewBox="0 0 320 200" class="scSvg">
        <rect x="60" y="34" width="200" height="132" rx="12" class="card"/><circle cx="84" cy="58" r="11" class="av"/><rect x="102" y="50" width="70" height="7" rx="3.5" class="ln dark"/><rect x="102" y="62" width="46" height="6" rx="3" class="ln"/>
        <rect x="76" y="84" width="168" height="7" rx="3.5" class="ln"/><rect x="74" y="99" width="120" height="13" rx="4" class="x-hl hl"/><rect x="76" y="102" width="150" height="7" rx="3.5" class="ln ink"/><rect x="76" y="120" width="130" height="7" rx="3.5" class="ln"/>
        <g class="x-shut"><path d="M52 44v-18h18M268 44v-18h-18M52 156v18h18M268 156v18h-18" class="corner"/></g></svg>` },
  ];
  function scenes(page, { records, onOpen }) {
    const grid = page.querySelector('.sitegrid');
    if (!grid || page.querySelector('.scenes') || typeof AnnotationPage === 'undefined') return;
    const shared = (records || []).filter((r) => r.cloud || r.author).sort((a, b) => b.created - a.created);
    const picks = SCENES.map((s) => shared.find((r) => r.item && r.item.kind === s.kind) || null);
    // The feed draws the real cards, clicks, sound and previews included, and they are moved into the scenes.
    const tmp = document.createElement('div');
    const real = picks.filter(Boolean);
    if (real.length) AnnotationPage.renderFeed(tmp, { records: real, mode: 'home', social: null, siteNav: false, onOpen, onHome() {}, onAll() {}, onProfile() {}, onTag() {} });
    const box = document.createElement('section');
    box.className = 'scenes';
    box.setAttribute('aria-label', 'What annotated takes');
    box.innerHTML = `<div class="scHead"><h2 class="drawLine">Articles, YouTube, podcasts and posts on X</h2>
      <p class="note">One pen for all four. Every annotation links back to where it came from.</p></div>
      ${SCENES.map((s, i) => `<div class="scene sc-${s.kind}${i % 2 ? ' flip' : ''}">
        <div class="scArt" aria-hidden="true">${s.art()}</div>
        <div class="scText"><p class="scKind">${s.label}</p><h3>${s.line}</h3><div class="scCard"></div></div></div>`).join('')}`;
    SCENES.forEach((s, i) => {
      const slot = box.querySelectorAll('.scCard')[i];
      const li = picks[i] && [...tmp.querySelectorAll('.cards > .cardItem')].find((c) => { const k = c.querySelector('.card'); return k && k.dataset.id === picks[i].id; });
      if (li) { slot.appendChild(li); slot.classList.add('real'); return; }
      slot.innerHTML = `<div class="exCard"><p class="tiExample">Example</p><p class="exTake"></p><p class="exSrc">${Brand.icon(s.kind === 'video' ? 'clip' : s.kind === 'audio' ? 'podcast' : s.kind === 'post' ? 'post' : 'article')} <span></span></p></div>`;
      slot.querySelector('.exTake').textContent = s.ex;
      slot.querySelector('.exSrc span').textContent = s.exSrc;
    });
    grid.parentNode.insertBefore(box, grid);
  }

  // How to get it, said plainly, under the examples. Until the Chrome Web Store listing is live it is three
  // steps with the zip, and one button used to leave people guessing what came after the download.
  function install(page) {
    const grid = page.querySelector('.sitegrid');
    if (!grid || page.querySelector('.getIt')) return;
    const box = document.createElement('section');
    box.className = 'getIt'; box.id = 'get';
    box.innerHTML = `<div class="giCopy"><h2 class="drawLine">Get it in about a minute</h2>
        <p class="note">It is a Chrome extension. It is not in the Chrome Web Store yet, so it installs from a file, and the source is open on GitHub.</p></div>
      <ol class="giSteps">
        <li><b>Download it</b><span><a href="/annotated-extension.zip" download>annotated-extension.zip</a>, then unzip it.</span></li>
        <li><b>Turn on Developer mode</b><span>Open <code>chrome://extensions</code> and flip the switch at the top right.</span></li>
        <li><b>Load it</b><span>Click Load unpacked, choose the unzipped folder, and pin annotated from the puzzle piece.</span></li>
      </ol>
      <p class="giDo"><a class="primary" href="/annotated-extension.zip" download>Download the extension</a><a class="link" href="https://github.com/goldenburger/annotated" target="_blank" rel="noopener">See the source</a></p>`;
    grid.parentNode.insertBefore(box, grid);
  }

  // The site still calls it showcase.
  return { mount, showcase: scenes, scenes, install };
})();

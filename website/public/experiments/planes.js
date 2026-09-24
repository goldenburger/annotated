// EXPERIMENT: paper airplanes on the front page. To remove it, delete website/public/experiments and the one
// <script src="/experiments/planes.js"> line in index.html. Nothing else depends on it.
//   The brief arrives as a paper plane that glides in, lands where the paper sits and unfolds into it.
//   A take, once made, folds into a plane and flies down to Latest on annotated, where it lands as a card.
//   A tab chosen sends a small, quick plane carrying it in.
// Rules: the try-it works from the first moment and the planes never take a click; a click, a key or a scroll
// finishes the landing at once; it plays once a visit; reduced motion and phones get none. Browsers driven
// by tests get none unless the address carries ?planes, so the rest of the tests see the page as it is
// without them. ?noplanes shows the page without them, for comparing.
(() => {
  const q = new URLSearchParams(location.search);
  const forced = q.has('planes');
  const off = q.has('noplanes') || (navigator.webdriver && !forced)
    || matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 760px), (hover: none)').matches;
  if (off || location.pathname !== '/') return;
  let seen = false;
  try { seen = sessionStorage.getItem('annotated-plane-seen') === '1'; } catch { /* no storage */ }

  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/experiments/planes.css';
  document.head.appendChild(css);
  const root = document.documentElement;
  // The rule that holds the paper back goes in at once, since planes.css arrives a moment after the paper does.
  const hold = document.createElement('style');
  hold.textContent = '.planes-waiting .tp-article .tiStage { opacity: 0; }';
  document.head.appendChild(hold);
  if (!seen) root.classList.add('planes-waiting');
  // Whatever happens, the paper is never kept out of sight for long.
  const safety = setTimeout(() => root.classList.remove('planes-waiting'), 4000);

  // A paper dart in real 3D: two wings with a slight dihedral and a keel under them, folded from one sheet.
  function makePlane(size = 120) {
    const w = document.createElement('div');
    w.className = 'pl-fly';
    w.innerHTML = `<div class="pl-shadow"></div><div class="pl-plane" style="--s:${size}px">
      <i class="pl-face pl-wl"></i><i class="pl-face pl-wr"></i><i class="pl-face pl-kl"></i><i class="pl-face pl-kr"></i></div>`;
    document.body.appendChild(w);
    return w;
  }
  const centreOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };

  // ---- the landing, and the unfold into the brief.
  function landing() {
    const paper = document.querySelector('.tp-article .tiPaper');
    if (!paper) { root.classList.remove('planes-waiting'); return; }
    const to = centreOf(paper);
    const from = { x: innerWidth + 140, y: -60 };
    const fly = makePlane(150);
    const plane = fly.querySelector('.pl-plane'), shadow = fly.querySelector('.pl-shadow');
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(safety);
      fly.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      fly.remove();
      root.classList.remove('planes-waiting');
      paper.classList.add('pl-creased');
      setTimeout(() => paper.classList.remove('pl-creased'), 1400);
      try { sessionStorage.setItem('annotated-plane-seen', '1'); } catch { /* no storage */ }
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((e) => removeEventListener(e, finish, true));
      document.dispatchEvent(new CustomEvent('annotated-plane-landed'));
    };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((e) => addEventListener(e, finish, true));
    // The glide: in from the top right, one bank, a flare, and down onto the paper's spot.
    const mid = { x: (from.x + to.x) / 2 + 60, y: to.y - 160 };
    const path = fly.animate([
      { transform: `translate3d(${from.x}px, ${from.y}px, 0) rotateZ(200deg) scale(.9)` },
      { transform: `translate3d(${mid.x}px, ${mid.y}px, 0) rotateZ(165deg) scale(1)`, offset: .55 },
      { transform: `translate3d(${to.x}px, ${to.y - 18}px, 0) rotateZ(178deg) scale(1)`, offset: .9 },
      { transform: `translate3d(${to.x}px, ${to.y}px, 0) rotateZ(180deg) scale(1)` },
    ], { duration: 1150, easing: 'cubic-bezier(.3, .1, .3, 1)', fill: 'forwards' });
    plane.animate([
      { transform: 'rotateX(48deg) rotateY(-30deg)' },
      { transform: 'rotateX(40deg) rotateY(26deg)', offset: .55 },
      { transform: 'rotateX(58deg) rotateY(0deg)' },
    ], { duration: 1150, easing: 'ease-in-out', fill: 'forwards' });
    shadow.animate([{ opacity: 0, transform: 'translate(40px, 120px) scale(.6)' }, { opacity: .45, transform: 'translate(10px, 26px) scale(1)' }],
      { duration: 1150, easing: 'ease-in', fill: 'forwards' });
    path.finished.then(() => {
      if (done) return;
      // Unfold: the wings and the keel open flat, the sheet grows to the paper's size, and becomes it.
      const k = to.w / 150;
      fly.animate([{ transform: `translate3d(${to.x}px, ${to.y}px, 0) rotateZ(180deg) scale(1)` },
        { transform: `translate3d(${to.x}px, ${to.y}px, 0) rotateZ(182deg) scale(${k.toFixed(2)}, ${(to.h / 150).toFixed(2)})` }],
        { duration: 650, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'forwards' });
      plane.classList.add('pl-open');
      plane.animate([{ transform: 'rotateX(58deg)' }, { transform: 'rotateX(0deg)' }], { duration: 650, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'forwards' });
      shadow.animate([{ opacity: .45 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
      setTimeout(() => {
        root.classList.remove('planes-waiting');
        fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished.then(finish);
      }, 520);
    });
  }

  // ---- a take folds into a plane and flies down to the latest annotations, landing there as a card.
  function sendTake() {
    const card = document.querySelector('.tiLift:not([hidden])');
    if (!card) return;
    const from = centreOf(card);
    const latest = document.querySelector('.landLatest:not([hidden]) .llRow');
    const target = latest ? centreOf(latest.firstElementChild || latest) : { x: innerWidth + 120, y: -80 };
    const fly = makePlane(70); fly.classList.add('pl-small');
    const up = { x: (from.x + target.x) / 2, y: Math.min(from.y, target.y) - 120 };
    fly.animate([
      { transform: `translate3d(${from.x}px, ${from.y}px, 0) rotateZ(160deg) scale(.4)`, opacity: 0 },
      { transform: `translate3d(${from.x}px, ${from.y - 20}px, 0) rotateZ(160deg) scale(1)`, opacity: 1, offset: .15 },
      { transform: `translate3d(${up.x}px, ${up.y}px, 0) rotateZ(${target.y > from.y ? 120 : 200}deg) scale(1)`, offset: .55 },
      { transform: `translate3d(${target.x}px, ${target.y}px, 0) rotateZ(${target.y > from.y ? 95 : 220}deg) scale(.7)`, opacity: latest ? 1 : 0 },
    ], { duration: 1300, easing: 'cubic-bezier(.4, .1, .3, 1)', fill: 'forwards' }).finished.then(() => {
      fly.remove();
      if (!latest) return;
      // Scrolled away, the landing would be out of sight, and a card appearing unseen is no landing at all.
      const take = (card.querySelector('.tiTakeOut') || {}).textContent || '';
      const quote = (card.querySelector('.tiInk') || {}).textContent || '';
      latest.querySelectorAll('.pl-yours').forEach((x) => x.remove());
      const li = document.createElement('li');
      li.className = 'cardItem pl-yours';
      li.innerHTML = '<div class="card mf nothumb"><span class="cbody"><span class="cmeta">You <span class="dotsep">just now</span> <span class="localTag">Yours, on this computer</span></span><span class="ctake"></span><span class="csource"><span><span class="cst">The annotated.com brief</span><span class="csn"></span></span></span></span></div>';
      li.querySelector('.ctake').textContent = take;
      li.querySelector('.csn').textContent = quote;
      latest.prepend(li);
      latest.style.setProperty('--n', Math.min(4, latest.children.length));
      if (latest.children.length > 4) latest.lastElementChild.remove();
    });
  }

  // ---- a tab chosen: a small plane carries it in, in half a second.
  function carryTab(tab) {
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    if (!panel) return;
    const from = centreOf(tab), to = centreOf(panel);
    const fly = makePlane(46); fly.classList.add('pl-small');
    fly.animate([
      { transform: `translate3d(${from.x}px, ${from.y}px, 0) rotateZ(100deg) scale(.6)`, opacity: 0 },
      { transform: `translate3d(${(from.x + to.x) / 2 + 40}px, ${from.y + 30}px, 0) rotateZ(120deg) scale(1)`, opacity: 1, offset: .4 },
      { transform: `translate3d(${to.x}px, ${to.y}px, 0) rotateZ(95deg) scale(.8)`, opacity: 0 },
    ], { duration: 500, easing: 'ease-out', fill: 'forwards' }).finished.then(() => fly.remove());
  }

  const start = () => {
    const paper = document.querySelector('.tp-article .tiPaper');
    if (!paper) return false;
    if (!seen) setTimeout(landing, 120); else root.classList.remove('planes-waiting');
    document.addEventListener('annotated-tryit-made', () => setTimeout(sendTake, 700));
    document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('.tryTab'); if (t && t.getAttribute('aria-selected') === 'true') carryTab(t); });
    return true;
  };
  // The front page is drawn by site.js a moment after this runs.
  let tries = 0;
  const wait = () => { if (start()) return; if (++tries < 120) requestAnimationFrame(wait); else root.classList.remove('planes-waiting'); };
  wait();
})();

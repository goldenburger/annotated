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
  hold.textContent = '.planes-waiting .tp-article .tiTilt > .tiPaper { opacity: 0; }';
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
      if (sheetEl) sheetEl.forEach((e) => e.remove());
      root.classList.remove('planes-waiting');
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
      shadow.animate([{ opacity: .45 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
      fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
      const sheet = unfold(paper);
      sheetEl = sheet.el;
      sheet.done.then(() => { if (!done) finish(); });
    });
  }

  // The unfold. A dart is a sheet with its two nose corners folded to the centre crease and then folded in half,
  // so it opens in that order backwards: the halves open about the crease, then each corner flips back out.
  // It is built inside the paper's own tilt at the paper's own size, carrying a copy of the brief, so the sheet
  // that opens is the page, and the real one takes over without a jump.
  let sheetEl = null;
  function unfold(paper) {
    const tilt = paper.parentElement;
    const W = paper.offsetWidth, H = paper.offsetHeight, a = Math.min(H / 2, W / 2);
    const make = (cls, css = '') => { const e = document.createElement('div'); e.className = cls; e.style.cssText = css; return e; };
    const P = (pts) => 'polygon(' + pts.map(([x, y]) => `${x}px ${y}px`).join(', ') + ')';
    const copy = () => {
      const c = paper.cloneNode(true);
      c.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
      c.querySelectorAll('[data-annotated-self]').forEach((x) => x.removeAttribute('data-annotated-self'));
      c.setAttribute('aria-hidden', 'true'); c.inert = true;
      return c;
    };
    // A leaf is one flat piece of the sheet: printed (the brief) or the blank back of a flap.
    const leaf = (pts, printed, css = '') => {
      const f = make('pl-leaf' + (printed ? '' : ' pl-blank'), css);
      f.style.clipPath = P(pts);
      if (printed) f.appendChild(copy());
      f.appendChild(make('pl-shade'));
      return f;
    };
    const box = `left:${paper.offsetLeft}px;top:${paper.offsetTop}px;width:${W}px;height:${H}px`;
    const under = make('pl-sheetShadow', box);
    const sheet = make('pl-sheet', box);
    // The top half turns about the crease at H / 2, and its corner flap about the line from (a, 0) to (0, a).
    const top = make('pl-group', `transform-origin: 0 ${H / 2}px`);
    top.appendChild(leaf([[a, 0], [W, 0], [W, H / 2], [0, H / 2], [0, a]], true));
    const topFlap = make('pl-group', `transform-origin: ${a / 2}px ${a / 2}px`);
    topFlap.appendChild(leaf([[0, 0], [a, 0], [0, a]], true, 'backface-visibility: hidden'));
    // Its back: the same triangle turned over about its own line of symmetry, so it sits in the same place.
    topFlap.appendChild(leaf([[0, 0], [a, 0], [0, a]], false, 'backface-visibility: hidden; transform-origin: 0 0; transform: rotate3d(1, 1, 0, 180deg)'));
    top.appendChild(topFlap);
    const bot = make('pl-group', `transform-origin: 0 ${H / 2}px`);
    bot.appendChild(leaf([[0, H / 2], [W, H / 2], [W, H], [a, H], [0, H - a]], true));
    const botFlap = make('pl-group', `transform-origin: ${a / 2}px ${H - a / 2}px`);
    botFlap.appendChild(leaf([[0, H - a], [0, H], [a, H]], true, 'backface-visibility: hidden'));
    botFlap.appendChild(leaf([[0, H - a], [0, H], [a, H]], false, `backface-visibility: hidden; transform-origin: 0 ${H}px; transform: rotate3d(1, -1, 0, 180deg)`));
    bot.appendChild(botFlap);
    sheet.append(top, bot);
    tilt.insertBefore(under, paper); tilt.append(sheet);
    const wrap = { el: [under, sheet] };

    const ease = 'cubic-bezier(.25, .8, .25, 1)';
    const T = 1250;
    const k = (o, t) => Object.assign({ offset: o }, t);
    // Held small and folded where the dart landed, then it comes up to the paper's size as it opens.
    const s0 = Math.min(.5, 170 / W);
    sheet.animate([k(0, { transform: `scale(${s0})` }), k(.42, { transform: 'scale(1)' }), k(1, { transform: 'scale(1)' })], { duration: T, easing: 'ease-out', fill: 'forwards' });
    under.animate([k(0, { opacity: 0, transform: `translateY(14px) scale(${s0})` }), k(.42, { opacity: .6, transform: 'translateY(14px) scale(1)' }), k(1, { opacity: 1, transform: 'translateY(14px) scale(1)' })], { duration: T, fill: 'forwards' });
    // The halves open like a book laid flat: nearly upright, a hair past flat, and back.
    const halves = (sign) => [k(0, { transform: `rotateX(${sign * 74}deg)` }), k(.18, { transform: `rotateX(${sign * 62}deg)` }),
      k(.46, { transform: `rotateX(${sign * -3}deg)` }), k(.56, { transform: 'rotateX(0deg)' }), k(1, { transform: 'rotateX(0deg)' })];
    top.animate(halves(-1), { duration: T, easing: ease, fill: 'forwards' });
    bot.animate(halves(1), { duration: T, easing: ease, fill: 'forwards' });
    // Then the corners: the top one first, the bottom one a beat behind, each lifting off and landing flat.
    // Negative turns the top flap toward you and positive the bottom one, as DOMMatrix measured.
    const flap = (sign, from) => {
      const r = (deg) => ({ transform: `rotate3d(1, ${-sign}, 0, ${deg}deg)` });
      return [k(0, r(sign * -176)), k(from, r(sign * -176)), k(from + .24, r(sign * 4)), k(from + .32, r(0)), k(1, r(0))];
    };
    topFlap.animate(flap(1, .4), { duration: T, easing: 'ease-in-out', fill: 'forwards' });
    botFlap.animate(flap(-1, .5), { duration: T, easing: 'ease-in-out', fill: 'forwards' });
    // Light: a face tipped away from the page is darker, and flat it is the paper's own colour.
    const shadeOf = (g) => g.querySelectorAll(':scope > .pl-leaf > .pl-shade');
    shadeOf(top).forEach((x) => x.animate([k(0, { opacity: .55 }), k(.46, { opacity: 0 }), k(1, { opacity: 0 })], { duration: T, fill: 'forwards' }));
    shadeOf(bot).forEach((x) => x.animate([k(0, { opacity: .3 }), k(.46, { opacity: 0 }), k(1, { opacity: 0 })], { duration: T, fill: 'forwards' }));
    [[topFlap, .4], [botFlap, .5]].forEach(([g, f]) => shadeOf(g).forEach((x) => x.animate([k(0, { opacity: .25 }), k(f, { opacity: .25 }),
      k(f + .12, { opacity: .6 }), k(f + .3, { opacity: 0 }), k(1, { opacity: 0 })], { duration: T, fill: 'forwards' })));
    wrap.done = new Promise((res) => setTimeout(() => {
      // The real page takes over, and the sheet's creases stay on it a moment.
      root.classList.remove('planes-waiting');
      crease(paper, W, H, a);
      under.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
      sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.then(res);
    }, T - 80));
    return wrap;
  }

  function crease(paper, W, H, a) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'pl-creases'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
    [[0, H / 2, W, H / 2], [a, 0, 0, a], [0, H - a, a, H]].forEach(([x1, y1, x2, y2]) => {
      const l = document.createElementNS(ns, 'line');
      Object.entries({ x1, y1, x2, y2 }).forEach(([n, v]) => l.setAttribute(n, v));
      svg.appendChild(l);
    });
    paper.appendChild(svg);
    svg.animate([{ opacity: 1 }, { opacity: .7, offset: .5 }, { opacity: 0 }], { duration: 1800, easing: 'ease-out', fill: 'forwards' }).finished.then(() => svg.remove());
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

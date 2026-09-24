// EXPERIMENT: paper airplanes on the front page. To remove it, delete website/public/experiments and the one
// <script src="/experiments/planes.js"> line in index.html, tests/planes.py and its name in scripts/run_tests.py.
// Nothing else depends on it.
//   The brief arrives folded into a paper plane made of the page itself. It flies in over the headline, touches
//   down where the paper sits, and opens out into it: the wings and the halves spread, then the nose corners.
//   Latest on annotated arrives the same way: when the row comes into view, a plane flies down to each card and
//   opens into it.
//   A take, once made, folds the marked sheet back into a plane, which flies down to Latest and opens there as
//   your card, and a fresh brief flies back in for another go.
// Rules: the page works from the first moment and the planes never take a click; a click or a key finishes every
// flight at once, and a scroll finishes the first landing; the arrivals play once a visit; reduced motion and
// phones get none. Browsers driven by tests get none unless the address carries ?planes, so the rest of the
// tests see the page as it is without them. ?noplanes shows the page without them, for comparing.
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
  // The rules that hold things back go in at once, since planes.css arrives a moment after the paper does.
  const hold = document.createElement('style');
  hold.textContent = '.planes-waiting .tp-article .tiTilt > .tiPaper:not(.pl-copy), .pl-hidden:not(.pl-copy) { opacity: 0 !important; }';
  document.head.appendChild(hold);
  const root = document.documentElement;
  if (!seen) root.classList.add('planes-waiting');
  // Whatever happens, the paper is never kept out of sight for long.
  const safety = setTimeout(() => root.classList.remove('planes-waiting'), 6000);

  const make = (tag, cls, css = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (css) e.style.cssText = css; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = (d) => d * Math.PI / 180;
  const dir = (deg) => ({ x: Math.cos(rad(deg)), y: Math.sin(rad(deg)) });
  // Where an element's own box sits on the page, before any transform of its own or its ancestors.
  const pageBox = (el) => {
    let x = 0, y = 0;
    for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };
  // The measurements of a dart folded from an Lw by Lh sheet, nose at x = 0 on the centre line.
  const dart = (Lw, Lh) => {
    const mid = Lh / 2, a = Math.min(Lh / 2, Lw / 2), b = Math.min(a * (1 + Math.SQRT2), Lw);
    return { mid, a, b, c: a * a / b, k: a * .45 };
  };
  const inView = (el, part = .35) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) >= r.height * part;
  };

  // ---- every plane in flight, so a click or a key can finish them all.
  const flying = new Set();
  const skipAll = () => [...flying].forEach((p) => p.finish());
  addEventListener('pointerdown', skipAll, true);
  addEventListener('keydown', skipAll, true);

  // ---- the plane: the element itself, copied onto six pieces of one sheet and folded.
  // A clone keeps its looks only if the rules that style it still match, and many of them name its ancestors,
  // so each copy sits inside empty stand-ins for them (display: contents, so they add no boxes).
  function standIns(target) {
    const chain = [];
    for (let e = target.parentElement; e && e !== document.body; e = e.parentElement) chain.unshift(e);
    const outer = make('div', 'pl-chain');
    let at = outer;
    chain.forEach((e) => {
      const s = make(e.tagName.toLowerCase(), typeof e.className === 'string' ? e.className.replace(/\bpl-\S+/g, '') : '');
      s.style.setProperty('display', 'contents', 'important');
      at.appendChild(s); at = s;
    });
    return { outer, inner: at };
  }
  function printed(target, W, H, Lw, Lh, theta) {
    const c = target.cloneNode(true);
    c.classList.remove('pl-hidden');
    c.classList.add('pl-copy');
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
    c.querySelectorAll('[data-annotated-self]').forEach((x) => x.removeAttribute('data-annotated-self'));
    c.querySelectorAll('video, audio, iframe').forEach((x) => x.replaceWith(make('div', 'pl-media')));
    c.setAttribute('aria-hidden', 'true'); c.inert = true;
    // The copy is the element's own size, turned back against the sheet's own turn so it reads the right way up.
    c.style.cssText += `;position:absolute;left:${(Lw - W) / 2}px;top:${(Lh - H) / 2}px;width:${W}px;height:${H}px;margin:0;box-sizing:border-box;opacity:1;visibility:visible;transform:rotate(${-theta}deg);box-shadow:none;`;
    const { outer, inner } = standIns(target);
    inner.appendChild(c);
    return outer;
  }

  // Build a plane over `target`. Returns its parts, and `open`, which opens it (or folds it, reversed).
  function buildPlane(target, opts = {}) {
    const W = target.offsetWidth, H = target.offsetHeight;
    const box = pageBox(target);
    const layer = make('div', 'pl-layer');
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    const lo = layer.getBoundingClientRect();
    const ox = lo.left + scrollX, oy = lo.top + scrollY;
    const bx = box.x - ox, by = box.y - oy;
    const px = opts.persp || { d: 1200, x: box.x + W / 2, y: box.y + H * .4 };
    layer.style.perspective = px.d + 'px';
    layer.style.perspectiveOrigin = `${px.x - ox}px ${px.y - oy}px`;
    const boxCss = `left:${bx}px;top:${by}px;width:${W}px;height:${H}px`;

    // A sheet wider than tall flies nose first to the right; a taller one nose first downward.
    const wide = W >= H;
    const Lw = wide ? W : H, Lh = wide ? H : W, theta = wide ? 180 : -90;
    const phi = (theta + 180) % 360;
    // A dart: the corners fold to the centre crease (a), the new edges fold to it again from the nose (to b, which
    // makes a 45 degree nose), the sheet folds in half, and each half folds back out along a line from the nose to
    // k above the crease at the tail, which is a wing.
    const { mid, a, b, c, k } = dart(Lw, Lh);
    const frameCss = `left:${(W - Lw) / 2}px;top:${(H - Lh) / 2}px;width:${Lw}px;height:${Lh}px;transform:rotate(${theta}deg)`;

    const fshadow = make('div', 'pl-fshadow', boxCss);
    const sil = make('div', 'pl-sil', frameCss);
    // Its outline seen from above: the long leading edges from the nose, and the wings' trailing edges.
    sil.style.clipPath = 'polygon(' + [[0, mid], [b, k * b / Lw], [Lw, k], [Lw, Lh - k], [b, Lh - k * b / Lw]].map(([x, y]) => `${x}px ${y}px`).join(',') + ')';
    fshadow.appendChild(sil);
    const under = make('div', 'pl-sheetShadow', boxCss);
    const carrier = make('div', 'pl-carrier', boxCss);
    const tiltw = make('div', 'pl-group');
    if (opts.tilt) { tiltw.style.transformOrigin = `${opts.tilt.ox}px ${opts.tilt.oy}px`; tiltw.style.transform = opts.tilt.m; }
    const sheet = make('div', 'pl-sheet');
    const frame = make('div', 'pl-frame', frameCss);
    const P = (pts) => 'polygon(' + pts.map(([x, y]) => `${x}px ${y}px`).join(', ') + ')';
    // One piece of paper: the printed front, and its blank back, mirrored and turned over so the two coincide.
    const pair = (pts, shade) => {
      const f = make('div', 'pl-leaf');
      f.style.clipPath = P(pts);
      f.appendChild(printed(target, W, H, Lw, Lh, theta));
      // Plain paper over the print while it flies: the words come up as it opens.
      f.appendChild(make('i', 'pl-cover'));
      f.appendChild(make('i', 'pl-shade', `opacity:${shade}`));
      const b = make('div', 'pl-leaf pl-blank');
      b.style.clipPath = P(pts.map(([x, y]) => [Lw - x, y]));
      b.appendChild(make('i', 'pl-shade', `opacity:${shade}`));
      return [f, b];
    };
    const group = (origin, ...kids) => { const g = make('div', 'pl-group', `transform-origin:${origin}`); kids.flat().forEach((x) => g.appendChild(x)); return g; };
    // Laid out nose to the left, each half nested in the order it was folded: the half turns about the centre
    // crease, the wing about its line from the nose, the leading fold (T2) about the line from the nose to b, the
    // corner about its diagonal. The second fold crosses the folded corner, so the corner is two pieces: the part
    // under the leading fold goes over with it (F1u), and the part beyond it (F1l, hinged on that crossing) stays.
    const side = (m) => {
      const y = (v) => (m ? Lh - v : v);
      const pts = (arr) => arr.map(([x, v]) => [x, y(v)]);
      const F1l = group(`0 ${mid}px`, pair(pts([[0, 0], [c, 0], [0, mid]]), .25));
      const F1u = group(`${a / 2}px ${y(a / 2)}px`, pair(pts([[c, 0], [a, 0], [0, mid]]), .25), F1l);
      const T2 = group(`0 ${mid}px`, pair(pts([[0, mid], [a, 0], [b, 0]]), .2), F1u);
      const wing = group(`0 ${mid}px`, pair(pts([[b, 0], [Lw, 0], [Lw, mid - k], [0, mid]]), .1), T2);
      const half = group(`0 ${mid}px`, pair(pts([[0, mid], [Lw, mid - k], [Lw, mid]]), .5), wing);
      return { F1l, F1u, T2, wing, half };
    };
    const top = side(false), bot = side(true);
    frame.append(top.half, bot.half);
    sheet.appendChild(frame);
    tiltw.appendChild(sheet);
    carrier.appendChild(tiltw);
    layer.append(fshadow, under, carrier);

    const s0 = opts.s0 || clamp(190 / Lw, .2, .6);
    const shadeOf = (g) => g.querySelectorAll(':scope > .pl-leaf > .pl-shade');
    const k2 = (o, t) => Object.assign({ offset: o }, t);
    // The opening, closed at the start and open at the end, in the reverse of the folding: wings and halves
    // together, then the leading folds, then the corners, the bottom a beat behind the top. Directions of turn
    // were measured with DOMMatrix: rotateX(-) lifts the top half toward you, + about the wing line brings the top
    // wing back out, and - about a fold whose piece lies up and to the left of it lays that piece toward you.
    const rot = (ax, ay, deg) => ({ transform: `rotate3d(${ax}, ${ay}, 0, ${deg}deg)` });
    // Held shut until t0, turned open by t1 with a little give past flat.
    const turn = (ax, ay, shut, t0, t1) => [k2(0, rot(ax, ay, shut)), k2(t0, rot(ax, ay, shut)), k2(t0 + (t1 - t0) * .8, rot(ax, ay, -shut * .022)), k2(t1, rot(ax, ay, 0)), k2(1, rot(ax, ay, 0))];
    const steps = [
      [sheet, [k2(0, { transform: `scale3d(${s0},${s0},${s0})` }), k2(.4, { transform: 'scale3d(1,1,1)' }), k2(1, { transform: 'scale3d(1,1,1)' })], 'ease-out'],
      // The flat sheet's shadow only once the sheet is nearly flat, since it is the shape of the whole page.
      [under, [k2(0, { opacity: 0 }), k2(.6, { opacity: 0 }), k2(1, { opacity: 1 })], 'ease-in'],
    ];
    sheet.querySelectorAll('.pl-cover').forEach((x) => steps.push([x, [k2(0, { opacity: 1 }), k2(.18, { opacity: 1 }), k2(.55, { opacity: 0 }), k2(1, { opacity: 0 })], 'ease-in-out']));
    [[top, 1], [bot, -1]].forEach(([s, m], i) => {
      const lag = i * .06;
      steps.push(
        [s.half, turn(1, 0, -85 * m, 0, .4), 'ease-in-out'],
        [s.wing, turn(Lw, -k * m, 77 * m, 0, .36), 'ease-in-out'],
        [s.T2, turn(b, -a * m, -177 * m, .32 + lag, .6 + lag), 'ease-in-out'],
        // The part of the corner beyond the leading fold turns back as that fold turns, so it stays put.
        [s.F1l, turn(c, -a * m, 177 * m, .32 + lag, .6 + lag), 'ease-in-out'],
        [s.F1u, turn(1, -m, -176 * m, .56 + lag, .84 + lag), 'ease-in-out'],
      );
      shadeOf(s.half).forEach((x) => steps.push([x, [k2(0, { opacity: .5 }), k2(.4, { opacity: 0 }), k2(1, { opacity: 0 })], 'linear']));
      shadeOf(s.wing).forEach((x) => steps.push([x, [k2(0, { opacity: .1 }), k2(.36, { opacity: 0 }), k2(1, { opacity: 0 })], 'linear']));
      [[s.T2, .32 + lag, .2], [s.F1u, .56 + lag, .25], [s.F1l, .56 + lag, .25]].forEach(([g, f, o]) => shadeOf(g).forEach((x) => steps.push([x,
        [k2(0, { opacity: o }), k2(f, { opacity: o }), k2(f + .12, { opacity: .55 }), k2(Math.min(.99, f + .28), { opacity: 0 }), k2(1, { opacity: 0 })], 'linear'])));
    });
    // Held folded until it opens, or held open when it is the page that is about to fold.
    const at = opts.startOpen ? (kf) => kf[kf.length - 1] : (kf) => kf[0];
    const pose = (kf) => { const c = Object.assign({}, at(kf)); delete c.offset; return c; };
    const held = steps.map(([el, kf]) => el.animate([pose(kf), pose(kf)], { duration: 1, fill: 'forwards' }));
    const open = (T, reverse = false) => {
      const runs = steps.map(([el, kf, easing]) => el.animate(kf, { duration: T, easing, fill: 'forwards', direction: reverse ? 'reverse' : 'normal' }));
      held.forEach((x) => x.cancel());
      return Promise.all(runs.map((r) => r.finished)).catch(() => {});
    };
    const centre = { x: box.x + W / 2, y: box.y + H / 2 };
    return { layer, carrier, fshadow, under, sheet, open, W, H, Lw, s0, phi, centre };
  }

  // ---- flight: a path on the page, flown at a given pace, height and lean, as keyframes for the carrier and its shadow.
  function bezier(p0, p1, p2, p3, n = 60) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y });
    }
    return out;
  }
  const line = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }));
  const lenOf = (pts) => pts.reduce((s, p, i) => i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0, 0);
  // Pace: speeding up over the first `acc` of the time, slowing over the last `dec`, steady between.
  const pace = (acc, dec) => {
    const v = 1 / (acc / 2 + (1 - acc - dec) + dec / 2);
    return (u) => u < acc ? v * u * u / (2 * acc)
      : u < 1 - dec || !dec ? v * (acc / 2 + (u - acc))
        : v * (acc / 2 + (1 - acc - dec) + (dec / 2) * (1 - ((1 - u) / dec) ** 2));
  };
  function flight(plane, pts, { acc = 0, dec = .16, z, T }) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const L = cum[cum.length - 1] || 1;
    const at = (d) => {
      d = clamp(d, 0, L);
      let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
      const p = pts[i - 1], n = pts[i], f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      return { x: p.x + (n.x - p.x) * f, y: p.y + (n.y - p.y) * f, h: Math.atan2(n.y - p.y, n.x - p.x) * 180 / Math.PI };
    };
    const unwrap = (h, prev) => { while (h - prev > 180) h -= 360; while (h - prev < -180) h += 360; return h; };
    const d = pace(acc, dec), N = 72;
    const raw = [];
    let prevH = plane.phi;
    for (let i = 0; i <= N; i++) {
      const u = i / N, s = d(u) * L, p = at(s);
      const h = unwrap(p.h, prevH); prevH = h;
      const ahead = unwrap(at(s + 24).h, h), behind = unwrap(at(s - 24).h, h);
      raw.push({ u, x: p.x, y: p.y, h, turn: (ahead - behind) / 48, z: z(u), s });
    }
    // Land (or leave) square to the sheet, so the last frame is exactly where the page is.
    const fin = raw[N].h; const off = Math.round((fin - plane.phi) / 360) * 360;
    raw.forEach((r) => { r.h -= off; });
    const frames = [], shadows = [];
    raw.forEach((r, i) => {
      // Lean into a turn, pitch with the climb or the descent.
      const near = raw.slice(Math.max(0, i - 3), i + 4);
      const turn = near.reduce((s, x) => s + x.turn, 0) / near.length;
      const bank = clamp(-turn * 130, -38, 38) * clamp(r.z / 60, 0, 1);
      const nxt = raw[Math.min(N, i + 1)], prv = raw[Math.max(0, i - 1)];
      const ds = Math.max(1, nxt.s - prv.s);
      const pitch = clamp(-(nxt.z - prv.z) / ds * 40, -22, 16);
      const x = r.x - plane.centre.x, y = r.y - plane.centre.y;
      frames.push({ offset: r.u, transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${r.z.toFixed(1)}px) rotateZ(${r.h.toFixed(2)}deg) rotateX(${bank.toFixed(2)}deg) rotateY(${pitch.toFixed(2)}deg) rotateZ(${-plane.phi}deg)` });
      const sh = 1 + r.z / 1600;
      shadows.push({ offset: r.u, opacity: clamp(.34 - r.z / 1300, .08, .34), filter: `blur(${(1.5 + r.z / 45).toFixed(1)}px)`,
        transform: `translate(${(x + r.z * .3).toFixed(1)}px, ${(y + r.z * .45).toFixed(1)}px) rotate(${(r.h - plane.phi).toFixed(2)}deg) scale(${(plane.s0 * sh).toFixed(3)})` });
    });
    const f = plane.carrier.animate(frames, { duration: T, easing: 'linear', fill: 'forwards' });
    plane.fshadow.animate(shadows, { duration: T, easing: 'linear', fill: 'forwards' });
    return f.finished.catch(() => {});
  }
  // In from `from` (a point on the page), touching down on the plane's own spot heading its own way.
  function landPath(plane, from, swoop = .25) {
    const to = plane.centre, h = dir(plane.phi);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const perp = { x: -h.y, y: h.x };
    let slide = dist * .12, pts;
    for (let pass = 0; pass < 2; pass++) {
      const p3 = { x: to.x - h.x * slide, y: to.y - h.y * slide };
      const p2 = { x: p3.x - h.x * dist * .38, y: p3.y - h.y * dist * .38 };
      const p1 = { x: from.x + (to.x - from.x) * .35 + perp.x * dist * swoop, y: from.y + (to.y - from.y) * .35 + perp.y * dist * swoop };
      const c = bezier(from, p1, p2, p3);
      // The slide on the paper is what the slowing covers, so it is sized from the path before it.
      slide = lenOf(c) * .1;
      pts = c.concat(line(p3, to).slice(1));
    }
    return pts;
  }
  const descend = (z0, touch) => (u) => u < touch ? z0 * (1 - u / touch) ** 1.5
    : u < touch + .06 ? 7 * Math.sin(Math.PI * (u - touch) / .06) : 0;

  // ---- the three flights.
  const paperOpts = (paper) => {
    const stage = paper.closest('.tiStage'), tilt = paper.parentElement;
    const sb = pageBox(stage), tb = pageBox(tilt), pb = pageBox(paper);
    const po = getComputedStyle(stage).perspectiveOrigin.split(' ').map(parseFloat);
    const m = getComputedStyle(tilt).transform;
    return {
      persp: { d: parseFloat(getComputedStyle(stage).perspective) || 1400, x: sb.x + po[0], y: sb.y + po[1] },
      tilt: m && m !== 'none' ? { m, ox: tb.x + tb.w / 2 - pb.x, oy: tb.y + tb.h / 2 - pb.y } : null,
    };
  };
  function track(plane, target, onFinish) {
    let done = false;
    const p = {
      finish() {
        if (done) return; done = true; flying.delete(p);
        plane.layer.remove();
        if (target) target.classList.remove('pl-hidden');
        if (onFinish) onFinish();
      },
    };
    flying.add(p);
    return p;
  }
  function crease(paper, W, H) {
    const ns = 'http://www.w3.org/2000/svg', { mid, a, b, k } = dart(W, H);
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'pl-creases'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
    // Drawn nose to the right, as the brief lands: the centre crease, the corners, the leading folds and the wings.
    const R = (x) => W - x;
    [[0, mid, W, mid], [R(a), 0, W, mid], [R(a), H, W, mid], [R(b), 0, W, mid], [R(b), H, W, mid], [0, mid - k, W, mid], [0, mid + k, W, mid]].forEach(([x1, y1, x2, y2]) => {
      const l = document.createElementNS(ns, 'line');
      Object.entries({ x1, y1, x2, y2 }).forEach(([n, v]) => l.setAttribute(n, v));
      svg.appendChild(l);
    });
    paper.appendChild(svg);
    svg.animate([{ opacity: 1 }, { opacity: .7, offset: .5 }, { opacity: 0 }], { duration: 1800, easing: 'ease-out', fill: 'forwards' }).finished.then(() => svg.remove());
  }
  const handOver = (plane, t, ms = 220) => {
    plane.sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, fill: 'forwards' });
    plane.under.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, fill: 'forwards' }).finished.then(t.finish);
  };

  // 1. The brief flies in and opens. `first` is the arrival on load, which a scroll also finishes.
  function briefIn(paper, first) {
    return new Promise((resolve) => {
      if (!first) paper.classList.add('pl-hidden');
      const plane = buildPlane(paper, paperOpts(paper));
      const t = track(plane, paper, () => {
        clearTimeout(safety);
        root.classList.remove('planes-waiting');
        if (first) {
          try { sessionStorage.setItem('annotated-plane-seen', '1'); } catch { /* no storage */ }
          ['wheel', 'touchstart'].forEach((e) => removeEventListener(e, t.finish, true));
          document.dispatchEvent(new CustomEvent('annotated-plane-landed'));
        }
        resolve();
      });
      if (first) ['wheel', 'touchstart'].forEach((e) => addEventListener(e, t.finish, true));
      const from = { x: scrollX - 160, y: scrollY + 50 };
      flight(plane, landPath(plane, from, -.18), { z: descend(300, .86), T: first ? 1700 : 1400 }).then(async () => {
        if (!flying.has(t)) return;
        plane.fshadow.animate([{ opacity: .3 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
        await plane.open(1300);
        if (!flying.has(t)) return;
        root.classList.remove('planes-waiting');
        paper.classList.remove('pl-hidden');
        crease(paper, plane.W, plane.H);
        handOver(plane, t);
      });
    });
  }

  // 2. A card in Latest: a plane flies down to it and opens into it. With `from`, a plane already sits on the
  //    card's spot (the one a take became), and `len` is its length, so this one takes over at the same size.
  function cardIn(card, { delay = 0, from = null, len = 0 } = {}) {
    return new Promise((resolve) => {
      card.classList.add('pl-hidden');
      const go = () => {
        const plane = buildPlane(card, len ? { s0: len / Math.max(card.offsetWidth, card.offsetHeight) } : {});
        const t = track(plane, card, resolve);
        const h = dir(plane.phi);
        const start = { x: plane.centre.x - h.x * 520 - h.y * 180, y: plane.centre.y - h.y * 520 + h.x * 120 };
        const air = from ? Promise.resolve() : flight(plane, landPath(plane, start, .2), { z: descend(260, .84), T: 1150 });
        if (from) plane.fshadow.style.opacity = '0';
        air.then(async () => {
          if (!flying.has(t)) return;
          plane.fshadow.animate([{ opacity: .3 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
          await plane.open(1000);
          if (!flying.has(t)) return;
          card.classList.remove('pl-hidden');
          handOver(plane, t, 200);
        });
      };
      if (delay) setTimeout(go, delay); else go();
    });
  }
  const latestRow = () => document.querySelector('.landLatest:not([hidden]) .llRow');
  // Cards wait, hidden, for the row to come into view, and then come in one after another.
  const waiting = [];
  function landLatest() {
    const row = latestRow();
    if (!row || !waiting.length || !inView(row) || root.classList.contains('planes-waiting')) return;
    waiting.splice(0).forEach((card, i) => { if (card.isConnected) cardIn(card, { delay: i * 240 }); });
  }

  // 3. After a take: the marked sheet folds back into a plane and flies down to Latest, where it opens as your
  //    card, and a fresh brief flies in behind it.
  function foldAway(paper) {
    const lift = document.querySelector('.tiLift:not([hidden])');
    if (!lift) return;
    const take = (lift.querySelector('.tiTakeOut') || {}).textContent || '';
    const quote = (lift.querySelector('.tiInk') || {}).textContent || '';
    const row = latestRow();
    let card = null;
    if (row) {
      row.querySelectorAll('.pl-yours').forEach((x) => x.remove());
      const li = make('li', 'cardItem pl-yours');
      li.innerHTML = '<div class="card mf nothumb"><span class="cbody"><span class="cmeta">You <span class="dotsep">just now</span> <span class="localTag">Yours, on this computer</span></span><span class="ctake"></span><span class="csource"><span><span class="cst">The annotated.com brief</span><span class="csn"></span></span></span></span></div>';
      li.querySelector('.ctake').textContent = take;
      li.querySelector('.csn').textContent = quote;
      card = li.firstElementChild;
      card.dataset.plQueued = '1';
      card.classList.add('pl-hidden');
      row.prepend(li);
      if (row.children.length > 4) row.lastElementChild.remove();
      row.style.setProperty('--n', Math.min(4, row.children.length));
    }
    // The card on top goes down into the paper, and the paper folds up with it.
    lift.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(40px) scale(.9)' }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
    // And the hairline that joined the card to its words goes with it.
    const wire = document.querySelector('.tp-article .tiWire');
    if (wire) wire.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    const plane = buildPlane(paper, Object.assign(paperOpts(paper), { startOpen: true }));
    plane.fshadow.style.opacity = '0';
    paper.classList.add('pl-hidden');
    let back = null;
    // Resolves once the try-it's own reset has cleared the marks, so the fresh brief is folded from a clean page.
    const bringBack = () => {
      if (back) return back;
      back = new Promise((res) => setTimeout(res, 480));
      const redo = document.querySelector('.tiRedo');
      if (redo) redo.click();
      lift.getAnimations().forEach((x) => x.cancel());
      if (wire) setTimeout(() => wire.getAnimations().forEach((x) => x.cancel()), 480);
      // After the try-it's own reset has put its usual line back.
      setTimeout(() => {
        const hint = document.querySelector('.tp-article .tiHint');
        if (hint && !paper.querySelector('.tiText mark')) hint.textContent = card ? 'Yours went down to Latest on annotated. Mark another sentence.' : 'Yours is kept in this browser. Mark another sentence.';
      }, 600);
      return back;
    };
    const t = track(plane, null, () => { bringBack(); if (!paper.closest('.pl-layer')) paper.classList.remove('pl-hidden'); if (card) card.classList.remove('pl-hidden'); });
    (async () => {
      await plane.open(900, true);
      if (!flying.has(t)) return;
      const len = plane.Lw * plane.s0;
      const start = plane.centre, h = dir(plane.phi);
      let target = null;
      if (card && inView(row, .2)) { const b = pageBox(card); target = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
      const run = { x: start.x + h.x * 140, y: start.y + h.y * 140 };
      let pts;
      if (target) {
        // Off along the paper, up, and down onto the card, arriving the way a card's plane arrives.
        const th = dir(card.offsetHeight > card.offsetWidth ? 90 : 0);
        const p3 = { x: target.x - th.x * 90, y: target.y - th.y * 90 };
        pts = line(start, run).concat(bezier(run, { x: run.x + h.x * 260, y: run.y + h.y * 260 - 120 }, { x: p3.x - th.x * 260, y: p3.y - th.y * 260 }, p3).slice(1), line(p3, target).slice(1));
      } else {
        const out = { x: scrollX + innerWidth + 260, y: start.y + 420 };
        pts = line(start, run).concat(bezier(run, { x: run.x + 300, y: run.y - 60 }, { x: out.x - 200, y: out.y - 200 }, out).slice(1));
      }
      plane.fshadow.style.opacity = '';
      const T = target ? 1600 : 1200;
      const z = target ? (u) => (u < .12 ? 0 : u < .86 ? 240 * Math.sin(Math.PI * (u - .12) / .74) ** .8 : 0) : (u) => (u < .12 ? 0 : 420 * ((u - .12) / .88) ** 1.3);
      const air = flight(plane, pts, { acc: .16, dec: target ? .14 : 0, z, T });
      // The fresh brief follows once the old one is clear of the paper.
      setTimeout(() => { if (!flying.has(t)) return; bringBack().then(() => briefIn(paper, false)); }, T * .4);
      await air;
      if (!flying.has(t)) return;
      flying.delete(t); plane.layer.remove();
      if (target) cardIn(card, { from: target, len });
      else if (card) { waiting.push(card); landLatest(); }
    })();
  }

  // ---- a tab chosen: a small dart carries it in, in half a second.
  function carryTab(tab) {
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    if (!panel) return;
    const r1 = tab.getBoundingClientRect(), r2 = panel.getBoundingClientRect();
    const from = { x: r1.left + r1.width / 2, y: r1.top + r1.height / 2 }, to = { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
    const w = make('div', 'pl-dart');
    w.innerHTML = '<i class="pl-dw pl-dwl"></i><i class="pl-dw pl-dwr"></i>';
    document.body.appendChild(w);
    w.animate([
      { transform: `translate(${from.x}px, ${from.y}px) rotate(100deg) scale(.6)`, opacity: 0 },
      { transform: `translate(${(from.x + to.x) / 2 + 40}px, ${from.y + 30}px) rotate(120deg) scale(1)`, opacity: 1, offset: .4 },
      { transform: `translate(${to.x}px, ${to.y}px) rotate(95deg) scale(.8)`, opacity: 0 },
    ], { duration: 500, easing: 'ease-out', fill: 'forwards' }).finished.then(() => w.remove());
  }

  const start = () => {
    const paper = document.querySelector('.tp-article .tiTilt > .tiPaper');
    if (!paper) return false;
    addEventListener('scroll', () => requestAnimationFrame(landLatest), { passive: true });
    document.addEventListener('annotated-plane-landed', landLatest);
    // Cards that arrive before this visit's first landing wait for their own planes.
    if (!seen) {
      const grab = () => {
        const row = document.querySelector('.llRow');
        if (!row) return;
        const cards = [...row.querySelectorAll(':scope > .cardItem > .card')].filter((c) => !c.dataset.plQueued);
        cards.forEach((c) => { c.dataset.plQueued = '1'; c.classList.add('pl-hidden'); waiting.push(c); });
        if (cards.length) landLatest();
      };
      new MutationObserver(grab).observe(document.body, { childList: true, subtree: true });
      grab();
      setTimeout(() => briefIn(paper, true), 120);
    } else root.classList.remove('planes-waiting');
    document.addEventListener('annotated-tryit-made', () => {
      let cancelled = false;
      const stop = (e) => { if (e.target.closest && e.target.closest('.tryit')) cancelled = true; };
      document.addEventListener('pointerdown', stop, true);
      // Long enough to read the card; anything done in the try-it meanwhile keeps it where it is.
      setTimeout(() => {
        document.removeEventListener('pointerdown', stop, true);
        if (!cancelled && !document.querySelector('.tp-article[hidden]') && inView(paper, .5)) foldAway(paper);
      }, 2600);
    });
    document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('.tryTab'); if (t && t.getAttribute('aria-selected') === 'true') carryTab(t); });
    return true;
  };
  // The front page is drawn by site.js a moment after this runs.
  let tries = 0;
  const wait = () => { if (start()) return; if (++tries < 120) requestAnimationFrame(wait); else root.classList.remove('planes-waiting'); };
  wait();
})();

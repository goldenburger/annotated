// The paper planes, shared by the extension and the website (scripts/sync_website.py copies it). Any element
// can be folded into a real dart made of copies of it, flown along a path over the page, and opened out into
// its own place again. The extension folds what you are publishing and sends it off (Publish), and drops an
// annotation onto its page when you arrive from Publish. The website's front page choreography lives in its
// own planes.js and uses this. The look is in fold.css.
//   Fold.on() is whether planes fly here at all: never with reduced motion, never when Display settings has
//   them off ("planes" in prefs.js), and never in a browser driven by tests unless it asks (?planes in the
//   address, or localStorage annotated-planes = on), so the rest of the tests see the page as it is.
var Fold = (() => {
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
  if (typeof addEventListener !== 'undefined') { addEventListener('pointerdown', skipAll, true); addEventListener('keydown', skipAll, true); }

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


  const on = () => {
    try {
      if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      const pf = typeof Prefs !== 'undefined' && Prefs.get ? Prefs.get() : null;
      if (pf && pf.planes === false) return false;
      if (typeof navigator !== 'undefined' && navigator.webdriver) {
        let asked = /[?&]planes\b/.test(location.search);
        try { asked = asked || localStorage.getItem('annotated-planes') === 'on'; } catch { /* no storage */ }
        return asked;
      }
      return true;
    } catch { return false; }
  };

  // Drop in from just above an element and open into it. `from` and `len` hand over from a plane already on
  // the spot, which is how a plane that flew here becomes the thing it lands as.
  function arrive(el, { delay = 0, from = null, len = 0, z0 = 150, T = 1000, openT = 1000, s0 = 0 } = {}) {
    return new Promise((resolve) => {
      el.classList.add('pl-hidden');
      const go = () => {
        const L = Math.max(el.offsetWidth, el.offsetHeight);
        if (!L) { el.classList.remove('pl-hidden'); resolve(); return; }
        const plane = buildPlane(el, { s0: len ? len / L : (s0 || clamp(150 / L, .2, .5)) });
        const t = track(plane, el, resolve);
        const h = dir(plane.phi);
        const start = { x: plane.centre.x - h.x * 300 - h.y * 90, y: plane.centre.y - h.y * 300 + h.x * 70 };
        const air = from ? Promise.resolve() : flight(plane, landPath(plane, start, .15), { z: descend(z0, .84), T });
        if (from) plane.fshadow.style.opacity = '0';
        air.then(async () => {
          if (!flying.has(t)) return;
          plane.fshadow.animate([{ opacity: .3 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
          await plane.open(openT);
          if (!flying.has(t)) return;
          el.classList.remove('pl-hidden');
          handOver(plane, t, 200);
        });
      };
      if (delay) setTimeout(go, delay); else go();
    });
  }

  // Send an element away: it folds into a plane where it is and takes off, up and to the right, out of the
  // window, shrinking as it goes. Resolves once it has gone. This is what publishing looks like: the thing
  // leaves, it does not circle and come back. `cancel()` on the result puts everything back at once.
  function away(el, { s0 = 0 } = {}) {
    const L = Math.max(el.offsetWidth, el.offsetHeight);
    const plane = buildPlane(el, { startOpen: true, s0: s0 || clamp(140 / L, .2, .5) });
    plane.fshadow.style.opacity = '0';
    el.classList.add('pl-hidden');
    let settle;
    const gone = new Promise((res) => { settle = res; });
    const t = track(plane, null, () => { el.classList.remove('pl-hidden'); settle(); });
    (async () => {
      await plane.open(650, true);
      if (!flying.has(t)) return;
      plane.fshadow.style.opacity = '';
      const vw = document.documentElement.clientWidth;
      const c = plane.centre, h = dir(plane.phi);
      const run = { x: c.x + h.x * 50, y: c.y + h.y * 50 };
      const out = { x: scrollX + vw + 120, y: scrollY - 140 };
      const pts = line(c, run, 6).concat(bezier(run, { x: run.x + 120, y: run.y + 10 }, { x: out.x - 160, y: out.y + 200 }, out).slice(1));
      // Up off the page first, then away into the distance (a negative height is further from you).
      const z = (u) => (u < .3 ? 70 * (u / .3) : 70 - 520 * ((u - .3) / .7) ** 1.4);
      const f = flight(plane, pts, { acc: .35, dec: 0, z, T: 1100 });
      plane.carrier.animate([{ opacity: 1 }, { opacity: 1, offset: .75 }, { opacity: 0 }], { duration: 1100, fill: 'forwards' });
      await f;
      if (!flying.has(t)) return;
      flying.delete(t); plane.layer.remove(); settle();
    })();
    gone.cancel = () => t.finish();
    return gone;
  }

  return { on, make, clamp, dir, pageBox, dart, inView, buildPlane, bezier, line, lenOf, pace, flight, landPath, descend, track, crease, handOver, arrive, away, flying, skipAll };
})();

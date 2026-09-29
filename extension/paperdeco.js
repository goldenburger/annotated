// Paper on the desk (David, 2026-09-25): small drawings in annotated's own paper and ink that sit in the empty
// margins and quiet corners of its pages, the same paper the planes are folded from. A pile of folded planes, a
// sheet half folded with one line marked, a crumpled ball, a plane leaving a dashed trail. They are drawings
// only: aria-hidden, no pointer events, no motion of their own, and gone where there is no room for them.
var PaperDeco = (() => {
  // A plane in the air at the end of a dashed trail that loops once.
  const trail = (w = 220, h = 90) => `<path class="pdTrail" d="M4 ${h - 10} C ${w * .25} ${h - 4}, ${w * .32} ${h * .35}, ${w * .5} ${h * .5} S ${w * .62} ${h * .95}, ${w * .7} ${h * .6} S ${w * .82} 10, ${w - 30} 16"/>
    <g transform="translate(${w - 44} -8) rotate(8) scale(.34)"><path class="pdFace" d="M108 20 L20 56 L55 68 Z"/><path class="pdKeel" d="M108 20 L55 68 L66 104 Z"/><path class="pdEdge" d="M108 20 L20 56 L55 68 Z M108 20 L66 104 L55 68"/></g>`;

  // A heading's rule: a short dashed trail ending in a tiny dart, the size of a letter.
  const DART = '<path class="pdFace" d="M108 20 L20 56 L55 68 Z"/><path class="pdKeel" d="M108 20 L55 68 L66 104 Z"/><path class="pdEdge" d="M108 20 L20 56 L55 68 Z M108 20 L66 104 L55 68"/>';
  const rule = () => `<svg class="paperDeco pdRule" viewBox="0 0 132 14" width="132" height="14" aria-hidden="true" focusable="false"><path class="pdTrail" d="M1 9 C 30 12, 62 4, 92 8 S 108 9, 114 7"/><g transform="translate(111 -1) rotate(4) scale(.14)">${DART}</g></svg>`;
  // Behind an avatar: a faint trail curving in to it, as if it had arrived by plane.
  const arrival = () => `<svg class="paperDeco pdArrival" viewBox="0 0 120 70" width="120" height="70" aria-hidden="true" focusable="false"><path class="pdTrail" d="M2 60 C 26 62, 34 30, 58 30 S 92 44, 116 26"/></svg>`;
  // Resting on a line of text: a small folded dart waiting to be thrown.
  const waiting = () => `<svg class="paperDeco pdWaiting" viewBox="14 14 100 96" width="22" height="21" aria-hidden="true" focusable="false">${DART}</svg>`;
  const svg = (w, h, body, cls = '') => `<svg class="paperDeco ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${body}</svg>`;
  // One light for the whole desk (2.37.0): a drawing turns, its shadow does not. The shadow is taken out of the turned
  // drawing, put where its middle lands once turned, and laid flat, a little below, as every sheet's shadow falls.
  const at = (x, y, rot, s, body) => {
    const flat = [], a = rot * Math.PI / 180;
    body = body.replace(/<ellipse class="(pdShadow(?:Soft)?)"([^>]*)\/>/g, (m, cls, attrs) => {
      const num = (k) => { const q = attrs.match(new RegExp(' ' + k + '="([-\\d.]+)"')); return q ? Number(q[1]) : 0; };
      const cx = num('cx'), cy = num('cy');
      const px = cx * Math.cos(a) - cy * Math.sin(a), py = cx * Math.sin(a) + cy * Math.cos(a) + 3;
      flat.push(`<ellipse class="${cls}"${attrs.replace(/ c[xy]="[-\d.]+"/g, '')} cx="${(Math.round(px * 10) / 10)}" cy="${(Math.round(py * 10) / 10)}"/>`);
      return '';
    });
    return `${flat.length ? `<g transform="translate(${x} ${y}) scale(${s})">${flat.join('')}</g>` : ''}<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${body}</g>`;
  };

  // ---- Paper that looks like paper (David, 2026-09-25: the sheets looked like a word processor's icons and the
  // balls like footballs). Hand-made rather than ruled: edges that are never quite straight, a curled corner,
  // shading that runs along a fold, lines written rather than ruled, a highlighter stroke with rough ends, and
  // crumpled sheets whose outline and creases are made fresh each time.
  let uidN = 0;
  const uid = (p) => `${p}${++uidN}${Math.floor(Math.random() * 1e4)}`;
  // A small seeded random, so one drawing's pieces agree with each other.
  const rng = (seed) => { let s = (seed % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  // A line of writing: a run of small waves, a word at a time, with gaps between the words.
  const scrib = (x, y, len, r) => {
    let d = '', cx = x;
    while (cx < x + len - 4) {
      const word = Math.min(x + len - cx, 8 + r() * 16);
      d += `M${f1(cx)} ${f1(y + (r() - .5) * .8)}`;
      for (let w = 0; w < word; w += 3.2) d += ` q1.6 ${f1(-1.3 - r() * .9)} 3.2 0`;
      cx += word + 3 + r() * 3;
    }
    return d;
  };
  // A highlighter stroke: wide, slightly slanted, with rough ends, laid over its line.
  const marker = (x, y, len, r) => `<path class="pdHi" d="M${f1(x - 2)} ${f1(y + .6)} q${f1(len * .5)} ${f1(-1.6 - r())} ${f1(len + 3)} ${f1(-.6 + r())}"/>`;
  // An edge that is not quite ruled: a straight run from a to b, bowed a little.
  const bow = (a, b, amt) => { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return ` Q${f1(mx - dy / L * amt)} ${f1(my + dx / L * amt)} ${f1(b[0])} ${f1(b[1])}`; };
  const shape = (pts, r, amt = 1.2) => `M${f1(pts[0][0])} ${f1(pts[0][1])}` + pts.map((p, i) => bow(p, pts[(i + 1) % pts.length], (r() - .5) * 2 * amt)).join('') + ' Z';
  // A soft shadow under anything, the same filter everywhere.
  const soft = (id) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>`;
  // A gradient from paper to its shaded side.
  const grad = (id, x1, y1, x2, y2, a = 'var(--pd-face)', b = 'var(--pd-far)') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" style="stop-color:${a}"/><stop offset="1" style="stop-color:${b}"/></linearGradient>`;

  // A page with its bottom right corner curling up, written on, one line marked.
  const page = (w, h, r, { lines = 6, mark = 2, curl = 18, id }) => {
    const c = curl;
    const outline = shape([[0, 0], [w, 1], [w - 1, h - c], [w - c, h], [1, h - 1]], r, 1.4);
    let ink = '';
    const top = 16, gap = (h - top - 18) / lines;
    for (let i = 0; i < lines; i++) {
      const y = top + i * gap, len = (i === lines - 1 ? .45 : .7 + r() * .22) * (w - 26) - (y > h - c - 6 ? c : 0);
      if (i === mark) ink += marker(12, y, len, r);
      ink += `<path class="pdInk" d="${scrib(12, y, len, r)}"/>`;
    }
    const curlPath = `M${f1(w - 1)} ${f1(h - c)} Q${f1(w - c * .35)} ${f1(h - c * .55)} ${f1(w - c)} ${f1(h)} Q${f1(w - c * .9)} ${f1(h - c * .9)} ${f1(w - 1)} ${f1(h - c)} Z`;
    return `<path d="${outline}" fill="url(#${id}g)"/>${ink}
      <path class="pdCurlUnder" d="M${f1(w - 1)} ${f1(h - c)} L${f1(w - c)} ${f1(h)} L${f1(w - 1)} ${f1(h)} Z"/>
      <path d="${curlPath}" fill="url(#${id}c)"/><path class="pdEdgeSoft" d="${curlPath}"/><path class="pdEdgeSoft" d="${outline}"/>`;
  };
  const pageDefs = (id, w, h) => grad(id + 'g', 0, 0, 0, 1) + grad(id + 'c', 1, 1, 0, 0, 'var(--pd-keel)', 'var(--pd-face)') + soft(id + 's');

  // A single sheet, a little askew, its corner curling.
  const sheet = (x, y, rot = -6, s = 1, seed = Math.random() * 1e9) => {
    const r = rng(Math.floor(seed)), id = uid('pds');
    return at(x, y, rot, s, `<defs>${pageDefs(id)}</defs><rect x="6" y="10" width="112" height="146" rx="3" class="pdShadowSoft" filter="url(#${id}s)"/>${page(118, 152, r, { lines: 8, mark: 3, curl: 20, id })}`);
  };
  // Half folded: the first two folds of a dart, the flaps lifting a little off the page, shade under them.
  const halfFold = (x, y, rot = 0, s = 1, seed = Math.random() * 1e9) => {
    const r = rng(Math.floor(seed)), id = uid('pdh');
    const W = 84, H = 118, t = 42;
    let ink = '';
    for (let i = 0; i < 4; i++) { const yy = t + 18 + i * 13, len = (i === 3 ? .45 : .72 + r() * .18) * (W - 22); if (i === 1) ink += marker(11, yy, len, r); ink += `<path class="pdInk" d="${scrib(11, yy, len, r)}"/>`; }
    const body = shape([[0, t], [W, t + 1], [W - 1, H], [1, H - 1]], r, 1);
    const flapL = `M0 ${t} Q${f1(W * .24)} ${f1(t * .45)} ${f1(W / 2)} 0 Q${f1(W / 2 - 2)} ${f1(t * .55)} ${f1(W / 2 + 1)} ${f1(t + 2)} Z`;
    const flapR = `M${W} ${t + 1} Q${f1(W * .76)} ${f1(t * .45)} ${f1(W / 2)} 0 Q${f1(W / 2 + 2)} ${f1(t * .55)} ${f1(W / 2 + 1)} ${f1(t + 2)} Z`;
    return at(x, y, rot, s, `<defs>${grad(id + 'g', 0, 0, 0, 1)}${grad(id + 'l', 0, 0, 1, 1, 'var(--pd-face)', 'var(--pd-keel)')}${grad(id + 'r', 1, 0, 0, 1, 'var(--pd-far)', 'var(--pd-keel)')}${soft(id + 's')}</defs>
      <rect x="5" y="${t + 6}" width="${W}" height="${H - t}" rx="3" class="pdShadowSoft" filter="url(#${id}s)"/>
      <path d="${body}" fill="url(#${id}g)"/>${ink}
      <path class="pdFlapShadow" d="M2 ${t + 1} L${W / 2 + 1} ${t + 6} L${W - 2} ${t + 2} Z" filter="url(#${id}s)"/>
      <path d="${flapL}" fill="url(#${id}l)"/><path d="${flapR}" fill="url(#${id}r)"/>
      <path class="pdEdgeSoft" d="${body}"/><path class="pdEdgeSoft" d="${flapL}"/><path class="pdEdgeSoft" d="${flapR}"/>
      <path class="pdCrease2" d="M${W / 2} ${t + 3} L${W / 2 + 1} ${H - 2}"/>`);
  };
  // A crumpled sheet: an uneven outline, a few curved creases running out from where it was squeezed, the facets
  // between them shaded, a highlight where the light catches it. Made fresh from its seed, so no two are alike.
  const crumple = (x, y, s = 1, seed = Math.random() * 1e9) => {
    const r = rng(Math.floor(seed)), id = uid('pdc');
    const cx = 26, cy = 23, R = 19, n = 17 + Math.floor(r() * 6);
    const pts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + (r() - .5) * .25, rr = R * (i % 2 ? .86 + r() * .1 : .93 + r() * .12);
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (.86 + r() * .1)];
    });
    // Lumpy but soft: the outline passes near each point, with small dents between some of them.
    const mid = (p, q, k = .5) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    let d = `M${mid(pts[n - 1], pts[0]).map(f1).join(' ')}`;
    pts.forEach((p, i) => { const m = mid(p, pts[(i + 1) % n], .45 + r() * .1); d += ` Q${f1(p[0])} ${f1(p[1])} ${f1(m[0])} ${f1(m[1])}`; });
    // Where it was squeezed: three points inside. The surface between each of them and the outline is a facet with a
    // tone of its own, which is what reads as crumpled; the creases are just a few of the facets' edges.
    const hubs = Array.from({ length: 3 }, (_, k) => { const a0 = k * 2.1 + r(); return [cx + Math.cos(a0) * (4 + r() * 6), cy + Math.sin(a0) * (4 + r() * 5)]; });
    const near = (p) => hubs.reduce((best, h, k) => (Math.hypot(p[0] - h[0], p[1] - h[1]) < Math.hypot(p[0] - hubs[best][0], p[1] - hubs[best][1]) ? k : best), 0);
    let shade = '', creases = '', lit = '';
    pts.forEach((pa, i) => {
      const pb = pts[(i + 1) % n], h = hubs[near(mid(pa, pb))], tone = r();
      if (tone > .35) shade += `<path class="pdFacet" style="opacity:${f1((tone - .35) * .9)}" d="M${f1(h[0])} ${f1(h[1])} L${f1(pa[0])} ${f1(pa[1])} L${f1(pb[0])} ${f1(pb[1])} Z"/>`;
      if (r() < .3) creases += `M${f1(h[0])} ${f1(h[1])} L${f1(pa[0])} ${f1(pa[1])} `;
    });
    hubs.forEach((h, k) => { const g = hubs[(k + 1) % 3]; creases += `M${f1(h[0])} ${f1(h[1])} L${f1(g[0])} ${f1(g[1])} `; });
    const hl = hubs[0], e = pts[Math.floor(r() * n)];
    lit = `M${f1(hl[0] + .8)} ${f1(hl[1] - .6)} L${f1(e[0] + .8)} ${f1(e[1] - .6)}`;
    // Scraps of the writing that was on the page, broken up by the crumpling, and sometimes a bit of highlighter.
    let scraps = '';
    for (let q = 0; q < 3 + Math.floor(r() * 3); q++) {
      const sx = cx - 13 + r() * 20, sy = cy - 12 + r() * 22, ang = (r() - .5) * 70;
      scraps += `<path class="pdInk" transform="rotate(${f1(ang)} ${f1(sx)} ${f1(sy)})" d="${scrib(sx, sy, 7 + r() * 9, r)}"/>`;
    }
    if (r() < .45) { const sx = cx - 10 + r() * 12, sy = cy - 6 + r() * 12; scraps = `<path class="pdHi" transform="rotate(${f1((r() - .5) * 60)} ${f1(sx)} ${f1(sy)})" d="M${f1(sx)} ${f1(sy)} q5 -1 ${f1(9 + r() * 5)} 0"/>` + scraps; }
    return at(x, y, 0, s, `<defs><radialGradient id="${id}g" cx="36%" cy="30%" r="78%"><stop offset="0" style="stop-color:var(--pd-face)"/><stop offset=".62" style="stop-color:var(--pd-face)"/><stop offset="1" style="stop-color:var(--pd-keel)"/></radialGradient>
      <clipPath id="${id}k"><path d="${d}"/></clipPath>${soft(id + 's')}</defs>
      <ellipse class="pdShadowSoft" cx="${cx + 2}" cy="${cy + R - 1}" rx="${R * .9}" ry="4.5" filter="url(#${id}s)"/>
      <path d="${d}" fill="url(#${id}g)"/>
      <g clip-path="url(#${id}k)">${scraps}${shade}<path class="pdCreaseLit" d="${lit}"/><path class="pdCrease2" d="${creases}"/></g>
      <path class="pdEdgeSoft" d="${d}"/>`);
  };
  const ballV = (i, x, y, s = 1) => crumple(x, y, s, Math.random() * 1e9 + i);
  // A small stack of pages, fanned a little, held with a paper clip, the top one written on and marked.
  const stack = (x, y, rot = 0, s = 1, seed = Math.random() * 1e9) => {
    const r = rng(Math.floor(seed)), id = uid('pdk'), W = 108, H = 80;
    const under = (dx, dy, a, cls) => `<g transform="translate(${dx} ${dy}) rotate(${a} ${W / 2} ${H / 2})"><path class="${cls}" d="${shape([[0, 0], [W, 1], [W - 1, H], [1, H - 1]], r, 1)}"/><path class="pdEdgeSoft" d="${shape([[0, 0], [W, 1], [W - 1, H], [1, H - 1]], r, 1)}"/></g>`;
    return at(x, y, rot, s, `<defs>${pageDefs(id)}</defs><rect x="8" y="12" width="${W}" height="${H}" rx="3" class="pdShadowSoft" filter="url(#${id}s)"/>
      ${under(5, 4, -4 - r() * 3, 'pdFar')}${under(2, 3, 2 + r() * 3, 'pdPaper2')}
      ${page(W, H, r, { lines: 4, mark: 1, curl: 14, id })}
      <path class="pdClip" d="M${W - 30} -6 v16 a4 4 0 0 0 8 0 v-19 a5.5 5.5 0 0 0 -11 0 v17"/>`);
  };
  // A strip torn from a page: one straight edge, one torn and fibrous, a line on it marked.
  const strip = (x, y, rot = 0, s = 1, seed = Math.random() * 1e9) => {
    const r = rng(Math.floor(seed)), id = uid('pdt'), W = 160;
    let torn = `M${W} 30`;
    for (let xx = W; xx > 0; xx -= 4 + r() * 5) torn += ` L${f1(xx)} ${f1(30 + (r() - .5) * 5)}`;
    torn += ' L0 33';
    const d = `M0 4 Q${W / 2} ${f1(1 + r() * 2)} ${W} 2 ${torn.replace(/^M/, 'L')} Z`;
    return at(x, y, rot, s, `<defs>${grad(id + 'g', 0, 0, 0, 1)}${soft(id + 's')}</defs>
      <path class="pdShadowSoft" d="${d}" transform="translate(3 5)" filter="url(#${id}s)"/>
      <path d="${d}" fill="url(#${id}g)"/>${marker(10, 19, 108, r)}<path class="pdInk" d="${scrib(10, 12, 140, r)}"/><path class="pdInk" d="${scrib(10, 20, 120, r)}"/>
      <path class="pdEdgeSoft" d="${d}"/><path class="pdTornFibre" d="${torn}"/>`);
  };
  // A sheet folded in half and lying half open: the left page flat, the right one lifting, its shade deepest at the fold.
  const folded = (x, y, rot = 0, s = 1, seed = Math.random() * 1e9) => {
    const r = rng(Math.floor(seed)), id = uid('pdf');
    let ink = '';
    for (let i = 0; i < 5; i++) { const yy = 20 + i * 12, len = (i === 4 ? .5 : .78 + r() * .16) * 44; if (i === 1) ink += marker(9, yy, len, r); ink += `<path class="pdInk" d="${scrib(9, yy, len, r)}"/>`; }
    const left = `M0 6 Q30 3 60 5 L60 96 Q30 97 1 98 Z`;
    const right = `M60 5 Q86 -6 116 -2 Q113 44 118 88 Q88 86 60 96 Z`;
    return at(x, y, rot, s, `<defs>${grad(id + 'l', 0, 0, 1, 0, 'var(--pd-face)', 'var(--pd-far)')}${grad(id + 'r', 0, 0, 1, 0, 'var(--pd-keel)', 'var(--pd-face)')}${soft(id + 's')}</defs>
      <path class="pdShadowSoft" d="M4 12 L64 12 L126 94 L6 104 Z" filter="url(#${id}s)"/>
      <path d="${left}" fill="url(#${id}l)"/>${ink}
      <path d="${right}" fill="url(#${id}r)"/><path class="pdInk" d="${scrib(70, 22, 34, r)} ${scrib(71, 34, 30, r)} ${scrib(71, 46, 36, r)}" opacity=".6"/>
      <path class="pdEdgeSoft" d="${left}"/><path class="pdEdgeSoft" d="${right}"/><path class="pdCrease2" d="M60 5 L60 96"/>`);
  };
  const ball = (x, y, s = 1) => crumple(x, y, s);
  const tiny = (x, y, rot, s) => at(x, y, rot, s, DART);
  // Four trails: a loop, an arc, a zigzag, and one that missed and ends in a crumpled ball.
  const TRAILS = [
    (w, h) => trail(w, h),
    (w, h) => `<path class="pdTrail" d="M4 ${h - 8} Q ${w * .5} ${-h * .3}, ${w - 34} ${h * .45}"/>${tiny(w - 50, h * .3, 32, .32)}`,
    (w, h) => `<path class="pdTrail" d="M4 ${h - 12} L ${w * .22} ${h * .3} L ${w * .4} ${h * .7} L ${w * .58} ${h * .25} L ${w * .74} ${h * .55} L ${w - 34} 18"/>${tiny(w - 46, -6, -8, .32)}`,
    (w, h) => `<path class="pdTrail" d="M4 14 C ${w * .3} 0, ${w * .55} 10, ${w * .7} ${h * .5} S ${w - 40} ${h - 16}, ${w - 38} ${h - 22}"/>${ballV(1, w - 44, h - 42, .6)}`,
  ];

  // A plane unfolded flat again: the dart's creases pressed into the sheet, each fold's facet lit or shaded as the
  // paper still wants to fold back, a corner still lifting, one line of the page marked. Hand-drawn edges throughout.
  const creased = (x, y, rot = -4, s = 1, seed = Math.random() * 1e9) => {
    const r = rng(Math.floor(seed)), id = uid('pdu'), W = 108, H = 138, M = W / 2;
    const outline = shape([[0, 0], [W, 1], [W - 1, H], [1, H - 1]], r, 1.3);
    const a = W * .5, b = W * .95;   // where the folds meet the centre line
    let ink = '';
    for (let i = 0; i < 6; i++) { const yy = 70 + i * 10.5, len = (i === 5 ? .4 : .7 + r() * .2) * (W - 26); if (i === 1) ink += marker(13, yy, len, r); ink += `<path class="pdInk" d="${scrib(13, yy, len, r)}"/>`; }
    // facets: the two top triangles fold toward you (lit), the wing flaps fold away (shaded), the keel strip mid.
    const facets = `
      <path class="pdFacet" style="opacity:.08" d="M0 0 L${M} ${a} L${M} 0 Z"/><path class="pdFacet" style="opacity:.3" d="M${W} 0 L${M} ${a} L${M} 0 Z"/>
      <path class="pdFacet" style="opacity:.24" d="M0 0 L${M} ${a} L0 ${W * .42} Z"/><path class="pdFacet" style="opacity:.04" d="M${W} 0 L${M} ${a} L${W} ${W * .42} Z"/>
      <path class="pdFacet" style="opacity:.18" d="M0 ${W * .42} L${M} ${b} L${M - 7} ${H} L0 ${H} Z"/><path class="pdFacet" style="opacity:.03" d="M${W} ${W * .42} L${M} ${b} L${M + 7} ${H} L${W} ${H} Z"/>`;
    const creases = `M${M} 0 L${M} ${H} M0 0 L${M} ${a} L${W} 0 M0 ${W * .42} L${M} ${b} L${W} ${W * .42} M${M - 7} ${H} L${M} ${b} L${M + 7} ${H}`;
    const lit = `M${M + .8} 1 L${M + .8} ${H - 1} M1.2 ${W * .42 + .8} L${M + .8} ${b + .8}`;
    const curl = `M${W - 1} ${H - 22} Q${W - 10} ${H - 14} ${W - 20} ${H} L${W - 1} ${H} Z`;
    return at(x, y, rot, s, `<defs>${pageDefs(id)}<clipPath id="${id}k"><path d="${outline}"/></clipPath></defs>
      <rect x="6" y="9" width="${W}" height="${H}" rx="3" class="pdShadowSoft" filter="url(#${id}s)"/>
      <path d="${outline}" fill="url(#${id}g)"/><g clip-path="url(#${id}k)">${facets}${ink}<path class="pdCreaseLit" d="${lit}"/><path class="pdCrease2" d="${creases}"/></g>
      <path class="pdCurlUnder" d="M${W - 1} ${H - 22} L${W - 20} ${H} L${W - 1} ${H} Z"/><path d="${curl}" fill="url(#${id}c)"/><path class="pdEdgeSoft" d="${curl}"/>
      <path class="pdEdgeSoft" d="${outline}"/>`);
  };
  // A crumpled page smoothed out again: flat, but the creases never leave, a web of them across the writing.
  const smoothed = (x, y, rot = 5, s = 1, seed = Math.random() * 1e9) => {
    const r = rng(Math.floor(seed)), id = uid('pdm'), W = 112, H = 138;
    const outline = shape([[0, 2], [W, 0], [W + 1, H - 1], [2, H]], r, 2.2);
    let ink = '';
    for (let i = 0; i < 8; i++) { const yy = 16 + i * 14, len = (i === 7 ? .5 : .74 + r() * .18) * (W - 24); if (i === 4) ink += marker(12, yy, len, r); ink += `<path class="pdInk" d="${scrib(12, yy, len, r)}"/>`; }
    const hubs = Array.from({ length: 4 }, () => [14 + r() * (W - 28), 16 + r() * (H - 32)]);
    let web = '', facets = '';
    hubs.forEach((h, k) => {
      for (let j = 0; j < 4; j++) { const a = r() * Math.PI * 2, L = 18 + r() * 40; web += `M${f1(h[0])} ${f1(h[1])} L${f1(h[0] + Math.cos(a) * L)} ${f1(h[1] + Math.sin(a) * L)} `; }
      const g = hubs[(k + 1) % 4]; web += `M${f1(h[0])} ${f1(h[1])} L${f1(g[0])} ${f1(g[1])} `;
      facets += `<path class="pdFacet" style="opacity:${f1(.06 + r() * .1)}" d="M${f1(h[0])} ${f1(h[1])} L${f1(g[0])} ${f1(g[1])} L${f1(h[0] + (r() - .5) * 50)} ${f1(h[1] + (r() - .5) * 50)} Z"/>`;
    });
    return at(x, y, rot, s, `<defs>${pageDefs(id)}<clipPath id="${id}k"><path d="${outline}"/></clipPath></defs><rect x="6" y="10" width="${W}" height="${H}" rx="3" class="pdShadowSoft" filter="url(#${id}s)"/>
      <path d="${outline}" fill="url(#${id}g)"/><g clip-path="url(#${id}k)">${ink}${facets}<path class="pdCrease2" d="${web}"/></g><path class="pdEdgeSoft" d="${outline}"/>`);
  };
  // Crumpled in a hurry: a ball with a corner of the page still flat, sticking out, the writing on it.
  const loose = (x, y, s = 1, seed = Math.random() * 1e9) => {
    const r = rng(Math.floor(seed)), id = uid('pdl');
    const flap = `M30 30 L60 10 L68 38 Z`;
    return at(x, y, 0, s, `<defs>${grad(id + 'f', 0, 0, 1, 1)}</defs>
      <path d="${flap}" fill="url(#${id}f)"/><path class="pdInk" d="${scrib(42, 20, 18, r)}" transform="rotate(-28 42 20)"/><path class="pdInk" d="${scrib(46, 27, 14, r)}" transform="rotate(-28 46 27)"/><path class="pdEdgeSoft" d="${flap}"/>
      ${crumple(4, 12, 1, seed + 7)}`);
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const jit = (n) => (Math.random() - .5) * 2 * n;
  // ---- Planes that look folded (2.38.4, David: "improve the look of your paper airplanes" and "add more variations").
  // Each plane is a set of facets. Every facet is drawn by hand like the paper (edges bowed a little, never ruled),
  // shaded from the edge the light catches to the side it turns away, with a lit line along each fold and a soft
  // blurred shadow on the desk. The biggest wing carries a few lines of the page it was folded from, and on the
  // `marked` ones a stroke of highlighter, since every plane here is an annotated page.
  const TONE = { face: ['var(--pd-face)', 'var(--pd-far)'], far: ['var(--pd-far)', 'var(--pd-keel)'], keel: ['var(--pd-keel)', 'var(--pd-deep)'] };
  const inkOn = ({ x, y, len, ang = 0, n = 2, gap = 6 }, r, marked) => {
    let s = '';
    for (let i = 0; i < n; i++) { const yy = y + i * gap, L = len * (i === n - 1 && n > 1 ? .62 : .88 + r() * .12); if (marked && i === 0) s += marker(x, yy, L * .8, r); s += `<path class="pdInk" d="${scrib(x, yy, L, r)}"/>`; }
    return `<g transform="rotate(${ang} ${x} ${y})">${s}</g>`;
  };
  const far = (pts) => pts.reduce((m, p) => (Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > Math.hypot(m[0] - pts[0][0], m[1] - pts[0][1]) ? p : m), pts[0]);
  const craft = (def, marked = false, { shadow = true, key = '' } = {}) => {
    const r = rng(Math.floor(Math.random() * 1e9)), id = uid('pdp');
    let defs = soft(id + 's'), body = '';
    def.facets.forEach((f, i) => {
      const [a, b] = TONE[f.tone], p0 = f.pts[0], p1 = far(f.pts);
      defs += `<linearGradient id="${id}g${i}" gradientUnits="userSpaceOnUse" x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}"><stop offset="0" style="stop-color:${a}"/><stop offset="1" style="stop-color:${b}"/></linearGradient>`;
      const d = shape(f.pts, r, .55);
      body += `<path d="${d}" fill="url(#${id}g${i})"/>`;
      if (f.ink) { defs += `<clipPath id="${id}k${i}"><path d="${d}"/></clipPath>`; body += `<g clip-path="url(#${id}k${i})">${inkOn(f.ink, r, marked)}</g>`; }
      // A firmer edge than the sheets': a plane is small and thin, and with the soft one it faded into the page.
      body += `<path class="pdEdge" d="${d}"/>`;
    });
    (def.folds || []).forEach(([p, q]) => { body += `<path class="pdCreaseLit" d="M${f1(p[0] + .5)} ${f1(p[1] - .7)} L${f1(q[0] + .5)} ${f1(q[1] - .7)}"/>`; });
    const [sx, sy, srx, sry] = def.shadow;
    return `<g data-pd-shape="${key}"><defs>${defs}</defs>${shadow ? `<ellipse class="pdShadowSoft" cx="${sx}" cy="${sy}" rx="${srx}" ry="${sry}" filter="url(#${id}s)"/>` : ''}${def.pre || ''}${body}</g>`;
  };
  // Nose to the right in every side view, so a pile reads as one fleet.
  const DEF = {
    dart: { facets: [{ tone: 'face', pts: [[108, 20], [20, 56], [55, 68]], ink: { x: 34, y: 56, len: 62, ang: -22 } }, { tone: 'keel', pts: [[108, 20], [55, 68], [66, 104]] }],
      folds: [[[108, 20], [55, 68]]], shadow: [62, 96, 44, 4.5] },
    glider: { facets: [{ tone: 'far', pts: [[116, 30], [8, 8], [60, 36]] }, { tone: 'face', pts: [[116, 30], [4, 52], [60, 38]], ink: { x: 22, y: 48, len: 80, ang: -11, gap: 5 } }, { tone: 'keel', pts: [[116, 30], [60, 38], [52, 54]] }],
      folds: [[[116, 30], [60, 38]]], shadow: [62, 72, 52, 4.5] },
    swallow: { facets: [{ tone: 'far', pts: [[116, 30], [16, 4], [44, 22], [30, 28]] }, { tone: 'face', pts: [[116, 30], [8, 58], [38, 42], [22, 36]], ink: { x: 30, y: 47, len: 70, ang: -13, gap: 5 } }, { tone: 'keel', pts: [[116, 30], [38, 42], [50, 58]] }],
      folds: [[[116, 30], [38, 42]]], shadow: [60, 76, 48, 4.5] },
    stunt: { facets: [{ tone: 'far', pts: [[116, 32], [22, 8], [62, 30]] }, { tone: 'far', pts: [[22, 8], [16, -4], [30, 10]] }, { tone: 'face', pts: [[116, 32], [10, 62], [62, 44]], ink: { x: 28, y: 56, len: 76, ang: -16, gap: 5 } },
      { tone: 'keel', pts: [[10, 62], [4, 46], [18, 58]] }, { tone: 'keel', pts: [[116, 32], [62, 44], [64, 62]] }], folds: [[[116, 32], [62, 44]]], shadow: [62, 80, 50, 4.5] },
    lock: { facets: [{ tone: 'face', pts: [[112, 24], [104, 36], [20, 58], [56, 70]], ink: { x: 36, y: 60, len: 58, ang: -18 } }, { tone: 'keel', pts: [[104, 36], [56, 70], [66, 104]] }, { tone: 'far', pts: [[112, 24], [96, 26], [104, 36]] }],
      folds: [[[104, 36], [56, 70]]], shadow: [60, 96, 44, 4.5] },
    // New: long and thin, built for distance.
    needle: { facets: [{ tone: 'far', pts: [[124, 34], [14, 22], [66, 35]] }, { tone: 'face', pts: [[124, 34], [8, 46], [66, 37]], ink: { x: 20, y: 43, len: 88, ang: -6, n: 1 } }, { tone: 'keel', pts: [[124, 34], [66, 37], [44, 50]] }],
      folds: [[[124, 34], [66, 37]]], shadow: [66, 60, 56, 3.5] },
    // New: a hammerhead, its nose folded into a blunt block.
    hammer: { facets: [{ tone: 'far', pts: [[104, 22], [30, 6], [70, 32]] }, { tone: 'face', pts: [[106, 36], [12, 60], [66, 42]], ink: { x: 26, y: 55, len: 70, ang: -15, gap: 5 } }, { tone: 'keel', pts: [[106, 36], [66, 42], [72, 60]] },
      { tone: 'face', pts: [[118, 27], [118, 35], [106, 36], [98, 29], [104, 22]] }], folds: [[[106, 36], [66, 42]], [[104, 22], [106, 36]]], shadow: [66, 80, 50, 4.5] },
    // New: seen from above, both wings spread, the keel a strip down the middle.
    topDown: { facets: [{ tone: 'far', pts: [[124, 46], [18, 6], [34, 44]] }, { tone: 'face', pts: [[124, 46], [18, 86], [34, 48]], ink: { x: 38, y: 60, len: 58, ang: 19, gap: 6 } }, { tone: 'keel', pts: [[124, 46], [34, 44], [26, 46], [34, 48]] }],
      folds: [[[34, 46], [124, 46]]], shadow: [76, 104, 50, 4.5] },
    // New: head on, coming straight at you, wings in a shallow V over the keel.
    headOn: { facets: [{ tone: 'keel', pts: [[62, 44], [55, 45], [62, 80], [69, 45]] }, { tone: 'far', pts: [[60, 44], [4, 22], [8, 32], [57, 49]] }, { tone: 'face', pts: [[64, 44], [120, 22], [116, 32], [67, 49]] }],
      folds: [[[62, 45], [62, 78]]], shadow: [62, 98, 36, 4] },
  };
  const craftAt = (key) => (x, y, rot = 0, s = 1, marked = false) => at(x, y, rot, s, craft(DEF[key], marked, { key }));
  const plane = craftAt('dart'), glider = craftAt('glider'), swallow = craftAt('swallow'), stunt = craftAt('stunt'), lockPlane = craftAt('lock');
  const needle = craftAt('needle'), hammer = craftAt('hammer'), topDown = craftAt('topDown'), headOn = craftAt('headOn');
  // Banking hard, seen a little from below, with the rush of air behind it (its underside lit, its top in shade).
  const banking = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<path class="pdTrail" d="M2 64 L34 60 M8 76 L36 72 M16 52 L40 50"/>
    <g transform="translate(24 -6) rotate(-24 60 60)">${craft({ ...DEF.dart, facets: [{ tone: 'keel', pts: DEF.dart.facets[0].pts }, { tone: 'face', pts: DEF.dart.facets[1].pts }] }, false, { shadow: false, key: 'banking' })}</g>`);
  // Landed nose first: a dart standing on its nose, tail up.
  const landed = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<ellipse class="pdShadow" cx="30" cy="104" rx="22" ry="4"/>
    <g transform="rotate(58 60 60)">${craft(DEF.dart, true, { shadow: false, key: 'landed' })}</g>`);
  // New: two flying together, one a little behind the other, their trails running side by side.
  const pair = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<g data-pd-shape="pair"><path class="pdTrail" d="M2 70 C 30 66, 44 50, 70 46 M4 50 C 30 44, 60 20, 92 18"/></g>
    ${at(60, 30, -6, .5, craft(DEF.dart, false, { key: 'pair' }))}${at(84, -2, -10, .56, craft(DEF.glider, true, { key: 'pair' }))}`);
  const SHAPES = {
    dart: [120, 110, (m) => plane(0, -4, 6 + jit(10), 1, m)], glider: [130, 80, (m) => glider(4, 4, jit(8), 1, m)], swallow: [130, 90, (m) => swallow(4, 6, jit(8), 1, m)],
    stunt: [130, 96, (m) => stunt(4, 10, jit(8), 1, m)], lock: [120, 116, (m) => lockPlane(0, -2, 4 + jit(8), 1, m)], needle: [138, 70, (m) => needle(2, 4, jit(6), 1, m)],
    hammer: [134, 92, (m) => hammer(2, 6, jit(8), 1, m)], topDown: [132, 112, (m) => topDown(2, 2, jit(8), 1, m)], headOn: [126, 106, (m) => headOn(2, 2, jit(6), 1, m)],
    banking: [150, 100, () => banking(0, 0, 0, 1)], landed: [110, 120, () => landed(20, 8, 0, 1)], pair: [160, 96, () => pair(4, 10, 0, 1)],
  };
  // Side views, the ones that lie well in a pile or a corner.
  const FLEET = ['dart', 'glider', 'swallow', 'stunt', 'lock', 'needle', 'hammer'];
  const SIDE = { dart: plane, glider, swallow, stunt, lock: lockPlane, needle, hammer };

  // Choosing a plane, so the same one is not always shown (David, 2026-09-29: two alike on one page). A plane already on
  // the page, or drawn in the last moment and not yet placed, is left out; among the rest, the ones this browser has
  // not shown lately are much likelier (the last 24 shown, kept in localStorage). /paper.html draws every one on
  // purpose, inside `exact`.
  const SEEN = 'annotated-pd-seen';
  let exactly = false, lately = [];
  const seen = () => { try { const v = JSON.parse(localStorage.getItem(SEEN) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const shown = (k) => {
    lately.push([k, Date.now()]);
    if (exactly) return;
    try { const s = seen().filter((x) => x !== k); s.push(k); localStorage.setItem(SEEN, JSON.stringify(s.slice(-24))); } catch { /* no storage */ }
  };
  const taken = () => {
    const now = Date.now(); lately = lately.filter(([, t]) => now - t < 2000);
    const s = new Set(lately.map(([k]) => k));
    try { document.querySelectorAll('[data-pd-shape]').forEach((e) => s.add(e.dataset.pdShape)); } catch { /* no page */ }
    return s;
  };
  function choose(pool = Object.keys(SHAPES), avoid = []) {
    if (exactly) { const k = pick(pool); shown(k); return k; }
    const t = taken(); avoid.forEach((k) => t.add(k));
    let open = pool.filter((k) => !t.has(k)); if (!open.length) open = pool;
    const s = seen();
    // A page draws several planes, so the last visit's are the last few shown: those six are left out while at least
    // two others remain, or one spot showed the same plane on two visits running.
    const recent = new Set(s.slice(-6)), fresh = open.filter((k) => !recent.has(k));
    if (fresh.length >= 2) open = fresh;
    // Weight by how long ago it was last shown here: never, or long ago, counts most; the last one shown hardly at all.
    const w = open.map((k) => { const i = s.lastIndexOf(k); return i < 0 ? 36 : Math.min(36, (s.length - i) ** 2); });
    let x = Math.random() * w.reduce((a, b) => a + b, 0), k = open[open.length - 1];
    for (let i = 0; i < open.length; i++) { x -= w[i]; if (x < 0) { k = open[i]; break; } }
    shown(k);
    return k;
  }
  const drawShape = (k, marked = Math.random() < .6) => { const [w, h, fn] = SHAPES[k]; return svg(w, h, fn(marked)); };
  // A named plane (the Feed heading's, say) draws itself unless it is already on the page, and then another one.
  const named = (k) => () => { const kk = exactly || !taken().has(k) ? (shown(k), k) : choose(); return drawShape(kk); };
  const fleetAt = (x, y, r, s, marked) => SIDE[choose(FLEET)](x, y, r, s, marked);
  // A pile laid out fresh each visit: two to four things from the set, in slots across the box.
  const PIECES = [
    (x, y, r) => fleetAt(x, y, r, .85 + jit(.1), Math.random() < .5),
    (x, y, r) => fleetAt(x, y, r, .85 + jit(.1), Math.random() < .5),
    (x, y) => ballV(Math.floor(Math.random() * 3), x + 20, y + 30, .85 + jit(.1)),
    (x, y, r) => halfFold(x + 10, y - 6, r * .5, .6),
    (x, y) => { if (taken().has('landed')) return fleetAt(x, y, 0, .8, false); shown('landed'); return landed(x + 10, y - 20, 0, .75); },
    (x, y, r) => fleetAt(x, y, r, .82 + jit(.1), Math.random() < .5),
    (x, y, r) => fleetAt(x, y, r, .82 + jit(.1), Math.random() < .5),
    (x, y) => loose(x + 14, y + 8, .8),
  ];
  const pile = () => {
    const slots = [[-6, 44, 16], [70, 30, -6], [30, 2, -30], [176, 88, 0]].sort(() => Math.random() - .5).slice(0, 2 + Math.floor(Math.random() * 3));
    return svg(250, 150, slots.map(([x, y, r]) => pick(PIECES)(x + jit(8), y + jit(6), r + jit(10))).join(''));
  };
  const ART = {
    pile,
    sheet: () => svg(150, 175, sheet(12, 10, -7 + jit(4))),
    halfFold: () => svg(110, 140, halfFold(10, 8, -6 + jit(6), 1)),
    stack: () => svg(140, 110, stack(8, 6, jit(5), 1)),
    strip: () => svg(180, 60, strip(6, 6, -4 + jit(4), 1)),
    folded: () => svg(140, 116, folded(8, 8, jit(5), 1)),
    ball: () => svg(64, 56, ballV(Math.floor(Math.random() * 3), 6, 2, 1)),
    // A wastepaper basket, woven wire, drawn in the paper's own ink (the bin a deleted annotation is crumpled into).
    bin: () => svg(70, 76, `<ellipse class="pdShadow" cx="35" cy="72" rx="26" ry="3.5"/>
      <path class="pdFar" d="M8 12 L62 12 L55 70 L15 70 Z"/>
      <path class="pdCrease2" d="M14 12 L20 70 M22 12 L25 70 M30 12 L30 70 M38 12 L35 70 M46 12 L40 70 M54 12 L45 70 M10 26 L60 26 M11 40 L58 40 M13 54 L57 54"/>
      <path class="pdEdge" d="M8 12 L62 12 L55 70 L15 70 Z"/><ellipse class="pdFace" cx="35" cy="12" rx="27" ry="4.5"/><ellipse class="pdEdge" cx="35" cy="12" rx="27" ry="4.5" style="fill:none"/>`, 'pdBin'),
    trail: () => svg(220, 90, pick(TRAILS)(220, 90)),
    // Any plane: one not on the page and not shown here lately (`choose`).
    lone: () => drawShape(choose()),
    // Beside the Feed heading: a plane in flight, chosen the same way (it repeated one while the margins changed).
    heading: () => drawShape(choose(['dart', 'glider', 'swallow', 'stunt', 'lock', 'needle', 'hammer', 'topDown', 'banking', 'pair'])),
    dart: named('dart'), glider: named('glider'), swallow: named('swallow'), stunt: named('stunt'), lock: named('lock'), banking: named('banking'),
    needle: named('needle'), hammer: named('hammer'), topDown: named('topDown'), headOn: named('headOn'), pair: named('pair'), landed: named('landed'),
    creased: () => svg(128, 156, creased(10, 8, -4 + jit(5), 1)),
    smoothed: () => svg(136, 164, smoothed(10, 8, 4 + jit(5), 1)),
    loose: () => svg(84, 76, loose(6, 2, 1)),
    // The panel's quiet corner: two or three small things, chosen fresh each time.
    corner: () => pick([
      () => svg(170, 90, fleetAt(40, 0, -6, .72, true) + fleetAt(-6, 16, 20, .6) + ball(122, 46, .62)),
      () => svg(170, 90, fleetAt(10, 14, -4, .7, true) + ballV(2, 118, 40, .66)),
      () => svg(170, 90, halfFold(20, 2, -8, .52) + fleetAt(66, 18, 10, .62, true) + ballV(0, 130, 46, .56)),
      () => svg(170, 90, strip(4, 30, -6, .7) + fleetAt(104, 22, -8, .52, false)),
      () => svg(170, 90, stack(10, 12, -4, .62) + fleetAt(90, 10, -12, .6)),
      () => svg(170, 90, fleetAt(6, 20, -4, .7, true) + loose(116, 26, .6)),
      () => svg(170, 90, creased(8, -4, -8, .5) + fleetAt(70, 26, 6, .66, true)),
      () => svg(170, 90, fleetAt(24, -6, -8, .66, true) + ballV(1, 120, 44, .6)),
      () => svg(170, 90, pair(10, 0, 0, .8) + ballV(2, 126, 46, .56)),
    ])(),
  };
  // A trail that always ends in a plane, the plane marked `pdFlyer` so the home page can send it off (landing.js).
  ART.flyTrail = () => svg(220, 90, TRAILS[Math.floor(Math.random() * 3)](220, 90).replace(/(<g transform="[^"]*">)(?![\s\S]*<g transform)([\s\S]*<\/g>)/, '<g class="pdFlyer">$1$2</g>'));
  const make = (name, cls = '') => { const d = document.createElement('div'); d.className = `pd pd-${name} ${cls}`.trim(); d.dataset.pdKind = name; d.setAttribute('aria-hidden', 'true'); d.innerHTML = ART[name](); return d; };

  // The margins of a full page (feed, profile, an annotation): something low on the left, something high on the
  // right and often a trail, each chosen and placed fresh on every visit, so pages do not look alike.
  // A kind of drawing not already on the page (nor in `also`), or any of them if every one is taken.
  function free(list, also = []) {
    const used = new Set([...document.querySelectorAll('[data-pd-kind]')].map((e) => e.dataset.pdKind).concat(also));
    const open = list.filter((k) => !used.has(k));
    return pick(open.length ? open : list);
  }
  function desk(root = document.body) {
    if (!root || root.querySelector(':scope > .pdDesk')) return;
    const d = document.createElement('div'); d.className = 'pdDesk'; d.setAttribute('aria-hidden', 'true');
    // Planes in the margins (David, 2026-09-29): a folded-open sheet on the right "doesn't really work with the rest
    // of the theme", so both sides are planes now, a pile on the left or one of the darts, a single plane on the right.
    // No drawing twice on one page: the Feed heading's plane and the two margins each take a kind not already shown
    // (David, 2026-09-29: the same banking plane beside the heading and in the margin).
    // Which plane each shows is decided by `choose`, so the two margins, the Feed heading and anything else on the page
    // are never the same plane, whatever their kind (David, 2026-09-29: the same swallow top right and bottom left).
    const left = make(pick(['pile', 'pile', 'lone']), 'pdL');
    const right = make('lone', 'pdR');
    left.style.setProperty('--pdy', Math.round(30 + Math.random() * 90) + 'px');
    right.style.setProperty('--pdy', Math.round(90 + Math.random() * 160) + 'px');
    d.append(left, right);
    if (Math.random() < .7) { const t = make('trail', 'pdT'); t.style.setProperty('--pdy', Math.round(180 + Math.random() * 120) + 'px'); d.appendChild(t); }
    root.appendChild(d);
  }
  // An empty list: a small drawing above the words saying why it is empty, one of several.
  const emptyArt = () => pick([() => ART.ball() + ART.lone(), () => ART.strip(), () => ART.halfFold(), () => ART.ball() + ART.ball(), () => ART.loose() + ART.lone(), () => ART.creased(), () => ART.smoothed()])();
  function empty(el) {
    if (!el || el.querySelector('.pdEmpty')) return;
    const d = document.createElement('div'); d.className = 'pdEmpty'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML = emptyArt();
    el.prepend(d);
  }
  // Every drawing exactly as asked, repeats and all, for /paper.html.
  const exact = (fn) => { exactly = true; try { return fn(); } finally { exactly = false; } };
  return { make, desk, free, empty, emptyArt, ART, rule, arrival, waiting, choose, exact, SHAPES: Object.keys(SHAPES) };
})();

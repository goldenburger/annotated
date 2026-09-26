// Paper on the desk (David, 2026-09-25): small drawings in annotated's own paper and ink that sit in the empty
// margins and quiet corners of its pages, the same paper the planes are folded from. A pile of folded planes, a
// sheet half folded with one line marked, a crumpled ball, a plane leaving a dashed trail. They are drawings
// only: aria-hidden, no pointer events, no motion of their own, and gone where there is no room for them.
var PaperDeco = (() => {
  // One dart, resting, nose to the right, drawn about 110 by 60. Its wing carries a few lines of print and, on the
  // `marked` ones, a stroke of highlighter, since every plane here is folded from an annotated page.
  // The same dart as annotated's own mark (brand.js): a wing and a keel meeting at the nose, top right.
  const plane = (x, y, rot = 0, s = 1, marked = false) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <ellipse class="pdShadow" cx="62" cy="92" rx="46" ry="6"/>
    <path class="pdFace" d="M108 20 L20 56 L55 68 Z"/>
    <path class="pdKeel" d="M108 20 L55 68 L66 104 Z"/>
    <path class="pdLine" d="M44 52 L84 36 M40 58 L70 46"/>
    ${marked ? '<path class="pdMark" d="M48 55 L86 40"/>' : ''}
    <path class="pdEdge" d="M108 20 L20 56 L55 68 Z M108 20 L66 104 L55 68"/>
  </g>`;
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
  const at = (x, y, rot, s, body) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${body}</g>`;

  // More of them (David, 2026-09-25: the same few were showing up too often).
  // A glider: long straight wings and a short keel, about 120 by 60.
  const glider = (x, y, rot = 0, s = 1, marked = false) => at(x, y, rot, s, `<ellipse class="pdShadow" cx="62" cy="70" rx="54" ry="6"/>
    <path class="pdFar" d="M116 30 L8 8 L60 36 Z"/><path class="pdFace" d="M116 30 L4 52 L60 38 Z"/><path class="pdKeel" d="M116 30 L60 38 L52 54 Z"/>
    <path class="pdLine" d="M30 46 L78 38"/>${marked ? '<path class="pdMark" d="M34 44 L80 36"/>' : ''}
    <path class="pdEdge" d="M116 30 L4 52 L60 38 Z M116 30 L8 8 L60 36 M60 38 L52 54 L116 30"/>`);
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
  // Landed nose first: a dart standing on its nose, tail up.
  const landed = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<ellipse class="pdShadow" cx="30" cy="104" rx="22" ry="4"/>
    <g transform="rotate(58 60 60)">${DART}</g>`);
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

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const jit = (n) => (Math.random() - .5) * 2 * n;
  // A pile laid out fresh each visit: two to four things from the set, in slots across the box.
  const PIECES = [
    (x, y, r) => plane(x, y, r, .9 + jit(.1), Math.random() < .5),
    (x, y, r) => glider(x, y, r, .8 + jit(.1), Math.random() < .5),
    (x, y) => ballV(Math.floor(Math.random() * 3), x + 20, y + 30, .85 + jit(.1)),
    (x, y, r) => halfFold(x + 10, y - 6, r * .5, .6),
    (x, y) => landed(x + 10, y - 20, 0, .75),
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
    trail: () => svg(220, 90, pick(TRAILS)(220, 90)),
    lone: () => pick([() => svg(120, 110, plane(0, -4, 6 + jit(10), 1, true)), () => svg(130, 80, glider(4, 4, jit(8), 1, true)), () => svg(110, 120, landed(20, 8, 0, 1))])(),
    // The panel's quiet corner: two or three small things, chosen fresh each time.
    corner: () => pick([
      () => svg(170, 90, plane(40, 0, -6, .72, true) + plane(-6, 16, 20, .6) + ball(122, 46, .62)),
      () => svg(170, 90, glider(10, 14, -4, .7, true) + ballV(2, 118, 40, .66)),
      () => svg(170, 90, halfFold(20, 2, -8, .52) + plane(66, 18, 10, .62, true) + ballV(0, 130, 46, .56)),
      () => svg(170, 90, strip(4, 30, -6, .7) + landed(116, 6, 0, .55)),
      () => svg(170, 90, stack(10, 12, -4, .62) + plane(90, 10, -12, .6)),
    ])(),
  };
  // A trail that always ends in a plane, the plane marked `pdFlyer` so the home page can send it off (landing.js).
  ART.flyTrail = () => svg(220, 90, TRAILS[Math.floor(Math.random() * 3)](220, 90).replace(/(<g transform="[^"]*">)(?![\s\S]*<g transform)([\s\S]*<\/g>)/, '<g class="pdFlyer">$1$2</g>'));
  const make = (name, cls = '') => { const d = document.createElement('div'); d.className = `pd pd-${name} ${cls}`.trim(); d.setAttribute('aria-hidden', 'true'); d.innerHTML = ART[name](); return d; };

  // The margins of a full page (feed, profile, an annotation): something low on the left, something high on the
  // right and often a trail, each chosen and placed fresh on every visit, so pages do not look alike.
  function desk(root = document.body) {
    if (!root || root.querySelector(':scope > .pdDesk')) return;
    const d = document.createElement('div'); d.className = 'pdDesk'; d.setAttribute('aria-hidden', 'true');
    const left = make(pick(['pile', 'pile', 'stack', 'strip', 'lone']), 'pdL');
    const right = make(pick(['sheet', 'halfFold', 'folded', 'stack', 'ball']), 'pdR');
    left.style.setProperty('--pdy', Math.round(30 + Math.random() * 90) + 'px');
    right.style.setProperty('--pdy', Math.round(90 + Math.random() * 160) + 'px');
    d.append(left, right);
    if (Math.random() < .7) { const t = make('trail', 'pdT'); t.style.setProperty('--pdy', Math.round(180 + Math.random() * 120) + 'px'); d.appendChild(t); }
    root.appendChild(d);
  }
  // An empty list: a small drawing above the words saying why it is empty, one of several.
  const emptyArt = () => pick([() => ART.ball() + ART.lone(), () => ART.strip(), () => ART.halfFold(), () => ART.ball() + ART.ball()])();
  function empty(el) {
    if (!el || el.querySelector('.pdEmpty')) return;
    const d = document.createElement('div'); d.className = 'pdEmpty'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML = emptyArt();
    el.prepend(d);
  }
  return { make, desk, empty, emptyArt, ART, rule, arrival, waiting };
})();

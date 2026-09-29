// Paper on the desk (David, 2026-09-25): small drawings in annotated's own paper and ink that sit in the empty
// margins and quiet corners of its pages, the same paper the planes are folded from. A pile of folded planes, a
// sheet half folded with one line marked, a crumpled ball, a plane leaving a dashed trail. They are drawings
// only: aria-hidden, no pointer events, no motion of their own, and gone where there is no room for them.
var PaperDeco = (() => {
  // One dart, resting, nose to the right, drawn about 110 by 60. Its wing carries a few lines of print and, on the
  // `marked` ones, a stroke of highlighter, since every plane here is folded from an annotated page.
  // The same dart as annotated's own mark (brand.js): a wing and a keel meeting at the nose, top right.
  const plane = (x, y, rot = 0, s = 1, marked = false) => at(x, y, rot, s, `
    <ellipse class="pdShadow" cx="62" cy="92" rx="46" ry="6"/>
    <path class="pdFace" d="M108 20 L20 56 L55 68 Z"/>
    <path class="pdKeel" d="M108 20 L55 68 L66 104 Z"/>
    <path class="pdLine" d="M44 52 L84 36 M40 58 L70 46"/>
    ${marked ? '<path class="pdMark" d="M48 55 L86 40"/>' : ''}
    <path class="pdEdge" d="M108 20 L20 56 L55 68 Z M108 20 L66 104 L55 68"/>`);
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

  // ---- More planes and more paper (David, 2026-09-28: "draw more versions of our paper planes, unfolding
  // animations, crumpled paper so you have more assets to design our pages with").
  // A swallow: swept wings with a forked tail, nose to the right.
  const swallow = (x, y, rot = 0, s = 1, marked = false) => at(x, y, rot, s, `<ellipse class="pdShadow" cx="60" cy="74" rx="50" ry="5"/>
    <path class="pdFar" d="M116 30 L16 4 L44 22 L30 28 Z"/><path class="pdFace" d="M116 30 L8 58 L38 42 L22 36 Z"/><path class="pdKeel" d="M116 30 L38 42 L50 58 Z"/>
    <path class="pdLine" d="M40 44 L86 34"/>${marked ? '<path class="pdMark" d="M42 42 L88 32"/>' : ''}
    <path class="pdEdge" d="M116 30 L8 58 L38 42 L22 36 Z M116 30 L16 4 L44 22 L30 28 M38 42 L50 58 L116 30"/>`);
  // A stunt plane: a wide delta with its wingtips turned up.
  const stunt = (x, y, rot = 0, s = 1, marked = false) => at(x, y, rot, s, `<ellipse class="pdShadow" cx="62" cy="78" rx="52" ry="6"/>
    <path class="pdFar" d="M116 32 L22 8 L62 30 Z"/><path class="pdFar" d="M22 8 L16 -4 L30 10 Z"/>
    <path class="pdFace" d="M116 32 L10 62 L62 44 Z"/><path class="pdKeel" d="M10 62 L4 46 L18 58 Z"/><path class="pdKeel" d="M116 32 L62 44 L64 62 Z"/>
    <path class="pdLine" d="M32 54 L84 40"/>${marked ? '<path class="pdMark" d="M36 52 L86 38"/>' : ''}
    <path class="pdEdge" d="M116 32 L10 62 L62 44 Z M10 62 L4 46 L18 58 M116 32 L22 8 L62 30 M22 8 L16 -4 L30 10 M62 44 L64 62 L116 32"/>`);
  // A nose-lock plane: its point folded back into a blunt nose, sturdier and slower.
  const lockPlane = (x, y, rot = 0, s = 1, marked = false) => at(x, y, rot, s, `<ellipse class="pdShadow" cx="60" cy="92" rx="46" ry="6"/>
    <path class="pdFace" d="M112 24 L104 36 L20 58 L56 70 Z"/><path class="pdKeel" d="M104 36 L56 70 L66 104 Z"/><path class="pdFar" d="M112 24 L96 26 L104 36 Z"/>
    <path class="pdLine" d="M44 54 L84 40 M40 60 L70 49"/>${marked ? '<path class="pdMark" d="M48 57 L86 43"/>' : ''}
    <path class="pdEdge" d="M112 24 L104 36 L20 58 L56 70 Z M104 36 L66 104 L56 70 M112 24 L96 26 L104 36"/>`);
  // Banking hard, seen a little from below, with the rush of air behind it.
  const banking = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<path class="pdTrail" d="M2 64 L34 60 M8 76 L36 72 M16 52 L40 50"/>
    <g transform="translate(24 -6) rotate(-24 60 60)"><path class="pdKeel" d="M108 20 L20 56 L55 68 Z"/><path class="pdFace" d="M108 20 L55 68 L66 104 Z"/><path class="pdEdge" d="M108 20 L20 56 L55 68 Z M108 20 L66 104 L55 68"/></g>`);
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
  // A pile laid out fresh each visit: two to four things from the set, in slots across the box.
  const PIECES = [
    (x, y, r) => plane(x, y, r, .9 + jit(.1), Math.random() < .5),
    (x, y, r) => glider(x, y, r, .8 + jit(.1), Math.random() < .5),
    (x, y) => ballV(Math.floor(Math.random() * 3), x + 20, y + 30, .85 + jit(.1)),
    (x, y, r) => halfFold(x + 10, y - 6, r * .5, .6),
    (x, y) => landed(x + 10, y - 20, 0, .75),
    (x, y, r) => swallow(x, y, r, .85 + jit(.1), Math.random() < .5),
    (x, y, r) => stunt(x, y, r, .8 + jit(.1), Math.random() < .5),
    (x, y, r) => lockPlane(x, y, r, .8 + jit(.1), Math.random() < .5),
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
    lone: () => pick([() => svg(120, 110, plane(0, -4, 6 + jit(10), 1, true)), () => svg(130, 80, glider(4, 4, jit(8), 1, true)), () => svg(110, 120, landed(20, 8, 0, 1)),
      () => svg(130, 90, swallow(4, 6, jit(8), 1, true)), () => svg(130, 96, stunt(4, 10, jit(8), 1, true)), () => svg(120, 116, lockPlane(0, -2, 4 + jit(8), 1, true)), () => svg(150, 100, banking(0, 0, 0, 1))])(),
    swallow: () => svg(130, 90, swallow(4, 6, jit(8), 1, Math.random() < .6)),
    stunt: () => svg(130, 96, stunt(4, 10, jit(8), 1, Math.random() < .6)),
    lock: () => svg(120, 116, lockPlane(0, -2, 4 + jit(8), 1, Math.random() < .6)),
    banking: () => svg(150, 100, banking(0, 0, 0, 1)),
    creased: () => svg(128, 156, creased(10, 8, -4 + jit(5), 1)),
    smoothed: () => svg(136, 164, smoothed(10, 8, 4 + jit(5), 1)),
    loose: () => svg(84, 76, loose(6, 2, 1)),
    // The panel's quiet corner: two or three small things, chosen fresh each time.
    corner: () => pick([
      () => svg(170, 90, plane(40, 0, -6, .72, true) + plane(-6, 16, 20, .6) + ball(122, 46, .62)),
      () => svg(170, 90, glider(10, 14, -4, .7, true) + ballV(2, 118, 40, .66)),
      () => svg(170, 90, halfFold(20, 2, -8, .52) + plane(66, 18, 10, .62, true) + ballV(0, 130, 46, .56)),
      () => svg(170, 90, strip(4, 30, -6, .7) + landed(116, 6, 0, .55)),
      () => svg(170, 90, stack(10, 12, -4, .62) + plane(90, 10, -12, .6)),
      () => svg(170, 90, swallow(6, 20, -4, .7, true) + loose(116, 26, .6)),
      () => svg(170, 90, creased(8, -4, -8, .5) + stunt(70, 26, 6, .66, true)),
      () => svg(170, 90, lockPlane(24, -6, -8, .66, true) + ballV(1, 120, 44, .6)),
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
    // Planes in the margins (David, 2026-09-29): a folded-open sheet on the right "doesn't really work with the rest
    // of the theme", so both sides are planes now, a pile on the left or one of the darts, a single plane on the right.
    const left = make(pick(['pile', 'pile', 'lone', 'swallow', 'stunt']), 'pdL');
    const right = make(pick(['lone', 'swallow', 'stunt', 'lock', 'banking']), 'pdR');
    left.style.setProperty('--pdy', Math.round(30 + Math.random() * 90) + 'px');
    right.style.setProperty('--pdy', Math.round(90 + Math.random() * 160) + 'px');
    d.append(left, right);
    if (Math.random() < .7) { const t = make('trail', 'pdT'); t.style.setProperty('--pdy', Math.round(180 + Math.random() * 120) + 'px'); d.appendChild(t); }
    root.appendChild(d);
  }
  // An empty list: a small drawing above the words saying why it is empty, one of several.
  const emptyArt = () => pick([() => ART.ball() + ART.lone(), () => ART.strip(), () => ART.halfFold(), () => ART.ball() + ART.ball(), () => ART.loose() + ART.swallow(), () => ART.creased(), () => ART.smoothed()])();
  function empty(el) {
    if (!el || el.querySelector('.pdEmpty')) return;
    const d = document.createElement('div'); d.className = 'pdEmpty'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML = emptyArt();
    el.prepend(d);
  }
  return { make, desk, empty, emptyArt, ART, rule, arrival, waiting };
})();

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
  // A sheet crumpled into a ball, a few facets and creases.
  const ball = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse class="pdShadow" cx="25" cy="46" rx="23" ry="5"/>
    <path class="pdFace" d="M8 19 L13 9 L22 4 L33 6 L41 10 L47 20 L46 31 L40 40 L30 45 L18 44 L9 37 L5 28 Z"/>
    <path class="pdKeel" d="M13 9 L21 18 L8 19 Z M47 20 L37 23 L46 31 Z M18 44 L24 33 L30 45 Z M5 28 L14 29 L9 37 Z"/>
    <path class="pdEdge" d="M8 19 L13 9 L22 4 L33 6 L41 10 L47 20 L46 31 L40 40 L30 45 L18 44 L9 37 L5 28 Z M13 9 L21 18 L8 19 M21 18 L33 6 M21 18 L27 25 L37 23 L47 20 M37 23 L46 31 M27 25 L24 33 L30 45 M24 33 L18 44 M24 33 L14 29 L5 28 M14 29 L9 37 M27 25 L14 29"/>
  </g>`;
  // A sheet with its top corner folded down, the first fold of a dart, print on it and one line marked.
  const sheet = (x, y, rot = -6, s = 1) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <rect class="pdShadow" x="6" y="8" width="118" height="152" rx="2"/>
    <path class="pdFace" d="M0 0 L78 0 L120 42 L120 150 L0 150 Z"/>
    <path class="pdLine" d="M14 22 L64 22 M14 34 L70 34 M14 58 L104 58 M14 70 L98 70 M14 82 L104 82 M14 94 L86 94 M14 118 L100 118 M14 130 L70 130"/>
    <path class="pdMark" d="M14 70 L98 70"/>
    <path class="pdFold" d="M78 0 L120 42 L78 42 Z"/>
    <path class="pdCrease" d="M78 0 L120 42"/>
    <path class="pdEdge" d="M0 0 L78 0 L120 42 L120 150 L0 150 Z M78 0 L78 42 L120 42"/>
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
  // Half folded: a sheet with both top corners brought in to a point, the first two folds of a dart.
  const halfFold = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<rect class="pdShadow" x="6" y="10" width="84" height="110" rx="2"/>
    <path class="pdFace" d="M0 42 L42 0 L84 42 L84 116 L0 116 Z"/><path class="pdLine" d="M12 66 L72 66 M12 78 L66 78 M12 90 L72 90 M12 102 L50 102"/>
    <path class="pdMark" d="M12 78 L66 78"/><path class="pdFold" d="M0 42 L42 0 L42 42 Z M84 42 L42 0 L42 42 Z"/>
    <path class="pdCrease" d="M42 0 L42 116"/><path class="pdEdge" d="M0 42 L42 0 L84 42 L84 116 L0 116 Z M0 42 L84 42"/>`);
  // Landed nose first: a dart standing on its nose, tail up.
  const landed = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<ellipse class="pdShadow" cx="30" cy="104" rx="22" ry="4"/>
    <g transform="rotate(58 60 60)">${DART}</g>`);
  // Three more crumpled sheets, each its own shape.
  const BALLS = [
    { o: 'M6 22 L14 8 L28 3 L40 8 L48 22 L44 38 L30 46 L14 43 L5 33 Z', k: 'M14 8 L22 20 L6 22 Z M48 22 L36 26 L44 38 Z M30 46 L26 32 L14 43 Z', e: 'M22 20 L28 3 M22 20 L36 26 L40 8 M36 26 L26 32 L22 20 M26 32 L5 33' },
    { o: 'M4 26 L10 12 L24 6 L34 4 L46 14 L50 28 L42 42 L26 48 L12 42 Z', k: 'M24 6 L28 22 L10 12 Z M50 28 L34 30 L42 42 Z M12 42 L22 32 L4 26 Z', e: 'M28 22 L34 4 M28 22 L34 30 L46 14 M34 30 L22 32 L28 22 M22 32 L26 48' },
    { o: 'M8 18 L20 6 L36 6 L46 16 L44 34 L34 44 L18 44 L6 34 Z', k: 'M20 6 L24 18 L8 18 Z M44 34 L32 30 L34 44 Z M6 34 L16 28 L18 44 Z', e: 'M24 18 L36 6 M24 18 L32 30 L46 16 M32 30 L16 28 L24 18 M16 28 L8 18' },
  ];
  const ballV = (i, x, y, s = 1) => { const b = BALLS[i % BALLS.length]; return at(x, y, 0, s, `<ellipse class="pdShadow" cx="26" cy="48" rx="22" ry="4"/><path class="pdFace" d="${b.o}"/><path class="pdKeel" d="${b.k}"/><path class="pdEdge" d="${b.o} ${b.e}"/>`); };
  // A small stack of sheets, slightly askew, the top one printed and marked.
  const stack = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<rect class="pdShadow" x="8" y="12" width="110" height="80" rx="2"/>
    <g transform="rotate(-5 60 45)"><rect class="pdFar" x="4" y="4" width="108" height="78" rx="2"/><rect class="pdEdge" x="4" y="4" width="108" height="78" rx="2"/></g>
    <g transform="rotate(3 60 45)"><rect class="pdKeel" x="2" y="6" width="108" height="78" rx="2"/><rect class="pdEdge" x="2" y="6" width="108" height="78" rx="2"/></g>
    <rect class="pdFace" x="0" y="4" width="108" height="78" rx="2"/><path class="pdLine" d="M12 22 L90 22 M12 34 L96 34 M12 46 L80 46 M12 58 L92 58"/><path class="pdMark" d="M12 34 L96 34"/><rect class="pdEdge" x="0" y="4" width="108" height="78" rx="2"/>`);
  // A strip torn from a page, one line on it marked.
  const TORN = 'M0 6 L160 2 L162 30 L156 34 L150 29 L143 35 L136 30 L128 36 L120 31 L112 37 L104 32 L96 38 L88 33 L80 39 L72 34 L64 40 L56 35 L48 41 L40 36 L32 42 L24 37 L16 43 L8 38 L2 42 Z';
  const strip = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<path class="pdShadow" d="M6 12 L164 8 L166 40 L8 46 Z"/>
    <path class="pdFace" d="${TORN}"/><path class="pdLine" d="M12 14 L150 11"/><path class="pdMark" d="M12 22 L120 20"/><path class="pdEdge" d="${TORN}"/>`);
  // A sheet folded in half, one half turned up.
  const folded = (x, y, rot = 0, s = 1) => at(x, y, rot, s, `<rect class="pdShadow" x="6" y="10" width="120" height="92" rx="2"/>
    <path class="pdFace" d="M0 4 L62 4 L62 96 L0 96 Z"/><path class="pdKeel" d="M62 4 L118 0 L122 92 L62 96 Z"/>
    <path class="pdLine" d="M10 22 L52 22 M10 34 L48 34 M10 46 L52 46 M10 58 L40 58"/><path class="pdMark" d="M10 34 L48 34"/>
    <path class="pdEdge" d="M0 4 L62 4 L62 96 L0 96 Z M62 4 L118 0 L122 92 L62 96"/>`);
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

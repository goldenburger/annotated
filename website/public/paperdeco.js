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

  const svg = (w, h, body, cls = '') => `<svg class="paperDeco ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${body}</svg>`;
  const ART = {
    // A pile of planes thrown down together, one marked, a crumpled sheet beside them.
    pile: () => svg(250, 150, plane(-6, 42, 18, .95) + plane(70, 30, -6, 1.05, true) + plane(30, 4, -34, .78) + ball(180, 92, .9)),
    sheet: () => svg(150, 175, sheet(12, 10, -7)),
    ball: () => svg(64, 56, ball(6, 2, 1)),
    trail: () => svg(220, 90, trail(220, 90)),
    lone: () => svg(120, 110, plane(0, -4, 6, 1, true)),
    // The panel's quiet corner: two small planes and a ball.
    corner: () => svg(170, 90, plane(40, 0, -6, .72, true) + plane(-6, 16, 20, .6) + ball(122, 46, .62)),
  };
  const make = (name, cls = '') => { const d = document.createElement('div'); d.className = `pd pd-${name} ${cls}`.trim(); d.setAttribute('aria-hidden', 'true'); d.innerHTML = ART[name](); return d; };

  // The margins of a full page (feed, profile, an annotation): a pile of planes low on the left and a half folded
  // sheet high on the right, fixed like things on a desk, shown only where the margins are wide enough.
  function desk(root = document.body) {
    if (!root || root.querySelector(':scope > .pdDesk')) return;
    const d = document.createElement('div'); d.className = 'pdDesk'; d.setAttribute('aria-hidden', 'true');
    d.appendChild(make('pile', 'pdL')); d.appendChild(make('sheet', 'pdR')); d.appendChild(make('trail', 'pdT'));
    root.appendChild(d);
  }
  // An empty list: a crumpled sheet and a plane, above the words saying why it is empty.
  function empty(el) {
    if (!el || el.querySelector('.pdEmpty')) return;
    const d = document.createElement('div'); d.className = 'pdEmpty'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML = ART.ball() + ART.lone();
    el.prepend(d);
  }
  return { make, desk, empty, ART };
})();

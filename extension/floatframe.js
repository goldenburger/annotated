// A floating, draggable, resizable frame that can shrink to a pill. Shared by the extension (around an iframe,
// inside a shadow root on the page) and the preview (around the panel element).
// FloatFrame.mount(root, content, opts) -> { el, expand(), collapse(), destroy(), setHidden(bool) }
//   root: where the frame is added (a shadow root or an element). content: the node to wrap.
//   opts: { rect, onRect(rect), onClose(), bounds() -> DOMRect-like, zIndex, buttons: [{ icon, label, onClick }] }
//   The frame fits its content's height (setContentHeight) until someone resizes it by hand.
const FloatFrame = (() => {
  const ICON = {
    grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="1.4"/><circle cx="15" cy="7" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="17" r="1.4"/><circle cx="15" cy="17" r="1.4"/></svg>',
    min: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><path d="M12 16.9h.01" stroke-width="2.6"/></svg>',
  };
  const CSS = `
  .ff { position: fixed; display: grid; grid-template-rows: auto 1fr; background: #FBFBFA; border: 1px solid rgba(22,24,29,.14); border-radius: 14px; overflow: hidden;
    box-shadow: 0 24px 60px -18px rgba(22,24,29,.45), 0 4px 14px rgba(22,24,29,.12); font: 500 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif; color: #3A3F4A; }
  .ff.dark { background: #111317; border-color: rgba(255,255,255,.12); color: #C5C9D2; }
  .ff[hidden], .ffPill[hidden] { display: none !important; }
  .ffBar { display: flex; align-items: center; gap: 4px; height: 30px; padding: 0 6px 0 4px; cursor: grab; user-select: none; touch-action: none; border-bottom: 1px solid rgba(22,24,29,.1); background: inherit; }
  .ff.dark .ffBar { border-color: rgba(255,255,255,.08); }
  .ffBar:active { cursor: grabbing; }
  .ffGrip { display: grid; place-items: center; width: 22px; height: 22px; opacity: .6; }
  .ffGrip svg { width: 16px; height: 16px; fill: currentColor; }
  .ffTitle { flex: 1; font-size: 11.5px; opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ffBtn { all: unset; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; color: inherit; }
  .ffBtn:hover { background: rgba(22,24,29,.08); }
  .ff.dark .ffBtn:hover { background: rgba(255,255,255,.1); }
  .ffBtn:focus-visible { outline: 2px solid #2451C4; outline-offset: 1px; }
  .ffBtn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
  .ffBody { position: relative; min-height: 0; overflow: hidden; }
  .ffBody > * { width: 100%; height: 100%; border: 0; display: block; }
  .ffResize { position: absolute; bottom: 0; width: 18px; height: 18px; touch-action: none; z-index: 2; }
  .ffResize.l { left: 0; cursor: nesw-resize; } .ffResize.r { right: 0; cursor: nwse-resize; }
  .ffResize::after { content: ""; position: absolute; bottom: 4px; width: 8px; height: 8px; border-bottom: 2px solid currentColor; opacity: .35; }
  .ffResize.l::after { left: 4px; border-left: 2px solid currentColor; } .ffResize.r::after { right: 4px; border-right: 2px solid currentColor; }
  .ff.dragging .ffBody, .ff.resizing .ffBody { pointer-events: none; }
  .ffPill { all: unset; position: fixed; display: flex; align-items: center; gap: 7px; padding: 8px 14px 8px 10px; border-radius: 999px; cursor: pointer;
    background: #16181D; color: #fff; font: 600 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow: 0 8px 24px -6px rgba(0,0,0,.4); }
  .ffPill i { width: 16px; height: 9px; background: #FFE14A; border-radius: 2px 5px 3px 6px; transform: skewX(-14deg) rotate(-4deg); }
  .ffPill:focus-visible { outline: 2px solid #FFE14A; outline-offset: 2px; }
  .ffPill.dragging { cursor: grabbing; box-shadow: 0 14px 30px -8px rgba(0,0,0,.5); }
  .ffBtn { position: relative; }
  .ffBtn[data-tip]:hover::after, .ffBtn[data-tip]:focus-visible::after { content: attr(data-tip); position: absolute; top: calc(100% + 6px); right: 0; padding: 5px 8px; border-radius: 6px; background: #16181D; color: #fff; font: 500 11.5px/1.2 system-ui, sans-serif; white-space: nowrap; pointer-events: none; z-index: 5; }
  .ff.dark .ffBtn[data-tip]:hover::after, .ff.dark .ffBtn[data-tip]:focus-visible::after { background: #ECEDEF; color: #16181D; }
  @media (prefers-reduced-motion: no-preference) { .ff.snap { transition: left .18s ease, top .18s ease; } }`;
  const MIN_W = 300, MIN_H = 380, AUTO_MIN_H = 220, MARGIN = 12, SNAP = 28, TOP = 72;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function mount(root, content, opts = {}) {
    const doc = root.ownerDocument || root;
    const addTo = root.host ? root : (root.nodeType === 9 ? root.body : root);
    if (!(root.host ? root.querySelector('style[data-ff]') : doc.querySelector('style[data-ff]'))) {
      const st = doc.createElement('style'); st.dataset.ff = '1'; st.textContent = CSS;
      (root.host ? root : doc.head).appendChild(st);
    }
    const B = () => (opts.bounds ? opts.bounds() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight });
    // Default: right side, below where most sites put their header and account buttons.
    const def = () => { const b = B(); const top = Math.min(TOP, Math.max(MARGIN, b.height * .1)); const w = Math.min(380, b.width - 2 * MARGIN), h = Math.min(640, b.height - top - MARGIN); return { x: b.right - w - MARGIN, y: b.top + top, w, h, userH: false, pill: 'br' }; };
    let rect = opts.rect && opts.rect.w ? { pill: 'br', ...opts.rect } : def();
    let contentH = 0;
    const ff = doc.createElement('div');
    ff.className = 'ff'; ff.setAttribute('role', 'dialog'); ff.setAttribute('aria-label', 'annotated');
    if (opts.zIndex) ff.style.zIndex = opts.zIndex;
    ff.innerHTML = `<div class="ffBar"><span class="ffGrip" title="Drag to move. Double-click to reset.">${ICON.grip}</span><span class="ffTitle" title="Drag to move. Double-click to reset.">${opts.title || 'annotated'}</span>
      ${(opts.buttons || []).map((b, i) => `<button class="ffBtn ffX" data-i="${i}" aria-label="${b.label}" data-tip="${b.label}">${ICON[b.icon] || ''}</button>`).join('')}
      <button class="ffBtn ffMin" aria-label="Shrink to a button" data-tip="Shrink to a button">${ICON.min}</button>
      ${opts.onClose ? `<button class="ffBtn ffClose" aria-label="Close annotated" data-tip="Close">${ICON.close}</button>` : ''}</div>
      <div class="ffBody"></div><span class="ffResize l" aria-hidden="true"></span><span class="ffResize r" aria-hidden="true"></span>`;
    const pill = doc.createElement('button');
    pill.className = 'ffPill'; pill.hidden = true; pill.innerHTML = '<i></i>annotated'; pill.setAttribute('aria-label', 'Open annotated');
    if (opts.zIndex) pill.style.zIndex = opts.zIndex;
    const home = { parent: content.parentNode, next: content.nextSibling };
    ff.querySelector('.ffBody').appendChild(content);
    addTo.appendChild(ff); addTo.appendChild(pill);

    function fit() {
      const b = B();
      // Until resized by hand, the frame is as tall as its content, within the window.
      if (!rect.userH && contentH) rect.h = clamp(contentH + 31, Math.min(AUTO_MIN_H, b.height - 2 * MARGIN), b.height - (rect.y - b.top) - MARGIN);
      rect.w = clamp(rect.w, MIN_W, b.width - 2 * MARGIN);
      rect.h = clamp(rect.h, Math.min(rect.userH ? MIN_H : AUTO_MIN_H, b.height - 2 * MARGIN), b.height - 2 * MARGIN);
      rect.x = clamp(rect.x, b.left + MARGIN, b.right - rect.w - MARGIN); rect.y = clamp(rect.y, b.top + MARGIN, b.bottom - rect.h - MARGIN);
      Object.assign(ff.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
      placePill();
    }
    // The shrunken button sits in a corner, bottom-right unless dragged elsewhere.
    function placePill() {
      const b = B(), c = rect.pill || 'br', right = c[1] === 'r', bottom = c[0] === 'b';
      Object.assign(pill.style, { left: right ? '' : (b.left + MARGIN + 4) + 'px', right: right ? (window.innerWidth - b.right + MARGIN + 4) + 'px' : '', top: bottom ? '' : (b.top + TOP) + 'px', bottom: bottom ? (window.innerHeight - b.bottom + MARGIN + 4) + 'px' : '' });
    }
    // Snap to the nearest edge when released close to it.
    function snap() {
      const b = B();
      if (rect.x - b.left < SNAP + MARGIN) rect.x = b.left + MARGIN;
      if (b.right - (rect.x + rect.w) < SNAP + MARGIN) rect.x = b.right - rect.w - MARGIN;
      if (rect.y - b.top < SNAP + MARGIN) rect.y = b.top + MARGIN;
      if (b.bottom - (rect.y + rect.h) < SNAP + MARGIN) rect.y = b.bottom - rect.h - MARGIN;
      ff.classList.add('snap'); fit(); setTimeout(() => ff.classList.remove('snap'), 220);
    }
    const save = () => opts.onRect && opts.onRect({ ...rect });
    fit();

    // Move
    const bar = ff.querySelector('.ffBar');
    let drag = null;
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.ffBtn')) return;
      drag = { x0: e.clientX, y0: e.clientY, rx: rect.x, ry: rect.y };
      bar.setPointerCapture(e.pointerId); ff.classList.add('dragging');
    });
    bar.addEventListener('pointermove', (e) => { if (!drag) return; rect.x = drag.rx + e.clientX - drag.x0; rect.y = drag.ry + e.clientY - drag.y0; fit(); });
    const endDrag = () => { if (!drag) return; drag = null; ff.classList.remove('dragging'); snap(); save(); };
    bar.addEventListener('pointerup', endDrag); bar.addEventListener('pointercancel', endDrag);
    bar.addEventListener('dblclick', (e) => { if (e.target.closest('.ffBtn')) return; const pc = rect.pill; rect = def(); rect.pill = pc; ff.classList.add('snap'); fit(); setTimeout(() => ff.classList.remove('snap'), 220); save(); });
    // Resize from either bottom corner
    ff.querySelectorAll('.ffResize').forEach((h) => {
      let rs = null;
      h.addEventListener('pointerdown', (e) => { rs = { x0: e.clientX, y0: e.clientY, r: { ...rect }, left: h.classList.contains('l') }; h.setPointerCapture(e.pointerId); ff.classList.add('resizing'); e.preventDefault(); });
      h.addEventListener('pointermove', (e) => {
        if (!rs) return;
        const dx = e.clientX - rs.x0, dy = e.clientY - rs.y0;
        rect.h = Math.max(MIN_H, rs.r.h + dy); rect.userH = true;
        if (rs.left) { const w = Math.max(MIN_W, rs.r.w - dx); rect.x = rs.r.x + rs.r.w - w; rect.w = w; } else rect.w = Math.max(MIN_W, rs.r.w + dx);
        fit();
      });
      const end = () => { if (!rs) return; rs = null; ff.classList.remove('resizing'); save(); };
      h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    });
    // Keyboard: arrow keys move the frame while the bar's grip area has focus is not needed; buttons are focusable.
    const collapse = () => { ff.hidden = true; pill.hidden = false; placePill(); opts.onCollapse && opts.onCollapse(true); };
    const expand = () => { ff.hidden = false; pill.hidden = true; fit(); opts.onCollapse && opts.onCollapse(false); };
    ff.querySelector('.ffMin').addEventListener('click', collapse);
    let pd = null;
    pill.addEventListener('pointerdown', (e) => { const r = pill.getBoundingClientRect(); pd = { x0: e.clientX, y0: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false }; pill.setPointerCapture(e.pointerId); });
    pill.addEventListener('pointermove', (e) => {
      if (!pd) return;
      if (!pd.moved && Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) < 5) return;
      pd.moved = true; pill.classList.add('dragging');
      Object.assign(pill.style, { left: (e.clientX - pd.ox) + 'px', top: (e.clientY - pd.oy) + 'px', right: '', bottom: '' });
    });
    pill.addEventListener('pointerup', (e) => {
      if (!pd) return;
      const moved = pd.moved; pd = null; pill.classList.remove('dragging');
      if (!moved) return expand();
      const b = B();
      rect.pill = (e.clientY > (b.top + b.bottom) / 2 ? 'b' : 't') + (e.clientX > (b.left + b.right) / 2 ? 'r' : 'l');
      placePill(); save();
    });
    pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expand(); } });
    ff.querySelectorAll('.ffX').forEach((b) => b.addEventListener('click', (e) => opts.buttons[Number(b.dataset.i)].onClick(b.getBoundingClientRect(), e)));
    const cl = ff.querySelector('.ffClose');
    if (cl) cl.addEventListener('click', () => opts.onClose());
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return {
      el: ff, pill, expand, collapse,
      get collapsed() { return ff.hidden; },
      setDark(on) { ff.classList.toggle('dark', !!on); },
      setContentHeight(h) { if (Math.abs(h - contentH) < 2) return; contentH = h; if (!ff.hidden) fit(); },
      setHidden(h) { ff.style.visibility = h ? 'hidden' : ''; pill.style.visibility = h ? 'hidden' : ''; },
      destroy() {
        window.removeEventListener('resize', onResize);
        if (home.parent) home.parent.insertBefore(content, home.next && home.next.parentNode === home.parent ? home.next : null);
        ff.remove(); pill.remove();
      },
    };
  }
  return { mount, CSS };
})();

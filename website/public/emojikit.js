// Emoji picker, :shortcode: autocomplete and reactions. Shared by the extension and the preview.
// Needs EMOJI_DATA (emoji-data.js) and Brand. No network, no keys.
const EmojiKit = (() => {
  const ALL = EMOJI_DATA.e.map(([ch, label, g, sc, tags, skins]) => ({ ch, label, g, sc: sc.split(' '), tags: tags ? tags.split(' ') : [], skins }));
  const byCode = new Map();
  ALL.forEach((e) => e.sc.forEach((c) => { if (!byCode.has(c)) byCode.set(c, e); }));
  const byChar = new Map(ALL.map((e) => [e.ch, e]));
  const GROUPS = [[0, '😀', 'Smileys'], [1, '👋', 'People'], [3, '🐶', 'Animals and nature'], [4, '🍔', 'Food and drink'], [5, '✈️', 'Travel and places'], [6, '⚽', 'Activities'], [7, '💡', 'Objects'], [8, '❤️', 'Symbols'], [9, '🏁', 'Flags']];
  const QUICK = ['👍', '❤️', '😂', '😮', '🤔', '🔥'];
  // Commonly used emoji rank first when matches are otherwise equal.
  const POPULAR = ['joy', 'heart', 'fire', '+1', 'sob', '100', 'pray', 'eyes', 'clap', 'rofl', 'tada', 'thinking', 'smile', 'grin', 'sweat_smile', 'raised_hands', 'muscle', 'white_check_mark', 'x', 'warning', 'rocket', 'skull', 'shrug', 'facepalm', 'rolling_eyes', 'star_struck', 'sparkles', 'point_up', 'thumbsdown', 'wave', 'ok_hand', 'relieved', 'scream', 'exploding_head', 'mega', 'bulb', 'memo', 'chart_with_upwards_trend', 'mag'];
  const popRank = new Map(POPULAR.map((c, i) => [c, i]));
  const rank = (e) => Math.min(...e.sc.map((c) => (popRank.has(c) ? popRank.get(c) : 999)));
  const TONES = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const recents = () => store.get('annotated-emoji-recent', []);
  function addRecent(ch) { store.set('annotated-emoji-recent', [ch, ...recents().filter((x) => x !== ch)].slice(0, 24)); }
  const skin = () => store.get('annotated-emoji-skin', 0);
  const withSkin = (e) => (skin() && e.skins.length ? e.skins[skin() - 1] : e.ch);
  const baseOf = (ch) => byChar.get(ch) || ALL.find((e) => e.skins.includes(ch)) || { ch, label: ch, sc: [], skins: [] };

  // Best matches first: shortcode, then words in the name, then keywords.
  function search(q, limit = 80) {
    q = q.toLowerCase().trim().replace(/^:|:$/g, '');
    if (!q) return [];
    const scored = [];
    for (const e of ALL) {
      let s = 99;
      for (const c of e.sc) { if (c === q) s = Math.min(s, 0); else if (c.startsWith(q)) s = Math.min(s, 1); }
      if (s > 2 && e.label.toLowerCase().split(/[\s:,-]+/).some((w) => w.startsWith(q))) s = 2;
      if (s > 3 && e.tags.some((t) => t.startsWith(q))) s = 3;
      if (s > 4 && e.label.toLowerCase().includes(q)) s = 4;
      if (s < 99) scored.push([s, e]);
    }
    return scored.sort((a, b) => a[0] - b[0] || rank(a[1]) - rank(b[1]) || a[1].sc[0].length - b[1].sc[0].length).slice(0, limit).map((x) => x[1]);
  }

  // Inserts text at the caret and tells listeners the value changed.
  function insertAtCaret(el, text) {
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, s) + text + el.value.slice(e);
    const p = s + text.length;
    el.setSelectionRange(p, p);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Bounds for popups: the side panel when the anchor is inside one, otherwise the window.
  function bounds(anchor) {
    const host = anchor.closest('.panel');
    const W = window.innerWidth, H = window.innerHeight;
    if (!host) return { left: 8, right: W - 8, top: 8, bottom: H - 8 };
    const b = host.getBoundingClientRect();
    return { left: Math.max(8, b.left + 8), right: Math.min(W - 8, b.right - 8), top: Math.max(8, b.top + 8), bottom: Math.min(H - 8, b.bottom - 8) };
  }
  function place(pop, anchor) {
    const r = anchor.getBoundingClientRect(), B = bounds(anchor);
    const w = Math.min(330, B.right - B.left);
    pop.style.width = w + 'px';
    const h = pop.offsetHeight || 380;
    let top = r.top - h - 8;
    if (top < B.top) top = Math.min(B.bottom - h, r.bottom + 8);
    pop.style.top = Math.max(B.top, top) + 'px';
    pop.style.left = Math.max(B.left, Math.min(B.right - w, r.right - w)) + 'px';
  }

  let openPop = null;
  // Closing returns focus to the button that opened it, unless a pick already put focus in a text box.
  function closePop(refocus = true) {
    if (!openPop) return;
    const a = openPop.anchor; openPop.el.remove(); openPop = null;
    delete document.body.dataset.popNeed;
    if (refocus && a && a.focus) a.focus();
  }

  // Full picker: search, recents, categories, skin tone, keyboard navigation.
  function picker(anchor, onPick) {
    if (openPop && openPop.anchor === anchor) return closePop();
    closePop();
    const pop = document.createElement('div');
    pop.className = 'emojiPop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Emoji');
    pop.innerHTML = `
      <input class="epSearch" type="search" placeholder="Search emoji" aria-label="Search emoji" autocomplete="off" spellcheck="false">
      <div class="epTabs" role="tablist">
        <button type="button" class="epTab" data-sec="recent" title="Recently used" aria-label="Recently used">🕘</button>
        ${GROUPS.map(([g, icon, name]) => `<button type="button" class="epTab" data-sec="g${g}" title="${name}" aria-label="${name}">${icon}</button>`).join('')}
      </div>
      <div class="epGrid" tabindex="-1"></div>
      <div class="epFoot"><span class="epPrev" aria-live="polite"></span>
        <span class="epSkins" role="radiogroup" aria-label="Skin tone">${TONES.map((t, i) => `<button type="button" class="epSkin" role="radio" aria-checked="${skin() === i}" data-i="${i}" title="Skin tone ${i ? i : 'default'}">${t}</button>`).join('')}</span></div>`;
    document.body.appendChild(pop);
    openPop = { el: pop, anchor };
    // Inside a floating frame, ask the frame for enough height to show the whole picker.
    if (anchor.closest('.panel')) document.body.dataset.popNeed = '480';
    const grid = pop.querySelector('.epGrid'), input = pop.querySelector('.epSearch'), prev = pop.querySelector('.epPrev');
    const btn = (e) => `<button type="button" class="epE" data-ch="${esc(e.ch)}" aria-label="${esc(e.label)}">${withSkin(e)}</button>`;
    const section = (id, title, list) => list.length ? `<section class="epSec" id="ep-${id}"><h4>${esc(title)}</h4><div class="epRow">${list.map(btn).join('')}</div></section>` : '';
    function drawAll() {
      const rec = recents().map((c) => byChar.get(c) || baseOf(c)).filter((e) => e && e.label);
      grid.innerHTML = section('recent', 'Recently used', rec)
        + GROUPS.map(([g, , name]) => section('g' + g, name, ALL.filter((e) => e.g === g))).join('');
    }
    function drawSearch(q) {
      const res = search(q);
      grid.innerHTML = res.length ? section('res', `Results for "${q}"`, res) : `<p class="epNone">No emoji match "${esc(q)}".</p>`;
    }
    drawAll();
    place(pop, anchor);
    input.focus();
    // Stays placed while the panel resizes, and lets go of its listeners once closed.
    const ro = new ResizeObserver(() => replace());
    const replace = () => { if (openPop && openPop.el === pop) place(pop, anchor); else { window.removeEventListener('resize', replace); ro.disconnect(); } };
    window.addEventListener('resize', replace);
    ro.observe(anchor.closest('.panel') || document.body);

    const buttons = () => [...grid.querySelectorAll('.epE')];
    const pick = (b) => {
      const e = byChar.get(b.dataset.ch) || baseOf(b.dataset.ch);
      const out = withSkin(e);
      addRecent(e.ch);
      closePop(false);
      onPick(out);
    };
    // The footer names the emoji in plain words, with a short code when there is room.
    const preview = (b) => {
      const e = byChar.get(b.dataset.ch) || baseOf(b.dataset.ch), code = e.sc[0] || '';
      const name = e.label.charAt(0).toUpperCase() + e.label.slice(1);
      prev.innerHTML = `<b>${withSkin(e)}</b><span class="epName">${esc(name)}</span>${code && code.length <= 14 ? `<span class="epCode">:${esc(code)}:</span>` : ''}`;
      prev.title = code ? `:${code}:` : '';
    };
    grid.addEventListener('click', (ev) => { const b = ev.target.closest('.epE'); if (b) pick(b); });
    grid.addEventListener('mouseover', (ev) => { const b = ev.target.closest('.epE'); if (b) preview(b); });
    grid.addEventListener('focusin', (ev) => { const b = ev.target.closest('.epE'); if (b) preview(b); });
    input.addEventListener('input', () => { const q = input.value.trim(); if (q) drawSearch(q); else drawAll(); });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { const b = buttons()[0]; if (b) { ev.preventDefault(); pick(b); } }
      if (ev.key === 'ArrowDown') { const b = buttons()[0]; if (b) { ev.preventDefault(); b.focus(); } }
    });
    // Arrow keys move through the grid, eight to a row.
    grid.addEventListener('keydown', (ev) => {
      const list = buttons(), i = list.indexOf(document.activeElement);
      if (i < 0) return;
      const cols = Math.max(1, Math.round(grid.querySelector('.epRow').clientWidth / list[0].offsetWidth));
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[ev.key];
      if (d) { ev.preventDefault(); const n = i + d; if (n < 0) input.focus(); else if (list[n]) list[n].focus(); }
      if (ev.key === 'Enter') { ev.preventDefault(); pick(list[i]); }
    });
    pop.querySelectorAll('.epTab').forEach((t) => t.addEventListener('click', () => {
      if (input.value) { input.value = ''; drawAll(); }
      const s = grid.querySelector('#ep-' + t.dataset.sec);
      if (s) grid.scrollTop = s.offsetTop - grid.offsetTop;
    }));
    pop.querySelectorAll('.epSkin').forEach((s) => s.addEventListener('click', () => {
      store.set('annotated-emoji-skin', Number(s.dataset.i));
      pop.querySelectorAll('.epSkin').forEach((x) => x.setAttribute('aria-checked', String(x === s)));
      if (input.value) drawSearch(input.value); else drawAll();
    }));
    pop.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); closePop(); } });
    setTimeout(() => document.addEventListener('mousedown', function out(ev) {
      if (!openPop || openPop.el !== pop) return document.removeEventListener('mousedown', out);
      if (!pop.contains(ev.target) && !anchor.contains(ev.target)) { document.removeEventListener('mousedown', out); closePop(); }
    }), 0);
  }

  // Typing ":fi" suggests matching emoji. Typing ":fire:" swaps it in directly.
  function autocomplete(el) {
    const list = document.createElement('div');
    list.className = 'emojiAc'; list.setAttribute('role', 'listbox'); list.hidden = true;
    document.body.appendChild(list);
    let items = [], sel = 0, start = -1;
    const close = () => { list.hidden = true; items = []; };
    function show() {
      const r = el.getBoundingClientRect();
      list.style.left = Math.max(8, r.left) + 'px';
      list.style.width = Math.min(280, r.width) + 'px';
      list.hidden = false;
      const h = list.offsetHeight;
      list.style.top = (r.bottom + h + 8 > window.innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
    }
    function draw() {
      list.innerHTML = items.map((e, i) => `<div class="acItem" role="option" aria-selected="${i === sel}" data-i="${i}"><b>${withSkin(e)}</b><span>:${esc(e.sc[0])}:</span></div>`).join('');
    }
    function choose(i) {
      const e = items[i]; if (!e) return;
      const caret = el.selectionStart;
      el.value = el.value.slice(0, start) + withSkin(e) + el.value.slice(caret);
      const p = start + withSkin(e).length;
      el.setSelectionRange(p, p);
      addRecent(e.ch);
      close();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.addEventListener('input', (ev) => {
      if (ev.isTrusted === false && list.hidden) return;
      const caret = el.selectionStart, before = el.value.slice(0, caret);
      const done = before.match(/(^|\s):([a-z0-9_+-]+):$/i);
      if (done && byCode.has(done[2].toLowerCase())) {
        const e = byCode.get(done[2].toLowerCase()), s = caret - done[2].length - 2;
        el.value = el.value.slice(0, s) + withSkin(e) + el.value.slice(caret);
        const p = s + withSkin(e).length; el.setSelectionRange(p, p);
        addRecent(e.ch); close();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const m = before.match(/(^|\s):([a-z0-9_+-]{2,})$/i);
      if (!m) return close();
      start = caret - m[2].length - 1;
      items = search(m[2], 6).filter((e) => e.sc[0]);
      if (!items.length) return close();
      sel = 0; draw(); show();
    });
    el.addEventListener('keydown', (ev) => {
      if (list.hidden) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = (sel + 1) % items.length; draw(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = (sel - 1 + items.length) % items.length; draw(); }
      else if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); ev.stopImmediatePropagation(); choose(sel); }
      else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    }, true);
    list.addEventListener('mousedown', (ev) => { const it = ev.target.closest('.acItem'); if (it) { ev.preventDefault(); choose(Number(it.dataset.i)); } });
    el.addEventListener('blur', () => setTimeout(close, 150));
  }

  // Emoji button next to a text box.
  function button(el, cls = 'quiet') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls + ' emojiBtn hasTip'; b.dataset.tooltip = 'Emoji. You can also type a colon'; b.setAttribute('aria-label', 'Add emoji');
    b.innerHTML = Brand.icon('smile');
    b.addEventListener('click', () => picker(b, (ch) => { el.focus(); insertAtCaret(el, ch); }));
    return b;
  }

  // Reactions: chips for each emoji, and an add button with a quick bar and the full picker.
  // With no accounts yet, every reaction is yours.
  // addButton: an existing button elsewhere (like React in an action row). Then the row shows chips only,
  // and hides itself while there are none.
  // Reactions as { emoji, count, mine }. Older saves hold plain emoji strings, which count as one reaction of yours.
  const normReactions = (list) => (list || []).map((x) => (typeof x === 'string' ? { emoji: x, count: 1, mine: true } : { emoji: x.emoji, count: x.count || 1, mine: !!x.mine }));
  function reactions(container, { list = [], onChange, size = '', addButton = null }) {
    let items = normReactions(list);
    if (addButton) addButton.addEventListener('click', () => quickBar(addButton, (ch) => toggle(ch)));
    const title = (r) => {
      const others = r.count - (r.mine ? 1 : 0);
      if (r.mine) return others ? `You and ${others} other${others > 1 ? 's' : ''} reacted with ${r.emoji}. Click to remove yours.` : `You reacted with ${r.emoji}. Click to remove.`;
      return `${r.count} ${r.count > 1 ? 'people' : 'person'} reacted with ${r.emoji}. Click to add yours.`;
    };
    function draw() {
      container.classList.add('reactRow');
      if (size) container.classList.add(size);
      container.innerHTML = items.map((r) => `<button type="button" class="rChip ${r.mine ? '' : 'notMine'}" aria-pressed="${r.mine}" title="${esc(title(r))}" aria-label="${esc(baseOf(r.emoji).label)}, ${r.count} reaction${r.count > 1 ? 's' : ''}${r.mine ? ', including yours' : ''}"><span>${r.emoji}</span><span class="num">${r.count}</span></button>`).join('')
        + (addButton ? '' : `<span class="rAddWrap"><button type="button" class="rAdd" aria-label="Add a reaction" title="Add a reaction">${Brand.icon('smile')}<span class="plus">+</span></button></span>`);
      if (addButton) container.hidden = !items.length;
      container.querySelectorAll('.rChip').forEach((c, i) => c.addEventListener('click', () => toggle(items[i].emoji)));
      const add = container.querySelector('.rAdd');
      if (add) add.addEventListener('click', () => quickBar(add, (ch) => toggle(ch)));
    }
    function toggle(ch) {
      const i = items.findIndex((r) => r.emoji === ch);
      let added = false;
      if (i >= 0 && items[i].mine) { items[i].count--; items[i].mine = false; if (!items[i].count) items.splice(i, 1); }
      else if (i >= 0) { items[i].count++; items[i].mine = true; added = true; }
      else { items.push({ emoji: ch, count: 1, mine: true }); added = true; }
      addRecent(baseOf(ch).ch);
      draw(); onChange && onChange(items.map((r) => ({ ...r })), { emoji: ch, on: added });
      // A small pop on the chip you just added.
      if (added) { const k = items.findIndex((r) => r.emoji === ch); const c = container.querySelectorAll('.rChip')[k]; if (c) c.classList.add('pop'); }
    }
    draw();
  }

  // The six defaults, like messaging apps, plus a button for everything else.
  function quickBar(anchor, onPick) {
    if (openPop && openPop.anchor === anchor) return closePop();
    closePop();
    const bar = document.createElement('div');
    bar.className = 'quickBar'; bar.setAttribute('role', 'menu'); bar.setAttribute('aria-label', 'React');
    bar.innerHTML = QUICK.map((q) => `<button type="button" role="menuitem" class="qE" aria-label="${esc(baseOf(q).label)}">${q}</button>`).join('')
      + `<button type="button" role="menuitem" class="qMore" aria-label="More emoji" title="More emoji">${Brand.icon('plus')}</button>`;
    document.body.appendChild(bar);
    openPop = { el: bar, anchor };
    const r = anchor.getBoundingClientRect(), B = bounds(anchor);
    const w = bar.offsetWidth, h = bar.offsetHeight;
    bar.style.left = Math.max(B.left, Math.min(B.right - w, r.left)) + 'px';
    bar.style.top = (r.top - h - 8 >= B.top ? r.top - h - 8 : r.bottom + 8) + 'px';
    bar.querySelector('.qE').focus();
    bar.querySelectorAll('.qE').forEach((b) => b.addEventListener('click', () => { closePop(); onPick(b.textContent); }));
    bar.querySelector('.qMore').addEventListener('click', () => { closePop(); picker(anchor, onPick); });
    bar.addEventListener('keydown', (ev) => {
      const bs = [...bar.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      if (ev.key === 'ArrowRight') { ev.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
      if (ev.key === 'Escape') { ev.preventDefault(); closePop(); }
    });
    setTimeout(() => document.addEventListener('mousedown', function out(ev) {
      if (!openPop || openPop.el !== bar) return document.removeEventListener('mousedown', out);
      if (!bar.contains(ev.target) && !anchor.contains(ev.target)) { document.removeEventListener('mousedown', out); closePop(); }
    }), 0);
  }

  return { search, picker, autocomplete, button, reactions, normReactions, quickBar, insertAtCaret, byCode, QUICK };
})();

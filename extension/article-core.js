// Passage highlighting and metadata. Shared by the extension content script and the preview.
// No extension APIs in here.
var ArticleCore = (() => {
  const MIN_CHARS = 40;
  // Picking your own words is deliberate, so the floor is only there to catch a stray click.
  const MIN_EXACT = 12;
  const MAX_CHARS = 1200;
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  // Range.toString drops emoji, which X draws as images. PostCore keeps them.
  const rangeText = (r) => (typeof PostCore !== 'undefined' && PostCore.rangeText ? PostCore.rangeText(r) : r.toString());

  // Checks the current selection inside `root`. Returns null when the selection is
  // somewhere else (for example the side panel), so callers can ignore it.
  // Checks a range inside `root`. Returns null when it is somewhere else (for example the side panel).
  function describeRange(range, root, min = MIN_CHARS) {
    if (!range || range.collapsed) return { state: 'empty' };
    const anc = range.commonAncestorContainer;
    const ancEl = anc.nodeType === 1 ? anc : anc.parentElement;
    if (!ancEl || !root.contains(ancEl)) return null;
    if (ancEl.closest('input, textarea, [contenteditable="true"], .annotated-ui')) return null;
    const text = norm(rangeText(expandToWords(range.cloneRange())));
    if (!text) return { state: 'empty' };
    for (const h of root.querySelectorAll('h1, [itemprop="headline"]')) {
      if (range.intersectsNode(h)) return { state: 'error', text, len: text.length, error: 'Pick a passage from the story, not the headline.' };
    }
    if (text.length < min && !coversWholeBlock(range)) return { state: 'error', text, len: text.length, aligned: isSentenceAligned(range),
      error: min === MIN_EXACT ? 'Select a few more words.' : 'Select a little more. A passage should be at least a full sentence.' };
    if (text.length > MAX_CHARS) return { state: 'error', text, len: text.length, error: `That is ${text.length.toLocaleString()} characters. Trim it to ${MAX_CHARS.toLocaleString()} or fewer.` };
    return { state: 'ok', text, len: text.length, aligned: isSentenceAligned(range) };
  }
  function readSelection(root) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return { state: 'empty' };
    return describeRange(sel.getRangeAt(0), root);
  }

  // Grow the range so it never starts or ends in the middle of a word.
  function expandToWords(range) {
    const s = range.startContainer;
    if (s.nodeType === 3) {
      let o = range.startOffset;
      while (o > 0 && /\S/.test(s.nodeValue[o - 1])) o--;
      range.setStart(s, o);
    }
    const e = range.endContainer;
    if (e.nodeType === 3) {
      let o = range.endOffset;
      while (o < e.nodeValue.length && /\S/.test(e.nodeValue[o])) o++;
      range.setEnd(e, o);
    }
    return range;
  }

  function highlightRange(range) {
    const anc = range.commonAncestorContainer;
    const top = anc.nodeType === 1 ? anc : anc.parentNode;
    const nodes = [];
    const walker = document.createTreeWalker(top, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        // Whitespace between words counts. Skipping it left unhighlighted gaps mid-passage, so one stroke came
        // out looking like several. Whitespace at the very ends is trimmed below instead.
        if (n.parentElement && n.parentElement.closest('script, style, noscript')) return NodeFilter.FILTER_REJECT;
        return range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    if (anc.nodeType === 3) nodes.push(anc);
    else while (walker.nextNode()) nodes.push(walker.currentNode);
    // The stroke should not hang off either end into empty space.
    while (nodes.length && !nodes[0].nodeValue.trim()) nodes.shift();
    while (nodes.length && !nodes[nodes.length - 1].nodeValue.trim()) nodes.pop();

    const marks = [];
    // One word to a mark, each word carrying the space after it so no gap opens between them. The pen that
    // draws the stroke is placed over one mark, and a single word never breaks across two lines, so every
    // stroke covers exactly one rectangle and can be drawn by the compositor.
    for (const n of nodes) {
      let node = n;
      let start = n === range.startContainer ? range.startOffset : 0;
      let end = n === range.endContainer ? range.endOffset : n.nodeValue.length;
      if (start >= end) continue;
      if (end < node.nodeValue.length) node.splitText(end);
      if (start > 0) node = node.splitText(start);
      const parts = node.nodeValue.match(/\S+\s*|\s+/g) || [];
      let piece = node;
      for (let i = 0; i < parts.length; i++) {
        const rest = i < parts.length - 1 ? piece.splitText(parts[i].length) : null;
        const mk = document.createElement('mark');
        mk.className = 'annotated-hl';
        piece.parentNode.insertBefore(mk, piece);
        mk.appendChild(piece);
        marks.push(mk);
        if (rest) piece = rest;
      }
    }
    // A stroke that starts or ends on a space hangs off the words into empty paper.
    const unwrap = (mk) => { const par = mk.parentNode; while (mk.firstChild) par.insertBefore(mk.firstChild, mk); par.removeChild(mk); };
    while (marks.length && !marks[0].textContent.trim()) unwrap(marks.shift());
    while (marks.length && !marks[marks.length - 1].textContent.trim()) unwrap(marks.pop());
    shapeRun(marks);
    return marks;
  }

  // The words are marked one at a time, but the ink is one stroke. Each word's pen layer is given the width
  // of its whole line and pushed sideways, so the gradient runs across the line instead of starting again at
  // every word. Each line is capped at its own ends, the way a highlighter lifts at the end of a line.
  function shapeRun(marks) {
    if (!marks.length) return;
    const boxes = marks.map((m) => m.getBoundingClientRect());
    let i = 0;
    while (i < marks.length) {
      let j = i;
      while (j + 1 < marks.length && Math.abs(boxes[j + 1].top - boxes[i].top) < 2) j += 1;
      const x0 = boxes[i].left, wide = Math.max(1, boxes[j].right - x0);
      for (let k = i; k <= j; k++) {
        marks[k].style.setProperty('--bw', Math.round(wide) + 'px');
        marks[k].style.setProperty('--bx', -Math.round(boxes[k].left - x0) + 'px');
        marks[k].classList.remove('hl-a', 'hl-z');
      }
      marks[i].classList.add('hl-a');
      marks[j].classList.add('hl-z');
      i = j + 1;
    }
  }

  // Draw the stroke on, word by word. The pen is a layer behind each word that grows from nothing to full
  // width, which the compositor can do on its own. A stroke animated on the page's own thread is skipped
  // whenever that thread is busy, and capturing keeps it busy, which is why the stroke used to arrive finished.
  function sweep(marks) {
    if (!marks || !marks.length) return;
    const n = marks.length;
    const total = Math.min(900, 260 + n * 45);
    const per = Math.min(230, Math.max(110, Math.round(total * 0.45)));
    const step = n > 1 ? (total - per) / (n - 1) : 0;
    // Pale text on a dark page would be invisible the moment it turns to ink, before the pen reaches it.
    // Those words keep the page's own colour and turn as the pen passes them.
    let lit = false;
    try {
      const par = marks[0].parentElement;
      const m = par && getComputedStyle(par).color.match(/\d+/g);
      if (m) lit = (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255 > 0.55;
    } catch { /* the page moved on */ }
    marks.forEach((mk, i) => {
      const at = Math.round(i * step);
      mk.style.setProperty('--d', at + 'ms');
      mk.style.setProperty('--sw', per + 'ms');
      mk.classList.add('hl-go');
      if (lit) {
        mk.classList.add('hl-lit');
        setTimeout(() => mk.classList.add('hl-inked'), at + Math.round(per * 0.55));
      }
    });
  }

  function clearHighlights(root = document, keep = []) {
    const touched = new Set();
    root.querySelectorAll('mark.annotated-hl').forEach((mk) => {
      if (keep.includes(mk)) return;
      const p = mk.parentNode;
      while (mk.firstChild) p.insertBefore(mk.firstChild, mk);
      p.removeChild(mk);
      touched.add(p);
    });
    // Normalise once each, at the end. Doing it per mark left the text split, and every capture split it
    // further, until a passage marked up as one range came out as several pieces.
    touched.forEach((p) => { try { p.normalize(); } catch { /* the page moved on */ } });
  }

  function unionRect(marks) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const m of marks) {
      for (const r of m.getClientRects()) {
        x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
        x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
      }
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  // Link that opens the page scrolled to and highlighting this exact passage.
  function fragmentUrl(base, text) {
    const enc = (s) => encodeURIComponent(s).replace(/-/g, '%2D').replace(/,/g, '%2C');
    const words = norm(text).split(' ');
    const clean = base.split('#')[0];
    if (words.length <= 8) return `${clean}#:~:text=${enc(words.join(' '))}`;
    return `${clean}#:~:text=${enc(words.slice(0, 4).join(' '))},${enc(words.slice(-4).join(' '))}`;
  }

  // Reads the metadata news sites publish for link previews. `root` can be a document or an element.
  function extractMeta(root, loc) {
    const attr = (sel, a = 'content') => (root.querySelector(sel)?.getAttribute(a) || '').trim();
    const abs = (u) => { try { return u ? new URL(u, loc.href).href : ''; } catch { return ''; } };
    let ld = {};
    for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent);
        const list = [].concat(j['@graph'] || j);
        const art = list.find((x) => /Article|Posting/.test([].concat(x['@type'] || '').join(' ')));
        if (art) { ld = art; break; }
      } catch { /* ignore bad JSON-LD */ }
    }
    const ldAuthor = [].concat(ld.author || []).map((a) => (typeof a === 'string' ? a : a.name)).filter(Boolean).join(', ');
    const h1 = root.querySelector('h1')?.textContent || '';
    let author = attr('meta[name="author"]') || ldAuthor ||
      norm(root.querySelector('[rel="author"], [itemprop="author"] [itemprop="name"], .byline__name, .author-name')?.textContent || '');
    if (/^https?:/i.test(author)) author = ldAuthor || '';
    return {
      // Without a leading unread count like "(1) Home / X".
      // X renames its own page as you move around it, so on X the source name comes from the address.
      title: (typeof PostCore !== 'undefined' && PostCore.isXHost(loc.hostname) && !PostCore.isStatusUrl(loc.href)) ? 'X'
        : norm(attr('meta[property="og:title"]') || attr('meta[name="twitter:title"]') || ld.headline || h1 || (root.title || '')).replace(/^\(\d+\+?\)\s*/, ''),
      site: attr('meta[property="og:site_name"]') || (ld.publisher && ld.publisher.name) || loc.hostname.replace(/^www\./, ''),
      author,
      published: attr('meta[property="article:published_time"]') || ld.datePublished || attr('time[datetime]', 'datetime'),
      image: abs(attr('meta[property="og:image"]') || attr('meta[name="twitter:image"]') || [].concat(ld.image || []).map((i) => (typeof i === 'string' ? i : i.url))[0]),
      description: attr('meta[property="og:description"]') || attr('meta[name="description"]'),
      url: abs(attr('link[rel="canonical"]', 'href')) || loc.href.split('#')[0],
    };
  }


  // ---------- sentences ----------
  // A post on X is one block, so its whole text snaps and counts as a paragraph would.
  const BLOCKS = 'p, li, blockquote, dd, figcaption, h2, h3, h4, h5, h6, td, pre, [data-testid="tweetText"]';
  function blockOf(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el.closest(BLOCKS) || el;
  }
  function textIndex(block) {
    const nodes = []; let pos = 0;
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; nodes.push({ n, s: pos }); pos += n.nodeValue.length; }
    return { nodes, text: nodes.map((x) => x.n.nodeValue).join('') };
  }
  function offsetIn(idx, node, off) {
    if (node.nodeType === 3) { const e = idx.nodes.find((x) => x.n === node); if (e) return e.s + off; }
    const r = document.createRange(); r.setStart(node, off);
    for (const x of idx.nodes) if (r.comparePoint(x.n, 0) >= 0) return x.s;
    return idx.text.length;
  }
  function pointAt(idx, pos) {
    for (const x of idx.nodes) if (pos <= x.s + x.n.nodeValue.length) return [x.n, pos - x.s];
    const last = idx.nodes[idx.nodes.length - 1];
    return [last.n, last.n.nodeValue.length];
  }
  const ABBR = /(?:\b[a-z]\.[a-z]|\bMrs?|\bMs|\bDr|\bSt|\bJr|\bSr|\bvs|\betc|\be\.g|\bi\.e|\bU\.S|\bNo)$/i;
  // A sentence ends at . ! or ? (plus closing quotes) when the next word starts with a capital, digit or quote.
  function boundaries(text) {
    const out = []; const re = /[.!?]["'”’)\]]*/g; let m;
    while ((m = re.exec(text))) {
      const e = m.index + m[0].length;
      const rest = text.slice(e);
      if (rest.length && !/^\s/.test(rest)) continue;
      const next = rest.trimStart();
      if (next.length && !/^["'“‘(\[A-Z0-9]/.test(next)) continue;
      if (m[0][0] === '.' && ABBR.test(text.slice(0, m.index))) continue;
      out.push(e);
    }
    return out;
  }
  function sentenceStart(text, pos) {
    let best = 0;
    for (const e of boundaries(text)) { if (e <= pos) best = e; else break; }
    while (best < text.length && /\s/.test(text[best])) best++;
    return best;
  }
  function sentenceEnd(text, pos) {
    for (const e of boundaries(text)) if (e >= pos) return e;
    return text.replace(/\s+$/, '').length;
  }
  function trimmedEnd(text, pos) { while (pos > 0 && /\s/.test(text[pos - 1])) pos--; return pos; }
  function trimmedStart(text, pos) { while (pos < text.length && /\s/.test(text[pos])) pos++; return pos; }
  // True when the range already holds a whole paragraph or a whole post, so there is nothing more to select.
  // A short post like "44 days until the midterm elections" is a complete thought and should be allowed.
  function coversWholeBlock(range) {
    try {
      const r = expandToWords(range.cloneRange());
      const b1 = blockOf(r.startContainer), b2 = blockOf(r.endContainer);
      if (b1 !== b2) return true;
      const idx = textIndex(b1);
      const s = trimmedStart(idx.text, offsetIn(idx, r.startContainer, r.startOffset));
      const e = trimmedEnd(idx.text, offsetIn(idx, r.endContainer, r.endOffset));
      return s <= trimmedStart(idx.text, 0) && e >= trimmedEnd(idx.text, idx.text.length);
    } catch { return false; }
  }
  function isSentenceAligned(range) {
    try {
      const r = expandToWords(range.cloneRange());
      const i1 = textIndex(blockOf(r.startContainer)), i2 = textIndex(blockOf(r.endContainer));
      const s = trimmedStart(i1.text, offsetIn(i1, r.startContainer, r.startOffset));
      const e = trimmedEnd(i2.text, offsetIn(i2, r.endContainer, r.endOffset));
      return sentenceStart(i1.text, s) === s && sentenceEnd(i2.text, e) === e;
    } catch { return true; }
  }
  function expandToSentences(range) {
    const i1 = textIndex(blockOf(range.startContainer)), i2 = textIndex(blockOf(range.endContainer));
    const s = sentenceStart(i1.text, trimmedStart(i1.text, offsetIn(i1, range.startContainer, range.startOffset)));
    const e = sentenceEnd(i2.text, trimmedEnd(i2.text, offsetIn(i2, range.endContainer, range.endOffset)));
    const r = document.createRange();
    r.setStart(...pointAt(i1, s));
    r.setEnd(...pointAt(i2, e));
    return r;
  }

  // Crop box for the screenshot. Whole paragraphs when they fit, otherwise the passage lines only.
  function contextRect(marks, maxH = 560) {
    const u = unionRect(marks);
    const b1 = blockOf(marks[0]).getBoundingClientRect();
    const b2 = blockOf(marks[marks.length - 1]).getBoundingClientRect();
    let x1 = Math.min(b1.left, b2.left, u.x) - 16, x2 = Math.max(b1.right, b2.right, u.x + u.w) + 16;
    if (x2 - x1 > 1100) { x1 = u.x - 16; x2 = u.x + u.w + 16; }
    let y1 = b1.top - 12, y2 = b2.bottom + 12;
    if (y2 - y1 > maxH) { y1 = u.y - 10; y2 = u.y + u.h + 10; }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  // Faint highlight for a selection the panel is holding on to. Uses the CSS Custom Highlight API when present.
  function showPending(range) {
    if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return;
    if (range) CSS.highlights.set('annotated-pending', new Highlight(range));
    else CSS.highlights.delete('annotated-pending');
  }


  // Finds a captured passage in the page again, for links that should jump back to it. Returns a Range or null.
  function findText(root, text) {
    const want = norm(text);
    const head = want.slice(0, 60), tail = want.slice(-60);
    const blocks = [...root.querySelectorAll(BLOCKS)];
    const locate = (needle, fromEnd) => {
      for (const b of blocks) {
        const idx = textIndex(b);
        const flat = idx.text.replace(/\s/g, ' ');
        const i = flat.indexOf(needle);
        if (i >= 0) return pointAt(idx, fromEnd ? i + needle.length : i);
      }
      return null;
    };
    const a = locate(head, false), z = locate(tail, true);
    if (!a || !z) return null;
    const r = document.createRange();
    try { r.setStart(...a); r.setEnd(...z); } catch { return null; }
    return r.collapsed ? null : r;
  }

  return { findText, describeRange, expandToSentences, contextRect, showPending, blockOf, MIN_CHARS, MIN_EXACT, MAX_CHARS, norm, rangeText, readSelection, expandToWords, highlightRange, shapeRun, sweep, clearHighlights, unionRect, fragmentUrl, extractMeta };
})();


// Page-side controller for article passages: tracks the selection, expands it to whole sentences by default,
// holds on to the last good one, shows the floating Annotate button, and captures.
// Shared by the extension content script and the preview.
var ArticlePage = (() => {
  function create({ root, metaRoot, loc, send, scrollBy, viewport, buttonEnabled = () => true }) {
    let pinned = null, exact = true, defaultExact = true, last = { state: 'empty' }, pendingAnnotate = false, timer = null;
    const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Floating button, in a shadow root so page styles cannot touch it.
    const host = document.createElement('div');
    host.className = 'annotated-ui';
    host.style.cssText = 'position:fixed;z-index:2147483647;left:0;top:0;display:none';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>
      .row{display:flex;align-items:stretch;background:#1C2433;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);overflow:hidden}
      button{all:initial;display:flex;align-items:center;gap:6px;cursor:pointer;color:#fff;
        font:600 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;padding:8px 11px}
      button:focus-visible{outline:2px solid #FFE14A;outline-offset:-2px}
      .more{font-weight:500;color:#C8CDD8;padding-left:9px;padding-right:10px;box-shadow:inset 1px 0 0 rgba(255,255,255,.16)}
      .more:hover{color:#fff;background:rgba(255,255,255,.07)}
      .more[hidden]{display:none}
      i{width:16px;height:9px;background:#FFE14A;border-radius:2px 5px 3px 6px;transform:skewX(-14deg) rotate(-4deg)}
      em{all:initial;font:600 13px/1 system-ui,sans-serif;color:#FFE14A;margin-right:5px}
    </style><div class="row"><button type="button" class="go" aria-label="Annotate this passage"><i></i>Annotate</button>
      <button type="button" class="more" hidden aria-label="Include the rest of the sentence"><em>+</em>sentence</button></div>`;
    (document.body || document.documentElement).appendChild(host);
    const btn = sh.querySelector('.go'), moreBtn = sh.querySelector('.more');
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => requestAnnotate());
    // The second click. Takes the rest of the sentence for this capture only, and then has nothing left to offer.
    moreBtn.addEventListener('mousedown', (e) => e.preventDefault());
    moreBtn.addEventListener('click', () => { setExact(false); moreBtn.hidden = true; });
    const hideButton = () => { host.style.display = 'none'; };

    // Is that patch of margin empty? A wide page can have another column sitting in it, and on X the button
    // landed on the navigation beside the post, which read as part of X rather than as part of the passage.
    function clearSpace(x, y, w, h, blockEl) {
      const was = host.style.display;
      host.style.display = 'none';
      let free = true;
      for (const [px, py] of [[x + 4, y + h / 2], [x + w - 4, y + h / 2], [x + w / 2, y + 4], [x + w / 2, y + h - 4]]) {
        const el = document.elementFromPoint(px, py);
        // Empty means the page itself, or something the passage sits inside, is all that is under the point.
        if (!el || !(el === document.body || el === document.documentElement || el.contains(blockEl))) { free = false; break; }
      }
      host.style.display = was;
      return free;
    }

    // Put the button in the margin beside the passage so it never covers text.
    // Falls back to above the first line, then below the last line.
    function positionButton(range, d) {
      moreBtn.hidden = !(d && d.state === 'ok' && d.canExpand && !d.expanded);
      if (!buttonEnabled()) return hideButton();
      const rects = range.getClientRects();
      const first = rects[0], lastR = rects[rects.length - 1];
      if (!first) return hideButton();
      host.style.display = 'block';
      const bw = host.offsetWidth || 110, bh = host.offsetHeight || 32, W = window.innerWidth, H = window.innerHeight;
      const blockEl = ArticleCore.blockOf(range.startContainer);
      const block = blockEl.getBoundingClientRect();
      const mid = first.top + (first.height - bh) / 2;
      let x, y;
      if (block.left - bw - 14 >= 8 && clearSpace(block.left - bw - 14, mid, bw, bh, blockEl)) { x = block.left - bw - 14; y = mid; }
      else if (block.right + bw + 14 <= W - 8 && clearSpace(block.right + 14, mid, bw, bh, blockEl)) { x = block.right + 14; y = mid; }
      else if (first.top - bh - 8 >= 8) { x = first.left; y = first.top - bh - 8; }
      else { x = lastR.left; y = lastR.bottom + 8; }
      host.style.left = Math.max(8, Math.min(W - bw - 8, x)) + 'px';
      host.style.top = Math.max(8, Math.min(H - bh - 8, y)) + 'px';
    }
    window.addEventListener('scroll', hideButton, true);
    window.addEventListener('resize', hideButton);

    // A highlight you have not captured goes away the way a selection does: click somewhere else on the page,
    // or press Escape. Clicks in the side panel are outside the page, so they keep it while you work there.
    const onDown = (e) => {
      if (!pinned || pendingAnnotate || e.composedPath().includes(host)) return;
      // Only clicks in the page's own content count. In the preview the panel shares the page, and clicking it must keep the highlight.
      const area = root();
      if (!area || !area.contains(e.target)) return;
      pinned = null; exact = defaultExact; ArticleCore.showPending(null); hideButton();
      last = { state: 'empty' }; push();
    };
    const onKey = (e) => { if (e.key === 'Escape' && pinned && !pendingAnnotate) clear(); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);

    // Describe a range as it will be captured: expanded to whole sentences unless the user asked for the exact selection.
    function evaluate(range) {
      const raw = ArticleCore.describeRange(range, root(), exact ? ArticleCore.MIN_EXACT : ArticleCore.MIN_CHARS);
      if (!raw || raw.state === 'empty') return raw;
      if (raw.state === 'error' && raw.aligned === undefined) return raw;
      let eff = range, expanded = false;
      if (!exact && raw.aligned === false) {
        try { eff = ArticleCore.expandToSentences(range); expanded = true; } catch { eff = range; }
      }
      const d = expanded ? ArticleCore.describeRange(eff, root()) : raw;
      if (!d) return raw;
      return { ...d, expanded, exact, canExpand: raw.aligned === false, range: eff };
    }
    function push() {
      const { range, ...sel } = last;
      send({ type: 'sel-update', sel });
    }

    const onSel = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const live = ArticleCore.readSelection(root());
        if (!live) { hideButton(); return; }
        if (live.state === 'empty') {
          hideButton();
          const d = pinned && evaluate(pinned);
          if (d && d.state === 'ok') { ArticleCore.showPending(d.range); last = { ...d, pinned: true }; }
          else { pinned = null; ArticleCore.showPending(null); last = { state: 'empty' }; }
          return push();
        }
        exact = defaultExact;
        const range = window.getSelection().getRangeAt(0).cloneRange();
        const d = evaluate(range);
        if (d && d.state === 'ok') {
          pinned = range;
          ArticleCore.showPending(d.range);
          positionButton(range, d);
        } else hideButton();
        last = d || { state: 'empty' };
        push();
      }, 120);
    };
    document.addEventListener('selectionchange', onSel);

    // Reloading the extension leaves this copy on the page with a dead connection. The copy that replaces it
    // calls this, so only one button, one set of listeners and one highlight are ever live.
    function destroy() {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('selectionchange', onSel);
      try { ArticleCore.showPending(null); ArticleCore.clearHighlights(document); } catch { /* the page moved on */ }
      host.remove();
    }

    function currentRange() {
      const s = ArticleCore.readSelection(root());
      if (s && s.state !== 'empty') return window.getSelection().getRangeAt(0).cloneRange();
      return pinned ? pinned.cloneRange() : null;
    }

    // The preference for what a selection captures. Without it, exact lasted for one selection and the next
    // one snapped again, so anyone who wants their own words had to say so every single time.
    function setSnap(exactByDefault) { defaultExact = !!exactByDefault; setExact(defaultExact); }
    function setExact(v) {
      exact = !!v;
      const r = currentRange();
      if (!r) return;
      const d = evaluate(r);
      const live = ArticleCore.readSelection(root());
      const isLive = live && live.state !== 'empty';
      ArticleCore.showPending(d && d.state === 'ok' ? d.range : null);
      last = { ...(d || { state: 'empty' }), pinned: !isLive };
      push();
    }

    function requestAnnotate() {
      const s = ArticleCore.readSelection(root());
      if (s && s.state !== 'empty') pinned = window.getSelection().getRangeAt(0).cloneRange();
      if (!pinned) return;
      pendingAnnotate = true;
      hideButton();
      send({ type: 'annotate-request' });
    }

    async function capture() {
      pendingAnnotate = false;
      const r = currentRange();
      const d = r && evaluate(r);
      if (!d || d.state !== 'ok') return { ok: false, error: (d && d.error) || 'Select a passage on the page first.' };
      const range = ArticleCore.expandToWords(d.range.cloneRange());
      // On X, a selection inside a post is an annotation of that post, wherever the post is shown.
      const node = range.commonAncestorContainer;
      const postEl = typeof PostCore !== 'undefined' && PostCore.isXHost(loc().hostname) && (node.nodeType === 1 ? node : node.parentElement).closest('article[data-testid="tweet"]');
      // Posts keep their line breaks. Articles collapse whitespace as before.
      const text = postEl ? ArticleCore.rangeText(range).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim() : ArticleCore.norm(ArticleCore.rangeText(range));
      const marks = ArticleCore.highlightRange(range);
      ArticleCore.clearHighlights(document, marks);
      // The stroke is drawn on afterwards, once the screenshot is taken and the page has nothing else to do.
      // The screenshot itself wants it finished, which is how it is until the sweep starts.
      taken = range.cloneRange();
      pinned = null; ArticleCore.showPending(null); hideButton();
      window.getSelection().removeAllRanges();
      if (postEl) unfold(postEl);
      const box = () => { if (!postEl) return ArticleCore.contextRect(marks); const b = postEl.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
      let clip = box();
      const vp = viewport();
      // Center the passage, or for a post taller than the window, bring its top into view.
      scrollBy(postEl && clip.h > vp.bottom - vp.top - 80 ? clip.y - vp.top - 64 : clip.y + clip.h / 2 - (vp.top + vp.bottom) / 2);
      await frames();
      await new Promise((res) => setTimeout(res, 120));
      hideButton();
      clip = box();
      const meta = ArticleCore.extractMeta(metaRoot(), loc());
      const post = postEl ? (() => { const { el, ...p } = PostCore.read(postEl, loc()); return p; })() : null;
      last = { state: 'empty' }; push();
      return { ok: true, text, meta, post, fragmentUrl: ArticleCore.fragmentUrl(meta.url || loc().href, text), clip, viewport: viewport(), marks };
    }

    function clear() {
      pinned = null; exact = defaultExact; ArticleCore.showPending(null); hideButton();
      window.getSelection().removeAllRanges();
      last = { state: 'empty' }; push();
    }

    function info() {
      const { range, ...sel } = last;
      return { meta: ArticleCore.extractMeta(metaRoot(), loc()), sel, autoCapture: pendingAnnotate };
    }

    // X hides the rest of a long post behind a Show more link, and a screenshot of that shows a cut-off source.
    // The fold is opened for the shot and put back afterwards. The timer is a backstop for callers that never
    // call refold, such as the preview.
    let folded = null, foldTimer = null;
    function unfold(el) {
      refold();
      if (!el) return false;
      const undo = [];
      const set = (n, prop, to) => { undo.push([n, prop, n.style[prop]]); n.style[prop] = to; };
      for (const n of [el, ...el.querySelectorAll('[data-testid="tweetText"], [data-testid="tweetText"] *')]) {
        const cs = getComputedStyle(n);
        if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') set(n, 'webkitLineClamp', 'unset');
        if (cs.overflow === 'hidden' && n.scrollHeight > n.clientHeight + 1) set(n, 'overflow', 'visible');
      }
      for (const m of el.querySelectorAll('[data-testid="tweet-text-show-more-link"]')) set(m, 'display', 'none');
      folded = undo.length ? undo : null;
      clearTimeout(foldTimer);
      if (folded) foldTimer = setTimeout(refold, 5000);
      return !!folded;
    }
    function refold() {
      clearTimeout(foldTimer);
      if (!folded) return;
      for (const [n, prop, was] of folded) n.style[prop] = was;
      folded = null;
    }

    // The words picked inside one element (a post on X), then the highlight is cleared so screenshots stay clean.
    // Snapped to whole sentences the same way a passage is, so the quote matches the highlight drawn on the page.
    let taken = null;
    // What the last capture quoted, kept as words rather than as a place in the page. A range drifts every
    // time the words around it are split and put back together, which is what marking and unmarking does.
    let lastText = '';
    // Draws the highlight over the words a post capture quoted. The screenshot is taken without it, so this runs
    // afterwards and gives a captured post the same mark a captured passage gets.
    function paintTaken() {
      if (!taken) return;
      try {
        const marks = ArticleCore.highlightRange(taken);
        ArticleCore.clearHighlights(document, marks);
        ArticleCore.sweep(marks);
      } catch { /* the page moved on */ }
      taken = null;
    }
    function takeWithin(el) {
      // Any earlier stroke comes off first, so the screenshot shows this capture and nothing before it.
      const raw = currentRange();
      const d = raw ? evaluate(raw) : null;
      const picked = (d && d.range) || raw;
      let r = picked ? ArticleCore.expandToWords(picked.cloneRange()) : null;
      // Nothing selected, but this post was captured with a quote a moment ago. Capturing again keeps it
      // rather than quietly falling back to the whole post.
      if (!r && lastText) { const back = ArticleCore.findText(el, lastText); if (back) r = back; }
      if (r && !inside(r, el)) r = null;
      let text = '';
      pendingAnnotate = false;
      if (r) text = ArticleCore.rangeText(r).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      clear();
      try { ArticleCore.clearHighlights(document); } catch { /* the page moved on */ }
      // Reading the words again after the strokes came off catches a range the tidying moved.
      if (r && ArticleCore.norm(ArticleCore.rangeText(r)) !== ArticleCore.norm(text)) {
        const again = ArticleCore.findText(el, text);
        r = again || r;
      }
      taken = r;
      lastText = text;
      return text;
    }
    const inside = (r, el) => { try { return el.contains(r.commonAncestorContainer); } catch { return false; } };
    // The post on X that holds the current selection, if any (a reply on a post page, say).
    function selectedPost() {
      const r = currentRange();
      if (!r) return null;
      const n = r.commonAncestorContainer;
      return (n.nodeType === 1 ? n : n.parentElement).closest('article[data-testid="tweet"]');
    }
    // Taking the stroke off the page also drops the words it stood for, so capturing again does not bring
    // back a quote the person just removed.
    function forgetTaken() { taken = null; lastText = ''; }
    return { capture, setExact, setSnap, clear, info, requestAnnotate, takeWithin, paintTaken, forgetTaken, selectedPost, unfold, refold, destroy };
  }
  return { create };
})();

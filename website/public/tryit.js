// The front page's own try-it. The annotated.com brief is printed on a sheet of paper, tilted a little in 3D.
// A visitor selects words, presses Annotate, and the extension's real pen crosses them (ArticleCore, the same
// code the extension puts on every page). Their take then lifts off the paper as a card that hangs above it,
// its shadow landing on the words it is about: your take on top, the source underneath. Nothing is sent. The
// last one made is kept in this browser (annotated-tryit), so the extension can offer to publish it.
var TryIt = (() => {
  // The brief, word for word, from its own page. Short on purpose, credited and linked.
  const SOURCE = { title: 'The annotated.com brief', site: 'This Week in Startups', url: 'https://annotated.lovable.app/' };
  const LINES = [
    'Annotated is a sidebar Chrome extension that lets users highlight and quickly clip media, text, audio, or video, from any website, then add their own commentary and annotations.',
    'All clipped content, text, audio, or video, must link back to its original source URL.',
    'The cleanest, most complete execution wins.',
  ];
  const KEY = 'annotated-tryit';
  const MAX_QUOTE = 280, MAX_TAKE = 280;
  // What the page does by itself, once, for anyone who has not touched it. Labelled Example on screen.
  const DEMO = { phrase: 'must link back to its original source URL', take: 'Every annotation here does, and each one has File a claim.' };
  const INK = { hi: '#FFE14A', deep: '#F2C600', lift: '#FFEE9E' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof Brand !== 'undefined' ? Brand.icon(n) : '');
  const still = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flat = () => typeof matchMedia !== 'undefined' && (matchMedia('(max-width: 760px)').matches || matchMedia('(hover: none)').matches);
  // A small drawn pen, for the example only.
  const PEN = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 32l4-12L28 4l8 8-16 16z" fill="#16181D"/><path d="M8 32l4-12 8 8z" fill="#FFE14A"/><path d="M6 36h10" stroke="#F2C600" stroke-width="3" stroke-linecap="round"/></svg>';

  function mount(host) {
    if (typeof ArticleCore === 'undefined') return false;
    if (!document.querySelector('style[data-tryit-pen]')) {
      const st = document.createElement('style');
      st.dataset.tryitPen = '1';
      st.textContent = ArticleCore.penCss('chisel', INK);
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'tryit';
    el.innerHTML = `
      <div class="tiStage">
        <div class="tiTilt">
          <div class="tiPaper">
            <p class="tiSrc"><span class="tiKind">${icon('article')}</span><a href="${SOURCE.url}" target="_blank" rel="noopener">${esc(SOURCE.title)}</a><span class="tiSite">${esc(SOURCE.site)}</span></p>
            <div class="tiText" data-annotated-self tabindex="0" aria-label="The annotated.com brief. Select any words to annotate them.">${LINES.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
            <span class="tiShadow" aria-hidden="true"></span>
            <span class="tiCurl" aria-hidden="true"></span>
          </div>
          <article class="tiLift" hidden aria-live="polite">
            <p class="tiExample" hidden>Example</p>
            <p class="tiWho"><span class="tiAv">${icon('user')}</span>You <span class="tiNow">just now</span></p>
            <h3 class="tiTakeOut"></h3>
            <p class="tiOn">on <span class="tiInk"></span></p>
            <p class="tiMeta"><span>${icon('link')} Links back to the source</span><span>${icon('flag')} File a claim</span></p>
          </article>
        </div>
        <svg class="tiWire" aria-hidden="true"><line x1="0" y1="0" x2="0" y2="0"/></svg>
        <span class="tiPen" aria-hidden="true" hidden>${PEN}</span>
      </div>
      <div class="tiBar"><p class="tiHint" role="status">Select any words on this page.</p><button type="button" class="link tiForMe">Mark a sentence for me</button><button type="button" class="tiBtn" hidden><i aria-hidden="true"></i>Annotate</button></div>
      <form class="tiTake" hidden>
        <label class="tiLabel" for="tiInput">Your take</label>
        <textarea id="tiInput" rows="3" maxlength="${MAX_TAKE}" placeholder="What should people notice?"></textarea>
        <p class="tiSay" role="status" hidden></p>
        <p class="tiSwap" hidden><button type="button" class="ghost sm tiUse">Use these words instead</button></p>
        <div class="tiRow"><button class="primary tiMake" disabled>Make the annotation</button><button type="button" class="link tiAgain">Pick other words</button><span class="tiCount" aria-live="polite"></span></div>
      </form>
      <div class="tiAfter" hidden>
        <p class="tiNext"><b>That's an annotation.</b> Yours stays in this browser until the extension is installed. <button type="button" class="link tiRedo">Make another</button></p>
      </div>`;
    host.appendChild(el);
    wire(el);
    return true;
  }

  function wire(el) {
    const q = (s) => el.querySelector(s);
    const stage = q('.tiStage'), tilt = q('.tiTilt'), paper = q('.tiPaper'), text = q('.tiText');
    const btn = q('.tiBtn'), hint = q('.tiHint'), form = q('.tiTake'), input = q('#tiInput');
    const lift = q('.tiLift'), shadow = q('.tiShadow'), wireSvg = q('.tiWire'), line = wireSvg.querySelector('line'), pen = q('.tiPen');
    let marks = [], quote = '', touched = false, demoing = false, demoTimer = null, raf = 0;

    // ---- the tilt: the paper leans toward the pointer, heavily, and the lifted card, being higher, moves more.
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const setTilt = () => {
      cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12;
      tilt.style.transform = !flat() && !still() ? `rotateX(${(6 - cy * 4).toFixed(2)}deg) rotateY(${(cx * 4).toFixed(2)}deg) rotateZ(2deg)` : '';
      drawWire();
      const moving = Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002;
      raf = moving || !lift.hidden ? requestAnimationFrame(setTilt) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(setTilt); };
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      kick();
    });
    stage.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
    setTilt();

    // ---- the hairline from the card to the words, drawn in the stage's own flat coordinates every frame.
    function drawWire() {
      if (lift.hidden || !marks.length || !lift.classList.contains('up')) { wireSvg.classList.remove('on'); return; }
      const s = stage.getBoundingClientRect(), c = lift.getBoundingClientRect();
      const rs = marks.map((m) => m.getBoundingClientRect()).filter((r) => r.width);
      if (!rs.length) return;
      const under = lift.classList.contains('under');
      const t = rs.reduce((a, r) => (under ? (r.bottom > a.bottom ? r : a) : (r.top < a.top ? r : a)));
      wireSvg.setAttribute('width', Math.round(s.width)); wireSvg.setAttribute('height', Math.round(s.height));
      line.setAttribute('x1', (c.left - s.left + 22).toFixed(1)); line.setAttribute('y1', (under ? c.top - s.top + 1 : c.bottom - s.top - 1).toFixed(1));
      line.setAttribute('x2', (t.left - s.left + Math.min(t.width, 60) / 2).toFixed(1)); line.setAttribute('y2', (under ? t.bottom - s.top - 2 : t.top - s.top + 3).toFixed(1));
      wireSvg.classList.add('on');
    }

    // ---- where the card hangs, and where its shadow falls: above the paper, over the words it is about.
    function hang() {
      // Placed by the paper's own layout, which does not move as the paper tilts or the page scrolls. Measured
      // on screen, the card was placed once, and after a scroll it sat somewhere else from its line.
      const rs = marks.filter((m) => m.isConnected && m.offsetWidth).map((m) => ({ l: m.offsetLeft, t: m.offsetTop, r: m.offsetLeft + m.offsetWidth, b: m.offsetTop + m.offsetHeight }));
      if (!rs.length) return;
      const box = { l: Math.min(...rs.map((r) => r.l)), r: Math.max(...rs.map((r) => r.r)), t: Math.min(...rs.map((r) => r.t)), b: Math.max(...rs.map((r) => r.b)) };
      shadow.style.left = (box.l - 6) + 'px'; shadow.style.width = (box.r - box.l + 12) + 'px';
      shadow.style.top = (box.t + 6) + 'px'; shadow.style.height = (box.b - box.t + 10) + 'px';
      // On a phone the card sits in the page under the paper, so it needs no place of its own.
      if (flat()) { stage.style.paddingBottom = ''; lift.classList.remove('under'); return; }
      // Above the words when there is room. Otherwise under the paper altogether, since hanging just below
      // the words put it over the last lines of the brief.
      const above = box.t - lift.offsetHeight - 34;
      const under = above < -30;
      lift.classList.toggle('under', under);
      lift.style.top = (under ? paper.offsetHeight + 14 : above) + 'px';
      stage.style.paddingBottom = under ? `${lift.offsetHeight + 24}px` : '';
    }
    function showLift(take, { example = false } = {}) {
      q('.tiTakeOut').textContent = take;
      q('.tiInk').textContent = `“${quote.replace(/\s*\n+\s*/g, ' ')}”`;
      q('.tiExample').hidden = !example; q('.tiWho').hidden = example;
      lift.classList.toggle('example', example);
      lift.hidden = false; lift.classList.remove('up');
      hang();
      requestAnimationFrame(() => requestAnimationFrame(() => { lift.classList.add('up'); shadow.classList.add('on'); kick(); }));
    }
    function sinkLift() {
      lift.classList.remove('up'); shadow.classList.remove('on'); wireSvg.classList.remove('on');
      return new Promise((res) => setTimeout(() => { lift.hidden = true; stage.style.paddingBottom = ''; shadow.removeAttribute('style'); res(); }, still() ? 0 : 420));
    }

    const clear = () => { ArticleCore.clearHighlights(text); marks = []; quote = ''; };
    // Anything else that wipes highlights from the page, the extension on an older build for one, can take the
    // strokes away underneath the try-it. It checks before every step and starts clean if they have gone.
    const intact = () => marks.length > 0 && marks.every((m) => m.isConnected && text.contains(m));
    const recover = () => {
      if (!marks.length || intact()) return false;
      clear(); form.hidden = true; form.classList.remove('up');
      if (!lift.hidden) sinkLift();
      q('.tiAfter').hidden = true;
      hint.textContent = 'Select any words on this page.';
      return true;
    };
    const say = (t) => { const s = q('.tiSay'); s.textContent = t || ''; s.hidden = !t; };
    const inText = (r) => r && text.contains(r.commonAncestorContainer);
    let stopDemo = () => {};
    const quiet = () => {
      clearTimeout(demoTimer);
      if (demoing) stopDemo();
      if (!touched) { touched = true; document.dispatchEvent(new CustomEvent('annotated-tryit-touched')); }
    };

    document.addEventListener('selectionchange', () => {
      if (demoing) return;
      const s = getSelection();
      if (!s || !s.rangeCount || s.isCollapsed) {
        if (!marks.length && !btn.hidden) { btn.hidden = true; hint.textContent = 'Select any words on this page.'; }
        return;
      }
      const r = s.getRangeAt(0);
      if (!inText(r)) return;
      quiet();
      recover();
      if (marks.length && !form.hidden) {
        const inside = marks.some((m) => r.intersectsNode(m));
        q('.tiSwap').hidden = inside || ArticleCore.norm(r.toString()).length > MAX_QUOTE;
        return;
      }
      const n = ArticleCore.norm(r.toString());
      const words = n.split(' ').filter(Boolean).length;
      if (n.length > MAX_QUOTE) { hint.textContent = 'Shorter, so it fits a card.'; btn.hidden = true; return; }
      hint.textContent = words === 1 ? '1 word selected.' : `${words} words selected.`;
      btn.hidden = false;
    });

    // Take the selected words: grow them to whole words, draw the pen, pool the ink, and bring up the take box.
    const ink = (range) => {
      marks = ArticleCore.highlightRange(range);
      const ms = still() ? 0 : ArticleCore.sweep(marks);
      if (marks.length && !still()) setTimeout(() => { marks.forEach((m, i) => { if (i === 0 || i === marks.length - 1) m.classList.add('tiPool'); }); }, ms);
      return ms;
    };
    const take = (r, { keepBox = false } = {}) => {
      const range = ArticleCore.expandToWords(r.cloneRange());
      // 4. The words as the extension quotes them: each block on its own, with a break between, so two
      // paragraphs do not run together as "URL.The".
      const words = ArticleCore.quoteText(range);
      if (!ArticleCore.norm(words)) return;
      getSelection().removeAllRanges();
      btn.hidden = true;
      if (marks.length) ArticleCore.clearHighlights(text);
      quote = words;
      const ms = ink(range);
      if (keepBox) { q('.tiSwap').hidden = true; input.focus({ preventScroll: true }); return; }
      hint.textContent = 'That is the pen the extension uses on any page.';
      setTimeout(() => { form.hidden = false; requestAnimationFrame(() => form.classList.add('up')); input.focus({ preventScroll: true }); }, ms + 150);
    };
    // For the keyboard, and for anyone who does not know the words can be selected: one sentence, marked.
    q('.tiForMe').addEventListener('click', () => {
      quiet();
      if (marks.length) return;
      const r = ArticleCore.findText(text, 'All clipped content, text, audio, or video, must link back to its original source URL.');
      if (r) take(r);
    });
    q('.tiUse').addEventListener('mousedown', (e) => e.preventDefault());
    q('.tiUse').addEventListener('click', () => {
      const s = getSelection();
      if (s && s.rangeCount && !s.isCollapsed && inText(s.getRangeAt(0))) take(s.getRangeAt(0), { keepBox: true });
    });
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      const s = getSelection();
      if (s && s.rangeCount && !s.isCollapsed && inText(s.getRangeAt(0))) take(s.getRangeAt(0));
    });
    const reset = async () => {
      await sinkLift();
      clear(); form.hidden = true; form.classList.remove('up'); input.value = ''; q('.tiCount').textContent = ''; say(''); q('.tiSwap').hidden = true; q('.tiMake').disabled = true;
      q('.tiAfter').hidden = true;
      hint.textContent = 'Select any words on this page.';
    };
    q('.tiAgain').addEventListener('click', reset);
    q('.tiRedo').addEventListener('click', reset);
    input.addEventListener('input', () => {
      const n = input.value.length; q('.tiCount').textContent = n >= 240 ? `${n} of ${MAX_TAKE}` : '';
      q('.tiMake').disabled = !input.value.trim(); say('');
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = input.value.trim();
      if (recover()) return;
      if (!t) { input.focus(); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); say('Write a sentence first.'); return; }
      const made = { quote, take: t, source: SOURCE, at: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(made)); } catch { /* private window */ }
      // The extension, if it is installed, hears this and keeps it for its panel.
      document.dispatchEvent(new CustomEvent('annotated-tryit-made'));
      form.classList.remove('up'); form.hidden = true;
      showLift(t);
      q('.tiAfter').hidden = false;
      hint.textContent = 'Your take on top, the source underneath.';
    });
    const replace = () => { if (!lift.hidden && lift.classList.contains('up')) { hang(); drawWire(); } };
    window.addEventListener('resize', replace);
    window.addEventListener('scroll', () => requestAnimationFrame(replace), { passive: true });

    // ---- once, for anyone who has not touched it: a small pen marks a phrase and an example take lifts.
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function demo() {
      const skip = () => document.dispatchEvent(new CustomEvent('annotated-tryit-demo-done'));
      if (touched || still() || marks.length) return skip();
      const r = ArticleCore.findText(text, DEMO.phrase);
      if (!r) return skip();
      demoing = true;
      let live = true;
      stopDemo = () => { live = false; demoing = false; document.dispatchEvent(new CustomEvent('annotated-tryit-demo-done')); pen.hidden = true; pen.classList.remove('go'); sinkLift(); clear(); hint.textContent = 'Select any words on this page.'; };
      const s = stage.getBoundingClientRect(), rs = [...r.getClientRects()].filter((x) => x.width);
      // The paper is out of sight, on another tab, so there is nothing to show the example on.
      if (!rs.length || !s.width) { demoing = false; return skip(); }
      const a = rs[0], z = rs[rs.length - 1];
      pen.hidden = false;
      pen.style.transform = `translate(${s.width + 20}px, ${s.height * 0.7}px)`;
      await wait(60); if (!live) return;
      pen.classList.add('go');
      pen.style.transform = `translate(${a.left - s.left - 8}px, ${a.bottom - s.top - 30}px)`;
      await wait(700); if (!live) return;
      pen.style.transform = `translate(${z.right - s.left - 8}px, ${z.bottom - s.top - 30}px)`;
      quote = ArticleCore.norm(r.toString());
      const ms = ink(r);
      await wait(Math.max(ms, 600)); if (!live) return;
      pen.hidden = true; pen.classList.remove('go');
      showLift(DEMO.take, { example: true });
      await wait(3200); if (!live) return;
      await sinkLift(); if (!live) return;
      clear();
      demoing = false;
      hint.textContent = 'Now you try. Select any words.';
      document.dispatchEvent(new CustomEvent('annotated-tryit-demo-done'));
    }
    const io = new IntersectionObserver((rows) => {
      if (rows.some((x) => x.isIntersecting)) { clearTimeout(demoTimer); demoTimer = setTimeout(demo, 4000); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(el);
    el.addEventListener('pointerdown', () => quiet());
    el.addEventListener('keydown', () => quiet());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') clearTimeout(demoTimer); });
  }

  return { mount, KEY };
})();

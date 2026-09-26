// The front page's own try-it. The annotated.com brief is printed on a sheet of paper, tilted a little in 3D.
// A visitor selects words, presses Annotate, and the extension's real pen crosses them (ArticleCore, the same
// code the extension puts on every page). Their take then lifts off the paper as a card that hangs above it,
// its shadow landing on the words it is about: your take on top, the source underneath. Nothing is sent. The
// last one made is kept in this browser (annotated-tryit), and shown under Yours so far. It is a demonstration and is never published.
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
  const DEMO = { phrase: 'must link back to its original source URL', take: 'So every take you read comes with the words it is about.' };
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
            <p class="tiMeta"><span>${icon('link')} Links back to the source</span></p>
          </article>
        </div>
        <svg class="tiWire" aria-hidden="true"><line x1="0" y1="0" x2="0" y2="0"/></svg>
        <span class="tiPen" aria-hidden="true" hidden>${PEN}</span>
      </div>
      <div class="tiBar"><p class="tiHint" role="status">Select any words on this page.</p><span class="tiLinks"><button type="button" class="link tiWhole" hidden>Use the whole sentence</button><button type="button" class="link tiForMe">Mark a sentence for me</button><button type="button" class="link tiShowMe">Show me an example</button></span><button type="button" class="tiBtn" hidden><i aria-hidden="true"></i>Annotate</button></div>
      <form class="tiTake" hidden>
        <label class="tiLabel" for="tiInput">Your take</label>
        <textarea id="tiInput" rows="3" maxlength="${MAX_TAKE}" placeholder="What should people notice?"></textarea>
        <p class="tiSay" role="status" hidden></p>
        <p class="tiSwap" hidden><button type="button" class="ghost sm tiUse">Use these words instead</button></p>
        <div class="tiRow"><button class="primary tiMake" disabled>Make the annotation</button><button type="button" class="link tiAgain">Pick other words</button><span class="tiCount" aria-live="polite"></span></div>
      </form>
      <div class="tiAfter" hidden>
        <p class="tiNext"><b>That's an annotation.</b> <span class="tiWhere">It's below, with the rest of yours, and only on this computer.</span> <button type="button" class="link seeYours">See it</button> <button type="button" class="link tiRedo">Make another</button></p>
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
      // Only while the paper is leaning or the card is rising: it used to run at 60 frames a second, a full layout
      // each, for as long as a card was up (audit of 2026-09-24). Scroll and resize redraw the line themselves.
      raf = moving || performance.now() < liftUntil ? requestAnimationFrame(setTilt) : 0;
    };
    let liftUntil = 0;
    const kick = () => { if (!raf) raf = requestAnimationFrame(setTilt); };
    new MutationObserver(() => { liftUntil = performance.now() + 1200; kick(); }).observe(lift, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
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
    // A reset waits for the card to sink, and a take made meanwhile (a click that also finished a plane's flight,
    // which asks for a reset) must not be wiped by it when it lands.
    let resetGen = 0;
    const take = (r, { keepBox = false } = {}) => {
      resetGen++;
      const range = ArticleCore.expandToWords(r.cloneRange());
      // 4. The words as the extension quotes them: each block on its own, with a break between, so two
      // paragraphs do not run together as "URL.The".
      const words = ArticleCore.quoteText(range);
      if (!ArticleCore.norm(words)) return;
      getSelection().removeAllRanges();
      btn.hidden = true;
      // Words that start or end part way through a sentence are offered the whole of it, as the extension offers
      // it beside a quote. Worked out before the pen, since marking the words moves the range.
      let full = '';
      try { full = ArticleCore.quoteText(ArticleCore.expandToSentences(range.cloneRange())); } catch { full = ''; }
      wholeWords = full && ArticleCore.norm(full) !== ArticleCore.norm(words) && ArticleCore.norm(full).length <= MAX_QUOTE ? full : '';
      q('.tiWhole').hidden = !wholeWords;
      if (marks.length) ArticleCore.clearHighlights(text);
      quote = words;
      const ms = ink(range);
      if (keepBox) { q('.tiSwap').hidden = true; input.focus({ preventScroll: true }); return; }
      hint.textContent = 'That is the pen the extension uses on any page.';
      setTimeout(() => { form.hidden = false; requestAnimationFrame(() => form.classList.add('up')); input.focus({ preventScroll: true }); }, ms + 150);
    };
    let wholeWords = '';
    q('.tiWhole').addEventListener('mousedown', (e) => e.preventDefault());
    q('.tiWhole').addEventListener('click', () => {
      const want = wholeWords; if (!want) return;
      ArticleCore.clearHighlights(text); marks = [];
      const r = ArticleCore.findText(text, ArticleCore.norm(want));
      q('.tiWhole').hidden = true;
      if (r) take(r, { keepBox: !form.hidden });
      wholeWords = ''; q('.tiWhole').hidden = true;
    });
    // For the keyboard, and for anyone who does not know the words can be selected: one sentence, marked.
    q('.tiForMe').addEventListener('click', () => {
      quiet();
      // Marks with an open take box are the visitor's own, mid-take; any others (the example's, or a finished
      // take's) give way.
      if (marks.length && !form.hidden) return;
      // A finished take (its card up, the ending showing) is put away first, as Make another would.
      if (marks.length) { reset(); clear(); }
      const r = ArticleCore.findText(text, 'All clipped content, text, audio, or video, must link back to its original source URL.');
      if (r) take(r);
    });
    q('.tiShowMe').addEventListener('click', () => {
      if (demoing) return;
      quiet();
      if (marks.length) { reset(); clear(); }
      clearTimeout(demoTimer);
      setTimeout(() => demo(true), 250);
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
    // The box is emptied and the ending put away at once; only taking the marks off waits for the card to sink,
    // and is skipped if a new take was started meanwhile (audit of 2026-09-24: the box reopened holding the old
    // take when the wait was skipped as a whole).
    const reset = async () => {
      const g = ++resetGen;
      form.hidden = true; form.classList.remove('up'); input.value = ''; q('.tiCount').textContent = ''; say(''); q('.tiSwap').hidden = true; q('.tiMake').disabled = true;
      q('.tiWhole').hidden = true;
      q('.tiAfter').hidden = true;
      await sinkLift();
      if (g !== resetGen) return;
      clear();
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
      form.classList.remove('up'); form.hidden = true; q('.tiWhole').hidden = true;
      showLift(t);
      q('.tiAfter').hidden = false;
      hint.textContent = 'Your take on top, the source underneath.';
    });
    const replace = () => { if (!lift.hidden && lift.classList.contains('up')) { hang(); drawWire(); } };
    window.addEventListener('resize', replace);
    window.addEventListener('scroll', () => requestAnimationFrame(replace), { passive: true });

    // ---- once, for anyone who has not touched it: a small pen marks a phrase and an example take lifts.
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // force: asked for with Show me an example, so it plays whatever has happened before (David, 2026-09-25: the
    // example could only be seen once a visit, with nothing made yet, which was hard for anyone to get back to).
    let hadYours = false;
    try { const y0 = JSON.parse(localStorage.getItem('annotated-yours') || 'null'); hadYours = Array.isArray(y0) ? y0.length > 0 : !!y0; } catch {}
    async function demo(force = false) {
      // Someone with annotations of their own in Yours so far needs no showing (recording of 2026-09-24 at 20:19,
      // where it ran again above four of their own). Only that row counts: the brief's last take is kept after
      // the row is cleared, and counting it hid the example from someone with nothing to show (recording of
      // 2026-09-25 at 03:54).
      if (!force) try {
        // What was in the row when the page opened counts too: emptied with Clear all before the example's turn
        // came, it flew an Example into the row just cleared (recording of 2026-09-25 at 21:59, 0:16 to 0:24).
        const y = hadYours || JSON.parse(localStorage.getItem('annotated-yours') || 'null');
        // Once a visit, too: with Yours so far empty it played on every load, twice in half a minute in the
        // recording of 2026-09-25 at 04:27. It comes back when the browser is next opened.
        if ((Array.isArray(y) ? y.length : y) || sessionStorage.getItem('annotated-example-shown')) { document.dispatchEvent(new CustomEvent('annotated-tryit-demo-done')); return; }
      } catch { /* no storage: show it */ }
      // Not on the heels of an arrival: while the page's opening motion is still playing, and for 0.7 seconds after it
      // (two seconds, with four before it, made the example start almost seven seconds in; exploration of 2026-09-26)
      // the example waits. planes-waiting and data-plane-landed are set by planes.js.
      const landed = +document.documentElement.dataset.planeLanded || 0;
      if (!force && document.documentElement.classList.contains('planes-waiting')) {
        document.addEventListener('annotated-plane-landed', () => { clearTimeout(demoTimer); if (!touched) demoTimer = setTimeout(demo, 700); }, { once: true });
        return;
      }
      if (!force && landed && Date.now() - landed < 700) { demoTimer = setTimeout(demo, 700 - (Date.now() - landed)); return; }
      const skip = () => document.dispatchEvent(new CustomEvent('annotated-tryit-demo-done'));
      if (!force && (touched || still() || marks.length)) return skip();
      const r = ArticleCore.findText(text, DEMO.phrase);
      if (!r) return skip();
      // Marked as shown only now it really starts. Marked before waiting for the opening flight to land, it found its
      // own mark two seconds later and never played for anyone with the planes on (exploration of 2026-09-26).
      if (!force) try { sessionStorage.setItem('annotated-example-shown', '1'); } catch { /* no storage */ }
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
      // To get someone started, the example goes where theirs will: into the row below, when it is empty. With
      // the planes (planes.js, data-planes-on) the paper folds and carries it there, and resets itself.
      const hand = new CustomEvent('annotated-tryit-example', { cancelable: true, detail: { take: DEMO.take, quote } });
      document.dispatchEvent(hand);
      if (hand.defaultPrevented && document.documentElement.dataset.planesOn === '1') {
        await new Promise((res) => { const t = setTimeout(res, 9000); document.addEventListener('annotated-example-settled', () => { clearTimeout(t); res(); }, { once: true }); });
        if (!live) return;
        demoing = false;
        document.dispatchEvent(new CustomEvent('annotated-tryit-demo-done'));
        return;
      }
      await sinkLift(); if (!live) return;
      clear();
      demoing = false;
      hint.textContent = hand.defaultPrevented ? 'Now you try. Select any words. The example is below, where yours will go.' : 'Now you try. Select any words.';
      document.dispatchEvent(new CustomEvent('annotated-tryit-demo-done'));
    }
    const io = new IntersectionObserver((rows) => {
      if (rows.some((x) => x.isIntersecting)) { clearTimeout(demoTimer); demoTimer = setTimeout(demo, 2500); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(el);
    // Choosing another tab counts as touching the try-it: the example is put away, rather than left on the
    // paper to be found half done on coming back.
    document.addEventListener('annotated-tryit-touched', () => { clearTimeout(demoTimer); touched = true; if (demoing) stopDemo(); });
    el.addEventListener('pointerdown', () => quiet());
    el.addEventListener('keydown', () => quiet());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') clearTimeout(demoTimer); });
  }

  return { mount, KEY };
})();

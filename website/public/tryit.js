// The front page's own try-it. A visitor selects words in the annotated.com brief, the real Annotate button
// appears beside them, the real pen crosses them (ArticleCore, the same code the extension puts on every
// page), and a take turns it into the card an annotation becomes. Nothing is saved on a server and nothing
// is sent. The last one made is kept in this browser, so the extension can offer to publish it once it is
// installed (annotated-tryit in localStorage).
var TryIt = (() => {
  // The brief, word for word, from its own page. Short on purpose, credited and linked.
  const SOURCE = { title: 'The annotated.com brief', site: 'This Week in Startups', url: 'https://annotated.lovable.app/' };
  const LINES = [
    'Annotated is a sidebar Chrome extension that lets users highlight and quickly clip media, text, audio, or video, from any website, then add their own commentary and annotations.',
    'All clipped content, text, audio, or video, must link back to its original source URL.',
    'The cleanest, most complete execution wins.',
  ];
  const KEY = 'annotated-tryit';
  // The phrase the page marks by itself for anyone who has not touched it after a few seconds.
  const DEMO = 'must link back to its original source URL';
  const INK = { hi: '#FFE14A', deep: '#F2C600', lift: '#FFEE9E' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof Brand !== 'undefined' ? Brand.icon(n) : '');

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
      <div class="tiCard">
        <p class="tiSrc"><span class="tiKind">${icon('article')}</span><a href="${SOURCE.url}" target="_blank" rel="noopener">${esc(SOURCE.title)}</a><span class="tiSite">${esc(SOURCE.site)}</span></p>
        <div class="tiText" data-annotated-self>${LINES.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
        <div class="tiBar"><p class="tiHint" role="status">Try it here. Select any words above.</p><button type="button" class="tiBtn" hidden><i aria-hidden="true"></i>Annotate</button></div>
        <form class="tiTake" hidden>
          <label class="tiLabel" for="tiInput">Your take</label>
          <textarea id="tiInput" rows="3" maxlength="280" placeholder="What should people notice?"></textarea>
          <div class="tiRow"><button class="primary tiMake">Make the annotation</button><button type="button" class="link tiAgain">Pick other words</button></div>
        </form>
      </div>
      <div class="tiResult" hidden></div>`;
    host.appendChild(el);
    wire(el);
    return true;
  }

  function wire(el) {
    const q = (s) => el.querySelector(s);
    const text = q('.tiText'), btn = q('.tiBtn'), hint = q('.tiHint'), form = q('.tiTake'), input = q('#tiInput');
    let marks = [], quote = '', touched = false, demoTimer = null;
    const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const clear = () => {
      if (marks.length) ArticleCore.clearHighlights(text);
      marks = []; quote = '';
    };
    const inText = (r) => r && text.contains(r.commonAncestorContainer);
    // The button waits in the bar under the text, right below the words, where it can never cover a line of
    // them. Floated beside the selection it sat over the next line, which is exactly what you were reading.
    const place = (r) => {
      const n = ArticleCore.norm(r.toString()).split(' ').filter(Boolean).length;
      hint.textContent = n === 1 ? '1 word selected.' : `${n} words selected.`;
      btn.hidden = false;
    };
    const onSel = () => {
      const s = getSelection();
      if (!s || !s.rangeCount || s.isCollapsed) { if (!marks.length && !btn.hidden) { btn.hidden = true; hint.textContent = 'Select any words above.'; } return; }
      const r = s.getRangeAt(0);
      if (!inText(r)) return;
      touched = true; clearTimeout(demoTimer);
      if (marks.length && form.hidden === false) return;
      clear();
      place(r);
    };
    document.addEventListener('selectionchange', onSel);

    // Take the selected words: grow them to whole words, draw the pen, and open the take box.
    const take = (r) => {
      const range = ArticleCore.expandToWords(r.cloneRange());
      quote = ArticleCore.norm(range.toString());
      if (!quote) return;
      getSelection().removeAllRanges();
      btn.hidden = true;
      marks = ArticleCore.highlightRange(range);
      const ms = slow ? 0 : ArticleCore.sweep(marks);
      hint.textContent = 'That is the pen the extension uses on any page.';
      setTimeout(() => { form.hidden = false; input.focus({ preventScroll: true }); }, ms + 150);
    };
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      const s = getSelection();
      if (s && s.rangeCount && !s.isCollapsed && inText(s.getRangeAt(0))) take(s.getRangeAt(0));
    });
    q('.tiAgain').addEventListener('click', () => {
      clear(); form.hidden = true; input.value = '';
      hint.textContent = 'Select any words above.';
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t) { input.focus(); hint.textContent = 'Write a sentence first, what should people notice?'; return; }
      const made = { quote, take: t, source: SOURCE, at: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(made)); } catch { /* private window */ }
      // The extension, if it is installed, hears this and keeps it for its panel.
      document.dispatchEvent(new CustomEvent('annotated-tryit-made'));
      show(made);
    });

    // The card it would become: your take on top, the source underneath, credited and linked.
    function show(made) {
      const res = q('.tiResult');
      res.innerHTML = `
        <article class="tiAnn">
          <p class="tiWho"><span class="tiAv">${icon('user')}</span>You <span class="tiNow">just now</span></p>
          <h3 class="tiTakeOut"></h3>
          <blockquote class="tiQuote"><p class="tiInk"></p></blockquote>
          <p class="tiFrom">${icon('article')} <a href="${SOURCE.url}" target="_blank" rel="noopener">${esc(SOURCE.title)}</a> · ${esc(SOURCE.site)}</p>
          <p class="tiMeta"><span>${icon('link')} Links back to the source</span><span>${icon('flag')} File a claim</span></p>
        </article>
        <p class="tiNext"><b>That's an annotation.</b> The extension makes these from any article, a YouTube clip, a podcast moment or a post on X, and each one gets a page people can reply to.</p>
        <p class="tiRow"><a class="primary tiGet" href="/install">Get it for Chrome</a><button type="button" class="link tiRedo">Make another</button></p>
        <p class="note tiKept">It's kept in this browser. Once the extension is installed, it offers to publish it.</p>`;
      res.querySelector('.tiTakeOut').textContent = made.take;
      res.querySelector('.tiInk').textContent = made.quote;
      q('.tiCard').hidden = true; res.hidden = false;
      // One mark to a word, as on a real page, so a quote over several lines is inked line by line.
      const ink = res.querySelector('.tiInk'), rr = document.createRange();
      rr.selectNodeContents(ink);
      const done = ArticleCore.highlightRange(rr);
      if (!slow) setTimeout(() => ArticleCore.sweep(done), 250);
      res.querySelector('.tiRedo').addEventListener('click', () => {
        res.hidden = true; q('.tiCard').hidden = false; clear(); form.hidden = true; input.value = '';
        hint.textContent = 'Select any words above.';
      });
    }

    // Left alone, the page marks one phrase by itself so it still shows what happens, then hands over.
    const demo = () => {
      if (touched || slow || marks.length) return;
      const r = ArticleCore.findText(text, DEMO);
      if (!r) return;
      marks = ArticleCore.highlightRange(r);
      ArticleCore.sweep(marks);
      hint.textContent = 'Like that. Now you try, select any words above.';
      setTimeout(() => { if (!touched) { clear(); } }, 4200);
    };
    const io = new IntersectionObserver((rows) => {
      if (rows.some((x) => x.isIntersecting)) { clearTimeout(demoTimer); demoTimer = setTimeout(demo, 3500); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(el);
    el.addEventListener('pointerdown', () => { touched = true; clearTimeout(demoTimer); }, { once: true });
  }

  return { mount, KEY };
})();

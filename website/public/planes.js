// The paper planes on the front page. The planes themselves are fold.js, shared with the extension; this is the
// front page's choreography. Without this file the page works as it is, and ?noplanes shows it that way.
//   The brief arrives folded into a paper plane made of the page itself. It flies in over the headline, touches
//   down where the paper sits, and opens out into it: the wings and the halves spread, then the nose corners.
//   Latest on annotated arrives the same way: when the row comes into view, a plane flies down to each card and
//   opens into it.
//   A take, once made in any of the four tabs, folds back into a plane after four seconds and flies to Latest,
//   where it opens as your card (landing.js keeps it there). The brief is followed by a fresh one dropping in;
//   a clip, a moment or a post resets its tab.
// Rules: the page works from the first moment and the planes never take a click; a click or a key finishes every
// flight at once, and a scroll finishes the first landing; the arrivals play once a visit; reduced motion and
// phones get none. Browsers driven by tests get none unless the address carries ?planes, so the rest of the
// tests see the page as it is without them. ?noplanes shows the page without them, for comparing.
(() => {
  const q = new URLSearchParams(location.search);
  const forced = q.has('planes');
  let planesOff = false;
  try { planesOff = localStorage.getItem('annotated-planes-off') === '1'; } catch { /* no storage */ }
  const off = q.has('noplanes') || planesOff || (navigator.webdriver && !forced)
    || matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 760px), (hover: none)').matches;
  if (off || location.pathname !== '/') return;
  let seen = false;
  try { seen = sessionStorage.getItem('annotated-plane-seen') === '1'; } catch { /* no storage */ }

  const root = document.documentElement;
  if (!seen) root.classList.add('planes-waiting');
  // Whatever happens, the paper is never kept out of sight for long.
  const safety = setTimeout(() => root.classList.remove('planes-waiting'), 6000);

  const { make, clamp, dir, pageBox, dart, inView, buildPlane, bezier, line, flight, landPath, descend, track, crease, handOver, flying } = Fold;
  // ---- the three flights.
  const paperOpts = (paper) => {
    const stage = paper.closest('.tiStage'), tilt = paper.parentElement;
    const sb = pageBox(stage), tb = pageBox(tilt), pb = pageBox(paper);
    const po = getComputedStyle(stage).perspectiveOrigin.split(' ').map(parseFloat);
    const m = getComputedStyle(tilt).transform;
    return {
      persp: { d: parseFloat(getComputedStyle(stage).perspective) || 1400, x: sb.x + po[0], y: sb.y + po[1] },
      tilt: m && m !== 'none' ? { m, ox: tb.x + tb.w / 2 - pb.x, oy: tb.y + tb.h / 2 - pb.y } : null,
    };
  };
  // 1. The brief flies in and opens. `first` is the arrival on load, in over the headline, which a scroll also
  //    finishes. After a take the fresh brief only drops in from above the paper: the grand entrance once is enough.
  function briefIn(paper, first) {
    return new Promise((resolve) => {
      if (!first) paper.classList.add('pl-hidden');
      const plane = buildPlane(paper, paperOpts(paper));
      const t = track(plane, paper, () => {
        clearTimeout(safety);
        root.classList.remove('planes-waiting');
        if (first) {
          try { sessionStorage.setItem('annotated-plane-seen', '1'); } catch { /* no storage */ }
          ['wheel', 'touchstart'].forEach((e) => removeEventListener(e, t.finish, true));
          // The try-it's example waits two seconds after this (tryit.js reads it).
          root.dataset.planeLanded = String(Date.now());
          document.dispatchEvent(new CustomEvent('annotated-plane-landed'));
        }
        resolve();
      });
      if (first) ['wheel', 'touchstart'].forEach((e) => addEventListener(e, t.finish, true));
      const from = first ? { x: scrollX - 160, y: scrollY + 50 } : { x: plane.centre.x - 70, y: plane.centre.y - 340 };
      flight(plane, landPath(plane, from, first ? -.18 : .06), { z: first ? descend(300, .86) : descend(170, .8), T: first ? 1700 : 900 }).then(async () => {
        if (!flying.has(t)) return;
        plane.fshadow.animate([{ opacity: .3 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
        await plane.open(first ? 1300 : 1100);
        if (!flying.has(t)) return;
        root.classList.remove('planes-waiting');
        paper.classList.remove('pl-hidden');
        crease(paper, plane.W, plane.H);
        handOver(plane, t);
      });
    });
  }

  // 2. A card in Latest: a plane drops in from just above it and opens into it (fold.js).
  const cardIn = (card, opts) => Fold.arrive(card, opts);
  const latestRow = () => document.querySelector('.landLatest:not([hidden]) .llRow');
  // Cards wait, hidden, until half the row is in view, and then come in one after another.
  const waiting = [];
  function landLatest() {
    const row = latestRow();
    if (!row || !waiting.length || !inView(row, .5) || root.classList.contains('planes-waiting')) return;
    waiting.splice(0).forEach((card, i) => { if (card.isConnected) cardIn(card, { delay: i * 240 }); });
  }

  // 3. After a take, from any tab: what was made folds into a plane and flies to Latest, where it opens as your
  //    card. The brief's paper is followed by a fresh brief; a clip, a moment or a post resets its tab.
  const SEE = 'Yours is below. <button type="button" class="link seeYours">See it</button>';
  function send(origin, card, { paper = null, scene = null, example = false }) {
    const row = latestRow();
    const lift = paper && document.querySelector('.tiLift:not([hidden])');
    const wire = paper && document.querySelector('.tp-article .tiWire');
    // The card on top goes down into the paper, and the hairline that joined it to its words goes with it.
    if (lift) lift.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(40px) scale(.9)' }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
    if (wire) wire.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    if (scene) scene.querySelectorAll('video, audio').forEach((m) => m.pause());
    const plane = buildPlane(origin, paper ? Object.assign(paperOpts(paper), { startOpen: true }) : { startOpen: true, s0: clamp(150 / Math.max(origin.offsetWidth, origin.offsetHeight), .2, .5) });
    plane.fshadow.style.opacity = '0';
    origin.classList.add('pl-hidden');
    // The try-it keeps its height until the fresh brief is down, so nothing below it jumps when it resets.
    const panel = origin.closest('.tryPanel');
    if (panel) { panel.style.transition = ''; panel.style.minHeight = panel.offsetHeight + 'px'; }
    const release = () => {
      if (!panel) return;
      panel.style.transition = 'min-height .45s ease';
      requestAnimationFrame(() => { panel.style.minHeight = '0px'; });
      setTimeout(() => { panel.style.transition = ''; panel.style.minHeight = ''; }, 500);
    };
    let back = null;
    // Resolves once the tab's own reset has run, so a fresh brief is folded from a clean page.
    const bringBack = () => {
      if (back) return back;
      back = new Promise((res) => setTimeout(res, 480));
      const redo = paper ? document.querySelector('.tiRedo') : scene && scene.querySelector('.stTake .stAgain');
      if (redo) redo.click();
      const going = document.querySelector('.tiNext.pl-going'); if (going) setTimeout(() => going.classList.remove('pl-going'), 480);
      if (lift) lift.getAnimations().forEach((x) => x.cancel());
      if (wire) setTimeout(() => wire.getAnimations().forEach((x) => x.cancel()), 480);
      if (!paper) origin.classList.remove('pl-hidden');
      // After the tab's own reset has put its usual line back.
      setTimeout(() => {
        const hint = paper ? document.querySelector('.tp-article .tiHint') : scene && scene.querySelector('.stHint');
        if (hint && !(paper && paper.querySelector('.tiText mark')) && !(scene && scene.classList.contains('taken'))) hint.innerHTML = example ? 'That example went below, where yours will go. Now you try. <button type="button" class="link seeYours">See it</button>' : SEE;
      }, 560);
      return back;
    };
    // Finished early, by a click or a key: everything where it belongs at once, the example included.
    const t = track(plane, null, () => { bringBack().then(release); origin.classList.remove('pl-hidden'); card.classList.remove('pl-hidden'); if (example) document.dispatchEvent(new CustomEvent('annotated-example-settled')); });
    (async () => {
      await plane.open(paper ? 900 : 800, true);
      if (!flying.has(t)) return;
      const len = plane.Lw * plane.s0;
      const start = plane.centre, h = dir(plane.phi);
      let target = null;
      if (row && card.isConnected && inView(row, .2)) { const b = pageBox(card); target = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
      const run = { x: start.x + h.x * 140, y: start.y + h.y * 140 };
      let pts;
      if (target) {
        // Off along the paper, up, and down onto the card, arriving the way a card's plane arrives.
        const th = dir(card.offsetHeight > card.offsetWidth ? 90 : 0);
        const p3 = { x: target.x - th.x * 90, y: target.y - th.y * 90 };
        pts = line(start, run).concat(bezier(run, { x: run.x + h.x * 260, y: run.y + h.y * 260 - 120 }, { x: p3.x - th.x * 260, y: p3.y - th.y * 260 }, p3).slice(1), line(p3, target).slice(1));
      } else {
        // Latest is below, out of sight: down toward it and off the bottom of the window.
        const out = { x: start.x + 40, y: scrollY + innerHeight + 260 };
        pts = line(start, run).concat(bezier(run, { x: run.x + h.x * 220, y: run.y + h.y * 220 }, { x: out.x + 80, y: out.y - 320 }, out).slice(1));
      }
      plane.fshadow.style.opacity = '';
      const T = target ? 1600 : 1100;
      const z = target ? (u) => (u < .12 ? 0 : u < .86 ? 240 * Math.sin(Math.PI * (u - .12) / .74) ** .8 : 0) : (u) => (u < .12 ? 0 : 200 * Math.sin(Math.PI * Math.min(1, (u - .12) / .88) * .5));
      const air = flight(plane, pts, { acc: .16, dec: target ? .14 : 0, z, T });
      // The tab comes back once the plane is clear of it.
      setTimeout(() => {
        if (!flying.has(t)) return;
        bringBack().then(() => (paper ? briefIn(paper, false) : null)).then(release).then(() => { if (example) document.dispatchEvent(new CustomEvent('annotated-example-settled')); });
      }, T * .4);
      await air;
      if (!flying.has(t)) return;
      flying.delete(t); plane.layer.remove();
      if (target) cardIn(card, { from: target, len });
      else { waiting.push(card); landLatest(); }
    })();
  }

  // Your latest annotation is drawn in Latest the moment it is made (landing.js). It stays hidden while what it
  // was made from is shown for four seconds, with a line saying where it is going, and then flies there.
  // Anything done in that tab meanwhile, or another tab chosen, keeps it where it is and shows the card at once.
  function onYours(e) {
    const { card, fresh, origin, kind, example } = e.detail || {};
    if (!card) return;
    card.dataset.plQueued = '1';
    if (!fresh || !origin) return;
    card.classList.add('pl-hidden');
    // The try-it's example has already been shown for its moment, so it goes at once.
    if (example) { send(origin, card, { paper: origin, example: true }); return; }
    const paper = kind === 'article' ? origin : null;
    const scene = paper ? null : origin.closest('.sceneTry');
    const panel = origin.closest('.tryPanel');
    const next = paper && document.querySelector('.tp-article .tiNext');
    const hint = scene && scene.querySelector('.stHint');
    const said = hint && hint.textContent;
    if (next) next.classList.add('pl-going');
    if (hint) hint.textContent = "That's an annotation. It's going below, with the rest of yours.";
    let cancelled = false, timer = 0;
    const undo = () => {
      if (cancelled) return; cancelled = true; clearTimeout(timer);
      document.removeEventListener('pointerdown', stop, true);
      document.removeEventListener('annotated-tryit-touched', undo);
      card.classList.remove('pl-hidden');
      if (next) next.classList.remove('pl-going');
      if (hint && said) hint.textContent = said;
    };
    const stop = (ev) => { if (panel && ev.target.closest && panel.contains(ev.target)) undo(); };
    document.addEventListener('pointerdown', stop, true);
    document.addEventListener('annotated-tryit-touched', undo);
    timer = setTimeout(() => {
      if (cancelled) return;
      document.removeEventListener('pointerdown', stop, true);
      document.removeEventListener('annotated-tryit-touched', undo);
      if (!origin.isConnected || (panel && panel.hidden) || !inView(origin, .5)) { cancelled = true; card.classList.remove('pl-hidden'); if (next) next.classList.remove('pl-going'); if (hint && said) hint.textContent = said; return; }
      send(origin, card, { paper, scene });
    }, 4000);
  }

  const start = () => {
    const paper = document.querySelector('.tp-article .tiTilt > .tiPaper');
    if (!paper) return false;
    root.dataset.planesOn = '1';
    addEventListener('scroll', () => requestAnimationFrame(landLatest), { passive: true });
    document.addEventListener('annotated-plane-landed', landLatest);
    document.addEventListener('annotated-yours-drawn', onYours);
    // Cards that arrive before this visit's first landing wait for their own planes.
    if (!seen) {
      const grab = () => {
        const row = document.querySelector('.llRow');
        if (!row) return;
        // Every card in the row flies in, yours from earlier visits included (asked for again on 2026-09-24).
        const cards = [...row.querySelectorAll(':scope > .cardItem > .card')].filter((c) => !c.dataset.plQueued);
        cards.forEach((c) => { c.dataset.plQueued = '1'; c.classList.add('pl-hidden'); waiting.push(c); });
        if (cards.length) landLatest();
      };
      const watch = new MutationObserver(grab);
      watch.observe(document.body, { childList: true, subtree: true });
      // Only the cards there on arrival fly in. Redrawn later (a removal, an Undo) they used to fly in again.
      document.addEventListener('annotated-plane-landed', () => setTimeout(() => watch.disconnect(), 300), { once: true });
      grab();
      setTimeout(() => briefIn(paper, true), 120);
    } else root.classList.remove('planes-waiting');
    return true;
  };
  // The front page is drawn by site.js a moment after this runs.
  let tries = 0;
  const wait = () => { if (start()) return; if (++tries < 120) requestAnimationFrame(wait); else root.classList.remove('planes-waiting'); };
  wait();
})();

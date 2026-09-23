// The front page. Everything else on this site is a list of annotations, which is the wrong first thing to
// show someone who has never seen one. This is the promise, the pen actually drawing, and a short loop of
// the panel taking a passage and turning it into a page.
var Hero = (() => {
  // The loop runs on classes rather than one long keyframe chain, so a step can be read and changed on its
  // own. Each entry is how long that step holds.
  const STEPS = [
    ['rest', 900],      // the page as you found it
    ['picked', 900],    // words selected
    ['offered', 1100],  // Annotate, beside them
    ['inked', 1500],    // the pen crosses them
    ['taking', 2600],   // the panel, with your take going in
    ['done', 3000],     // it has a page of its own
  ];
  const TAKE = 'Two point four million for six months of buses, and the grant covers most of it.';

  function build() {
    const el = document.createElement('div');
    el.className = 'heroShow';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="show rest">
        <div class="showPage">
          <div class="showBar"><span class="showDot"></span><span class="showDot"></span><span class="showDot"></span><span class="showUrl">harborline.example</span></div>
          <div class="showBody">
            <p class="showH">Council backs overnight buses for six months</p>
            <p class="showP"><mark class="showMark">The trial will cost $2.4 million over six months, paid mostly from a state transport grant.</mark></p>
            <p class="showP">The council met on a Tuesday, and every member arrived on time for once. The clerk noted the attendance in the minutes with some surprise.</p>
            <p class="showP">A second reading is expected before the end of the month, once the transport committee has seen the figures.</p>
            <p class="showP">Drivers will be recruited over the winter.</p>
          </div>
          <span class="showBtn"><i></i>Annotate</span>
        </div>
        <aside class="showPanel">
          <div class="showPanelHead"><span class="showWm">annotated</span></div>
          <div class="showSteps"><span class="on">Capture</span><span class="two">Take</span><span class="three">Publish</span></div>
          <p class="showK">Quoting</p>
          <blockquote class="showQuote">The trial will cost $2.4 million over six months, paid mostly from a state transport grant.</blockquote>
          <p class="showK showK2">Your take</p>
          <div class="showTake"><span class="showTyped"></span><span class="showCaret"></span></div>
          <div class="showPub"><span class="showTick">✓</span><div><b>Published</b><span>It has a page of its own now.</span></div></div>
        </aside>
      </div>`;
    return el;
  }

  function run(el) {
    const show = el.querySelector('.show');
    const typed = el.querySelector('.showTyped');
    const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Nothing moves for anyone who asked for that. The last step is the one worth seeing, so it is the one
    // that stays.
    if (slow) { show.className = 'show done'; typed.textContent = TAKE; return () => {}; }
    let i = 0, timer = null, typer = null, stopped = false;
    const type = () => {
      let n = 0;
      clearInterval(typer);
      typer = setInterval(() => {
        n += 1;
        typed.textContent = TAKE.slice(0, n);
        if (n >= TAKE.length) clearInterval(typer);
      }, 26);
    };
    const step = () => {
      if (stopped) return;
      const [name, hold] = STEPS[i];
      show.className = 'show ' + name;
      if (name === 'rest') typed.textContent = '';
      if (name === 'taking') type();
      i = (i + 1) % STEPS.length;
      timer = setTimeout(step, hold);
    };
    step();
    return () => { stopped = true; clearTimeout(timer); clearInterval(typer); };
  }

  // The band under the site's own header, above the list. It is only for someone who has not signed in and
  // is looking at the home page, because everyone else came here for the annotations.
  function mount(page, { onLook }) {
    const grid = page.querySelector('.sitegrid');
    if (!grid || page.querySelector('.hero')) return;
    const hero = document.createElement('section');
    hero.className = 'hero';
    hero.innerHTML = `
      <div class="heroCopy">
        <p class="heroKicker">A Chrome sidebar for the open web</p>
        <h1 class="heroH">Say what you think about <mark class="heroMark">anything</mark> on the web</h1>
        <p class="heroSub">Mark a passage in an article, clip a moment out of a video or a podcast, or keep a post from X.
          Add your take and it becomes a page with your take on top and the source underneath, linking back to where it came from.</p>
        <p class="heroDo"><a class="primary heroGet" href="/annotated-extension.zip" download>Get the Chrome extension</a>
          <button type="button" class="link heroLook">Look around first</button></p>
        <p class="note heroWhere">Any article, YouTube, most podcasts, and posts on X.</p>
      </div>`;
    // The visitor makes an annotation right here, with the extension's own pen. The scripted loop of a
    // made-up article is the fallback, for a page where the shared highlighter did not load.
    grid.parentNode.insertBefore(hero, grid);
    const side = document.createElement('div'); side.className = 'heroTry';
    hero.appendChild(side);
    const tried = typeof TryIt !== 'undefined' && TryIt.mount(side);
    if (!tried) { side.remove(); hero.appendChild(build()); }
    const stop = tried ? () => {} : run(hero);
    hero.querySelector('.heroLook').addEventListener('click', () => {
      onLook && onLook();
      grid.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    // The loop costs nothing once it is off screen, and a tab nobody is looking at should not run it either.
    const io = new IntersectionObserver((rows) => rows.forEach((r) => { if (!r.isIntersecting) stop(); }), { threshold: 0 });
    io.observe(hero);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stop(); }, { once: true });
  }

  return { mount };
})();

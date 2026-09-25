// "What else it does", on the front page under Yours so far (David, 2026-09-25: the extension does far more than the
// four try-it tabs show). Three small working demonstrations and a line of the rest. Each is labelled Example,
// sends nothing and keeps nothing, like the try-it above it.
//   1. Say it your way: a take with a tag, a poll and reactions, drawn as the card it becomes while you make it.
//   2. It lands as a page: a finished annotation's page, with reactions, a comment box and File a claim that work.
//   3. Clip what's playing: an episode on Spotify, found by name in Apple's directory, cut from the show's own file.
var Features = (() => {
  const icon = (n) => (typeof Brand !== 'undefined' ? Brand.icon(n) : '');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const QUOTE = 'All clipped content, text, audio, or video, must link back to its original source URL.';
  const SOURCE = 'The annotated.com brief';
  const TAGS = ['Hot take', 'Fact check', 'Steelman', 'Receipts', 'Explainer'];
  const EMOJI = ['👍', '🔥', '🤔', '😂'];
  const MORE = [
    ['Floating panel', 'Keep annotated in the side panel, or float it over the page and move it where you like.'],
    ['Six highlighter colours', 'Yellow, apricot, rose, lilac, sky or mint, and the pen on the page follows your choice.'],
    ['Light and dark', 'Every panel and page has a dark half, chosen on its own or by your system.'],
    ['Voice notes', 'Say your take out loud instead of typing it, up to a minute.'],
    ['GIFs', 'Search GIPHY from the take box or a comment.'],
    ['Photos and videos', 'Drop a picture or a short video of your own into a take.'],
    ['Save a clip as a GIF', 'Any video clip you annotate can be saved as a GIF, made on your computer.'],
    ['Undo', 'Changed your mind? Undo takes it back for ten seconds after publishing.'],
    ['Works signed out', 'Save annotations on your computer without an account, and publish them when you sign in.'],
    ['Keyboard shortcut', 'Open the panel from any page with Alt + Shift + K.'],
    ['Live streams', 'Clip the last stretch of a live stream as it plays.'],
    ['For you', 'A feed of other people\'s annotations, with the reason each one is there.'],
  ];

  function row(root, { title, lead, body }) {
    const r = document.createElement('div');
    r.className = 'ftRow';
    r.innerHTML = `<div class="ftCopy"><h3></h3><p></p></div><div class="ftDemo"><span class="ftEx">Example</span></div>`;
    r.querySelector('h3').textContent = title;
    r.querySelector('.ftCopy p').textContent = lead;
    r.querySelector('.ftDemo').insertAdjacentHTML('beforeend', body);
    root.appendChild(r);
    return r.querySelector('.ftDemo');
  }

  // 1. A take with a tag, a poll and reactions, and the card it becomes, drawn as you go.
  function sayIt(root) {
    const d = row(root, {
      title: 'Say it your way',
      lead: 'Words are only the start. Tag your take, ask a poll, and let people react.',
      body: `<div class="ftMake">
          <p class="ftQuote"><mark>${esc(QUOTE)}</mark></p>
          <label class="ftLbl" for="ftTake">Your take</label>
          <textarea id="ftTake" class="ftTake" rows="2" maxlength="200" placeholder="What should people notice?">Links back to the source, every time. That is the whole point.</textarea>
          <div class="ftTags" role="radiogroup" aria-label="Tag">${TAGS.map((t) => `<button type="button" class="ftTag" role="radio" aria-checked="false">${t}</button>`).join('')}</div>
          <button type="button" class="ftPollBtn" aria-expanded="false">${icon('poll')} Add a poll</button>
          <div class="ftPollEdit" hidden><input class="ftPq" maxlength="80" value="Should every clip link its source?" aria-label="Poll question"><input class="ftPo" maxlength="30" value="Yes, always" aria-label="First choice"><input class="ftPo" maxlength="30" value="Not for memes" aria-label="Second choice"></div>
        </div>
        <div class="ftCard" aria-live="polite">
          <p class="ftMeta"><span class="ftAv" aria-hidden="true">Y</span> You <span class="ftDot">just now</span> <span class="ftTagOut" hidden></span></p>
          <p class="ftTakeOut"></p>
          <div class="ftPoll" hidden><p class="ftPollQ"></p><div class="ftChoices"></div></div>
          <p class="ftSrc">${icon('article')} ${esc(SOURCE)}</p>
          <div class="ftReact">${EMOJI.map((e) => `<button type="button" class="ftR" aria-pressed="false"><span>${e}</span><b>0</b></button>`).join('')}</div>
        </div>`,
    });
    const take = d.querySelector('.ftTake'), out = d.querySelector('.ftTakeOut');
    const drawTake = () => { out.textContent = take.value.trim() || 'Your take goes here.'; };
    take.addEventListener('input', drawTake); drawTake();
    d.querySelectorAll('.ftTag').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-checked') !== 'true';
      d.querySelectorAll('.ftTag').forEach((x) => x.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', String(on));
      const t = d.querySelector('.ftTagOut'); t.hidden = !on; t.textContent = b.textContent;
    }));
    // The poll: the question and two choices, which can be voted on in the card, one vote.
    const votes = [0, 0]; let mine = -1;
    const drawPoll = () => {
      const q = d.querySelector('.ftPq').value.trim(), opts = [...d.querySelectorAll('.ftPo')].map((i) => i.value.trim() || 'A choice');
      d.querySelector('.ftPollQ').textContent = q || 'Your question';
      const total = votes[0] + votes[1];
      const box = d.querySelector('.ftChoices'); box.innerHTML = '';
      opts.forEach((o, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ftChoice'; b.setAttribute('aria-pressed', String(mine === i));
        const pct = total ? Math.round((votes[i] / total) * 100) : 0;
        b.innerHTML = `<span class="ftBar" style="width:${pct}%"></span><span class="ftCt"></span><b>${total ? pct + '%' : ''}</b>`;
        b.querySelector('.ftCt').textContent = o;
        b.addEventListener('click', () => { if (mine >= 0) votes[mine]--; mine = mine === i ? -1 : i; if (mine >= 0) votes[mine]++; drawPoll(); });
        box.appendChild(b);
      });
    };
    const pb = d.querySelector('.ftPollBtn');
    pb.addEventListener('click', () => {
      const open = pb.getAttribute('aria-expanded') !== 'true';
      pb.setAttribute('aria-expanded', String(open));
      pb.innerHTML = `${icon('poll')} ${open ? 'Remove the poll' : 'Add a poll'}`;
      d.querySelector('.ftPollEdit').hidden = !open; d.querySelector('.ftPoll').hidden = !open;
      if (open) drawPoll();
    });
    d.querySelectorAll('.ftPq, .ftPo').forEach((i) => i.addEventListener('input', drawPoll));
    d.querySelectorAll('.ftR').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on)); b.querySelector('b').textContent = on ? '1' : '0';
    }));
  }

  // 2. The page an annotation gets: its take on top, the source under it, and a conversation that works.
  function page(root) {
    const d = row(root, {
      title: 'It lands as a page',
      lead: 'Every annotation gets a page of its own with a link to share. People react, reply, and can file a claim if something is wrong. The source is always one click away.',
      body: `<div class="ftPage">
          <p class="ftMeta"><span class="ftAv" aria-hidden="true">Y</span> You <span class="ftDot">just now</span> <span class="ftTagOut">Explainer</span></p>
          <p class="ftTakeOut">Links back to the source, every time. That is the whole point.</p>
          <blockquote class="ftQ"><mark>${esc(QUOTE)}</mark></blockquote>
          <p class="ftSrcRow"><span>${icon('article')} ${esc(SOURCE)}</span><a class="link" href="https://annotated.lovable.app/" target="_blank" rel="noopener">Read the brief ${icon('external')}</a></p>
          <div class="ftBar2"><div class="ftReact">${EMOJI.slice(0, 3).map((e) => `<button type="button" class="ftR" aria-pressed="false"><span>${e}</span><b>0</b></button>`).join('')}</div>
            <button type="button" class="ftClaim">${icon('flag')} File a claim</button></div>
          <form class="ftClaimForm" hidden><label for="ftWhy">What is wrong with it?</label><select id="ftWhy"><option>The quote is not in the source</option><option>It is misleading</option><option>It is mine and was used without permission</option><option>Something else</option></select>
            <button type="submit" class="ghost sm">Send the claim</button><p class="ftSaid" hidden>On a real page this reaches the people who run annotated. This is an example, so nothing was sent.</p></form>
          <form class="ftComment"><input class="ftCIn" maxlength="140" placeholder="Reply to this annotation" aria-label="Reply"><button type="submit" class="ghost sm">Reply</button></form>
          <ul class="ftComments"></ul>
        </div>`,
    });
    d.querySelectorAll('.ftR').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on)); b.querySelector('b').textContent = on ? '1' : '0';
    }));
    const cf = d.querySelector('.ftClaimForm');
    d.querySelector('.ftClaim').addEventListener('click', () => { cf.hidden = !cf.hidden; cf.querySelector('.ftSaid').hidden = true; });
    cf.addEventListener('submit', (e) => { e.preventDefault(); cf.querySelector('.ftSaid').hidden = false; });
    const form = d.querySelector('.ftComment'), inp = form.querySelector('.ftCIn'), list = d.querySelector('.ftComments');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = inp.value.trim(); if (!t) { inp.focus(); return; }
      const li = document.createElement('li');
      li.innerHTML = '<span class="ftAv" aria-hidden="true">Y</span><span><b>You</b> <span class="ftDot">just now</span><br><span class="ftCt"></span></span>';
      li.querySelector('.ftCt').textContent = t;
      list.appendChild(li); inp.value = '';
      while (list.children.length > 3) list.firstElementChild.remove();
    });
  }

  // 3. A podcast on an app that will not let its audio be recorded: found by name, cut from the show's own file.
  function podcast(root) {
    const d = row(root, {
      title: 'Clip what\'s playing, even on Spotify',
      lead: 'Spotify and Amazon Music lock their audio. annotated finds the same episode in Apple\'s free podcast directory and cuts your moment from the show\'s own file, so the clip is exact and nothing is re-recorded.',
      body: `<ol class="ftSteps" role="tablist" aria-label="How it finds the episode">
          <li><button type="button" role="tab" class="ftStep" aria-selected="true">1. Playing</button></li>
          <li><button type="button" role="tab" class="ftStep" aria-selected="false">2. Found</button></li>
          <li><button type="button" role="tab" class="ftStep" aria-selected="false">3. Clipped</button></li></ol>
        <div class="ftFrames">
          <div class="ftFrame" role="tabpanel"><div class="ftPlayer"><span class="ftArt" aria-hidden="true">${icon('podcast')}</span><span><b>So You Want to be an Astronaut?</b><br><span class="ftDot">Houston We Have a Podcast</span></span><span class="ftPlay" aria-hidden="true">${icon('play')}</span></div>
            <div class="ftProg"><i style="width:12%"></i></div><p class="ftCap">An episode playing in a podcast app whose audio cannot be recorded.</p></div>
          <div class="ftFrame" role="tabpanel" hidden><div class="ftFind"><p class="ftLbl">Episode</p><p class="ftField">So You Want to be an Astronaut?</p>
            <p class="ftHit">${icon('check')} <span><b>So You Want to be an Astronaut?</b><br><span class="ftDot">Houston We Have a Podcast · NASA · 11:04</span></span></p></div>
            <p class="ftCap">The panel reads the episode's name from the app and finds it in Apple's podcast directory.</p></div>
          <div class="ftFrame" role="tabpanel" hidden><div class="ftWave" aria-hidden="true"></div><p class="ftTimes"><span>1:00</span><b>Your clip, 1:16 to 1:38, 22 seconds</b><span>1:56</span></p>
            <p class="ftCap">Your moment is cut from the show's own file, on its own frames, with nothing re-recorded.</p></div>
        </div>
        <p class="ftCredit">Episode by NASA, <a class="link" href="https://www.nasa.gov/podcasts/houston-we-have-a-podcast/" target="_blank" rel="noopener">Houston We Have a Podcast</a>. NASA does not endorse annotated.</p>`,
    });
    const steps = [...d.querySelectorAll('.ftStep')], frames = [...d.querySelectorAll('.ftFrame')];
    let cur = 0, timer = null, touched = false;
    const show = (i) => { cur = i; steps.forEach((s, j) => s.setAttribute('aria-selected', String(i === j))); frames.forEach((f, j) => { f.hidden = i !== j; }); };
    steps.forEach((s, i) => s.addEventListener('click', () => { touched = true; clearInterval(timer); show(i); }));
    // The waveform of the episode around the moment, from the episode's own loudness.
    fetch('/media/astronaut-peaks.json').then((r) => r.json()).then((p) => {
      const w = d.querySelector('.ftWave'), from = 60, to = 116, n = 56;
      for (let i = 0; i < n; i++) {
        const t = from + (i * (to - from)) / n, v = p.peaks[Math.floor(t / p.every)] || 0.2;
        const bar = document.createElement('i'); bar.style.height = Math.round(12 + v * 44) + 'px';
        if (t >= 76 && t <= 98) bar.className = 'in';
        w.appendChild(bar);
      }
    }).catch(() => {});
    // It steps through by itself once it is in sight, until a step is pressed. Reduced motion leaves it alone.
    if (!still() && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => {
          clearInterval(timer);
          if (e.isIntersecting && !touched) timer = setInterval(() => show((cur + 1) % frames.length), 3200);
        });
      }, { threshold: 0.5 });
      io.observe(d);
    }
  }

  function more(root) {
    const m = document.createElement('div');
    m.className = 'ftMore';
    m.innerHTML = `<p class="ftMoreH">And</p><ul class="ftChips">${MORE.map(([t, tip]) => `<li><button type="button" class="ftChip" aria-describedby="">${esc(t)}</button><span class="ftTip" role="tooltip">${esc(tip)}</span></li>`).join('')}</ul>`;
    root.appendChild(m);
    // A chip says what it means on hover and on focus, and a tap shows it on a phone.
    m.querySelectorAll('.ftChip').forEach((b, i) => {
      const tip = b.nextElementSibling; tip.id = 'ftTip' + i; b.setAttribute('aria-describedby', tip.id);
      b.addEventListener('click', () => { const open = !b.parentElement.classList.contains('open'); m.querySelectorAll('li.open').forEach((x) => x.classList.remove('open')); b.parentElement.classList.toggle('open', open); });
    });
    document.addEventListener('click', (e) => { if (!m.contains(e.target)) m.querySelectorAll('li.open').forEach((x) => x.classList.remove('open')); });
  }

  function mount(root) {
    const s = document.createElement('section');
    s.className = 'landFeatures'; s.id = 'more';
    s.innerHTML = '<h2 class="ftH">What else it does</h2>';
    root.appendChild(s);
    sayIt(s); page(s); podcast(s); more(s);
    return s;
  }
  return { mount };
})();

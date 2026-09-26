// "What else it does", on the front page under Yours so far (David, 2026-09-25: the extension does far more than the
// four try-it tabs show). Three small working demonstrations and a line of the rest. Each is labelled Example,
// sends nothing and keeps nothing, like the try-it above it.
//   1. Tags, polls and reactions: a take on a real post, with a tag, a poll and reactions, drawn as the card it becomes.
//   2. Every annotation gets its own page: a finished page, with reactions, a reply box and File a claim that work.
//   3. Clip podcasts from Spotify: found by name in Apple's directory, cut from the show's own file.
//   4. For you, and why: a feed of annotations of real posts, each saying why it is there.
// The examples quote real public posts on X, word for word as X shows them, each linked (David, 2026-09-25: every
// example quoted the same line of the brief). The takes are ours and marked Example; no like or view counts are
// shown, since those change. "If the post gets deleted" was taken out at David's word the same day.
var Features = (() => {
  const icon = (n) => (typeof Brand !== 'undefined' ? Brand.icon(n) : '');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const POSTS = {
    jason: { name: 'jason', handle: '@Jason', date: 'Sep 19, 2026', url: 'https://x.com/Jason/status/2101344059906314387',
      before: 'We are offering five PAID, full-time slots in our Associate-in-training program. This program is for the most driven fanatics, out of school (or sometimes, but rarely, career-changing), ',
      quote: 'who want to work 60/70+ hours a week to become legendary venture capitalists', after: " — and who don't want to wait in line." },
    tim: { name: "Tim O'Reilly", handle: '@timoreilly', date: 'Sep 24, 2026', url: 'https://x.com/timoreilly/status/2103245779489972264',
      before: 'This says a lot about "the frontier wins everything" narrative. ',
      quote: "We have planes that fly 3x the speed of sound but airlines don't use them.", after: ' We have cars that go hundreds of miles an hour, but we just use them for racing, not for ordinary driving.' },
    sawyer: { name: 'Sawyer Merritt', handle: '@SawyerMerritt', date: 'Sep 25, 2026', url: 'https://x.com/SawyerMerritt/status/2103612173687861404',
      before: 'SpaceXAI has just introduced Grok @Bot Creator Rewards! … In the last two weeks, ',
      quote: 'I’ve earned $500 in rewards', after: ' due to people using my Home Robots template 🔥' },
  };
  // A post as it reads on X, with the quoted words marked. Words, name and handle only, and a link to the real post.
  const post = (p, cls = '') => `<div class="ftRPost ${cls}"><div class="ftRHead"><span class="ftAv" aria-hidden="true">${esc(p.name[0].toUpperCase())}</span><span><b>${esc(p.name)}</b> <span class="ftDot">${esc(p.handle)} · ${esc(p.date)}</span></span><a class="ftXLink" href="${p.url}" target="_blank" rel="noopener" aria-label="See the post on X">${icon('x')}</a></div>
    <p class="ftRText">${esc(p.before)}<mark>${esc(p.quote)}</mark>${esc(p.after)}</p></div>`;
  const srcLine = (p) => `${icon('x')} ${esc(p.name)} on X`;
  const TAGS = ['Hot take', 'Fact check', 'Steelman', 'Receipts', 'Explainer'];
  const EMOJI = ['👍', '🔥', '🤔', '😂'];
  const MORE = [
    ['Floating panel', 'Use it as a side panel, or float it over the page and drag it anywhere.'],
    ['Six highlighter colours', 'Yellow, apricot, rose, lilac, sky or mint.'],
    ['Light and dark', 'Follows your system, or pick one.'],
    ['Voice notes', 'Record your take instead of typing it, up to a minute.'],
    ['GIFs', 'Search GIPHY from the take box or a comment.'],
    ['Photos and videos', 'Add your own photo or short video to a take.'],
    ['Save a clip as a GIF', 'Turn any video clip into a GIF, made on your computer.'],
    ['Undo', 'You have ten seconds after publishing to take it back.'],
    ['Works signed out', 'No account needed to start. Sign in later to publish.'],
    ['Keyboard shortcut', 'Alt + Shift + K opens the panel on any page.'],
    ['Live streams', "Clip a live stream while it's still going."],
    ['Most talked about', 'The panel shows what people here are discussing most, so you know where to start.'],
    ['Trending and people to follow', "What people here are annotating this week, and who's worth following."],
    ['Invite by email', 'Send someone a link to an annotation from its page.'],
    ['Already annotated?', "It warns you if you've already annotated the same thing."],
    ['Drafts are kept', 'Reload the page and your half-written take is still there.'],
    ['Clips are checked', 'Before a clip goes up, its length, picture and sound are checked.'],
    ['Works offline', "Offline, it saves to your computer and publishes once you're back."],
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
      title: 'Tags, polls and reactions',
      lead: 'Tag a take as a fact check or a hot take, add a poll, and let people react with an emoji. Try it here.',
      body: `<div class="ftMake">
          ${post(POSTS.jason, 'ftSmall')}
          <label class="ftLbl" for="ftTake">Your take</label>
          <textarea id="ftTake" class="ftTake" rows="2" maxlength="200" placeholder="What should people notice?">Seven days a week for two years. Who is this really for?</textarea>
          <div class="ftTags" role="radiogroup" aria-label="Tag">${TAGS.map((t) => `<button type="button" class="ftTag" role="radio" aria-checked="false">${t}</button>`).join('')}</div>
          <button type="button" class="ftPollBtn" aria-expanded="false">${icon('poll')} Add a poll</button>
          <div class="ftPollEdit" hidden><input class="ftPq" maxlength="80" value="Would you take this job?" aria-label="Poll question"></div>
        </div>
        <div class="ftCard" aria-live="polite">
          <p class="ftMeta"><span class="ftAv" aria-hidden="true">Y</span> You <span class="ftDot">just now</span> <span class="ftTagOut" hidden></span></p>
          <p class="ftTakeOut"></p>
          <div class="ftPoll" hidden><p class="ftPollQ"></p><div class="ftChoices"></div></div>
          <blockquote class="ftQ ftQs"><mark>${esc(POSTS.jason.quote)}</mark></blockquote>
          <p class="ftSrc">${srcLine(POSTS.jason)}</p>
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
      // The choices are in the card only; the editor holds the question, where both showed them twice (recording
      // of 2026-09-25 at 15:38, 2:53).
      const q = d.querySelector('.ftPq').value.trim(), opts = ['Yes, sign me up', 'No, thanks'];
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
    d.querySelector('.ftPq').addEventListener('input', drawPoll);
    d.querySelectorAll('.ftR').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on)); b.querySelector('b').textContent = on ? '1' : '0';
    }));
  }

  // 2. The page an annotation gets: its take on top, the source under it, and a conversation that works.
  function page(root) {
    const d = row(root, {
      title: 'Every annotation gets its own page',
      lead: 'You get a link you can share. People can reply and react, and anyone can file a claim if an annotation gets something wrong. The original is linked right there.',
      body: `<div class="ftPage">
          <p class="ftMeta"><span class="ftAv" aria-hidden="true">Y</span> You <span class="ftDot">just now</span> <span class="ftTagOut">Steelman</span></p>
          <p class="ftTakeOut">The best answer yet to "the frontier wins everything". Fast isn't what people pay for.</p>
          ${post(POSTS.tim)}
          <p class="ftSrcRow"><span>${srcLine(POSTS.tim)}</span><a class="link" href="${POSTS.tim.url}" target="_blank" rel="noopener">See the post on X ${icon('external')}</a></p>
          <div class="ftBar2"><div class="ftReact">${EMOJI.map((e) => `<button type="button" class="ftR" aria-pressed="false"><span>${e}</span><b>0</b></button>`).join('')}</div>
            <button type="button" class="ftClaim">${icon('flag')} File a claim</button></div>
          <form class="ftClaimForm" hidden><label for="ftWhy">What is wrong with it?</label><select id="ftWhy"><option>The quote is not in the source</option><option>It is misleading</option><option>It is mine and was used without permission</option><option>Something else</option></select>
            <button type="submit" class="ghost sm">Send the claim</button><p class="ftSaid" hidden>This is only an example, so nothing was sent. On a real page the claim comes to us.</p></form>
          <form class="ftComment"><input class="ftCIn" maxlength="140" placeholder="Reply to this annotation" aria-label="Reply"><button type="submit" class="ghost sm">Reply</button></form>
          <ul class="ftComments"></ul>
        </div>
        <div class="ftShare"><p class="ftLbl">How the link looks when you post it on X</p>
          <div class="ftXCard" aria-label="How the link looks in a post on X"><div class="ftXImg"><span class="ftXTake">The best answer yet to "the frontier wins everything". Fast isn't what people pay for.</span><span class="ftXFrom">${srcLine(POSTS.tim)}</span></div>
            <p class="ftXMeta"><span>annotated-app.netlify.app</span><b>“Fast isn't what people pay for.” on annotated</b></p></div></div>`,
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
      title: 'Clip podcasts from Spotify',
      lead: "Spotify and Amazon Music don't let anything record their audio. So annotated finds the same episode in Apple's podcast directory and cuts your clip from the show's own file.",
      body: `<ol class="ftSteps" role="tablist" aria-label="How it finds the episode">
          <li><button type="button" role="tab" class="ftStep" aria-selected="true">1. Playing</button></li>
          <li><button type="button" role="tab" class="ftStep" aria-selected="false">2. Found</button></li>
          <li><button type="button" role="tab" class="ftStep" aria-selected="false">3. Clipped</button></li></ol>
        <div class="ftFrames">
          <div class="ftFrame" role="tabpanel"><div class="ftPlayer"><span class="ftArt" aria-hidden="true">${icon('podcast')}</span><span><b>So You Want to be an Astronaut?</b><br><span class="ftDot">Houston We Have a Podcast</span></span><button type="button" class="ftPlay" aria-label="Play the episode">${icon('play')}</button></div>
            <div class="ftProg"><i style="width:12%"></i></div><p class="ftCap">Playing in Spotify, which can't be recorded.</p></div>
          <div class="ftFrame" role="tabpanel" hidden><div class="ftFind"><p class="ftLbl">Episode</p><p class="ftField">So You Want to be an Astronaut?</p>
            <p class="ftHit">${icon('check')} <span><b>So You Want to be an Astronaut?</b><br><span class="ftDot">Houston We Have a Podcast · NASA · 11:04</span></span></p></div>
            <p class="ftCap">annotated reads the episode title and finds it in Apple's directory.</p></div>
          <div class="ftFrame" role="tabpanel" hidden><div class="ftWave" role="button" tabindex="0" aria-label="Play the clip, 1:16 to 1:38" title="Play the clip"></div><p class="ftTimes"><span>1:00</span><b>Your clip, 1:16 to 1:38, 22 seconds</b><span>1:56</span></p>
            <p class="ftCap">Your clip, cut straight from the show's file.</p></div>
        </div>
        <p class="ftCredit">Episode by NASA, <a class="link" href="https://www.nasa.gov/podcasts/houston-we-have-a-podcast/" target="_blank" rel="noopener">Houston We Have a Podcast</a>. NASA does not endorse annotated.</p>`,
    });
    const steps = [...d.querySelectorAll('.ftStep')], frames = [...d.querySelectorAll('.ftFrame')];
    // The player's button plays the episode and the clipped waveform plays the clip, 1:16 to 1:38, from the file
    // the site already has. Both looked like buttons and did nothing (recording of 2026-09-25 at 15:38, 2:05, 2:15).
    let audio = null, stopAt = null;
    const setPlaying = (on) => { d.querySelector('.ftPlay').innerHTML = icon(on ? 'stop' : 'play'); d.querySelector('.ftPlay').setAttribute('aria-label', on ? 'Pause' : 'Play the episode'); d.querySelector('.ftWave').classList.toggle('playing', on && stopAt != null); };
    const play = (from, to) => {
      if (!audio) {
        audio = new Audio('/media/astronaut.mp3'); audio.preload = 'auto';
        audio.addEventListener('timeupdate', () => {
          if (stopAt != null && audio.currentTime >= stopAt) { audio.pause(); }
          const bar = d.querySelector('.ftProg i'); if (bar && audio.duration) bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
        });
        audio.addEventListener('pause', () => { stopAt = null; setPlaying(false); });
        audio.addEventListener('play', () => setPlaying(true));
      }
      if (!audio.paused && stopAt === to) { audio.pause(); return; }
      stopAt = to; audio.currentTime = from; audio.play().catch(() => {});
      touched = true; clearInterval(timer);
    };
    d.querySelector('.ftPlay').addEventListener('click', () => { if (audio && !audio.paused && stopAt == null) audio.pause(); else play(audio && audio.currentTime > 0 && stopAt == null ? audio.currentTime : 76, null); });
    d.querySelector('.ftWave').addEventListener('click', () => play(76, 98));
    d.querySelector('.ftWave').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(76, 98); } });
    // Leaving the tab or scrolling away keeps playing only what was asked for; a new step pauses it.
    steps.forEach((s) => s.addEventListener('click', () => { if (audio && !audio.paused) audio.pause(); }));
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

  // 4. For you: a feed of annotations of real posts, each carrying the reason it is there, as the real feed does. The
  // readers who made them are made up and the takes are ours, so the whole row is marked Example; the posts are real.
  function forYou(root) {
    const CARDS = [
      { who: 'Sam', why: 'You follow Sam', tag: 'Steelman', take: 'Supersonic planes exist and nobody flies them. A good check on the hype.', p: POSTS.tim },
      { who: 'Priya', why: 'Popular this week', tag: 'Hot take', take: 'Seven days a week for two years. Is this a job or a dare?', p: POSTS.jason },
      { who: 'Leo', why: 'You annotated this post too', tag: 'Fact check', take: '$500 in two weeks from one template. How many people used it to earn that?', p: POSTS.sawyer },
    ];
    const d = row(root, {
      title: 'For you, and why',
      lead: 'Your feed brings annotations from people you follow and posts people are talking about, and every card says why it is there. Follow someone and theirs come to you.',
      body: `<div class="ftTabs" role="tablist" aria-label="Which annotations"><button type="button" role="tab" aria-selected="true">For you</button><button type="button" role="tab" aria-selected="false">Following</button></div>
        <ul class="ftFeed">${CARDS.map((c, i) => `<li class="ftCard ftFY" data-i="${i}">
          <p class="ftWhy">${icon('info')} <span>${esc(c.why)}</span></p>
          <p class="ftMeta"><span class="ftAv" aria-hidden="true">${esc(c.who[0])}</span> ${esc(c.who)} <span class="ftDot">Example reader</span> <span class="ftTagOut">${esc(c.tag)}</span>
            <button type="button" class="ghost sm ftFollow" aria-pressed="${i === 0}">${i === 0 ? 'Following' : 'Follow'}</button></p>
          <p class="ftTakeOut">${esc(c.take)}</p>
          <blockquote class="ftQ ftQs"><mark>${esc(c.p.quote)}</mark></blockquote>
          <p class="ftSrc"><a class="link" href="${c.p.url}" target="_blank" rel="noopener">${srcLine(c.p)}</a></p></li>`).join('')}</ul>
        <p class="ftCap ftFYNote" hidden></p>`,
    });
    const tabs = [...d.querySelectorAll('.ftTabs [role="tab"]')], note = d.querySelector('.ftFYNote');
    const following = () => [...d.querySelectorAll('.ftFY')].filter((c) => c.querySelector('.ftFollow').getAttribute('aria-pressed') === 'true');
    const draw = () => {
      const onFollowing = tabs[1].getAttribute('aria-selected') === 'true', mine = following();
      d.querySelectorAll('.ftFY').forEach((c) => { c.hidden = onFollowing && !mine.includes(c); });
      note.hidden = !onFollowing || mine.length > 0;
      note.textContent = 'Follow someone and their annotations show up here.';
    };
    tabs.forEach((t, i) => t.addEventListener('click', () => { tabs.forEach((x, j) => x.setAttribute('aria-selected', String(i === j))); draw(); }));
    // Follow changes what Following holds, and the card's reason says so.
    d.querySelectorAll('.ftFollow').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Following' : 'Follow';
      const card = b.closest('.ftFY'), c = CARDS[+card.dataset.i];
      card.querySelector('.ftWhy span').textContent = on ? `You follow ${c.who}` : (+card.dataset.i === 0 ? 'Popular this week' : c.why);
      draw();
    }));
  }

  function more(root) {
    const m = document.createElement('div');
    m.className = 'ftMore';
    m.innerHTML = `<p class="ftMoreH">Also</p><ul class="ftChips">${MORE.map(([t, tip]) => `<li><button type="button" class="ftChip" aria-describedby="">${esc(t)}</button><span class="ftTip" role="tooltip">${esc(tip)}</span></li>`).join('')}</ul>`;
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
    s.innerHTML = `<h2 class="ftH">Other things it does</h2>${typeof PaperDeco !== 'undefined' ? PaperDeco.rule() : ''}`;
    root.appendChild(s);
    sayIt(s); page(s); podcast(s); forYou(s); more(s);
    arrive(s);
    return s;
  }

  // Each example arrives the way an annotation does after publishing: folded as a paper plane, it flies in and
  // opens out as itself, the first time it comes into view (David, 2026-09-25). One at a time, in page order. With
  // the planes off (reduced motion, the switch at the foot, a phone) they are simply there.
  function arrive(section) {
    // Off wherever the rest of the front page's planes are off (planes.js): ?noplanes, a phone, a touch screen.
    if (typeof Fold === 'undefined' || !Fold.on() || !('IntersectionObserver' in window)) return;
    // Once a browser visit. On the third return to the home page the same planes were still flying in (recording of
    // 2026-09-25 at 23:23, 0:55, 3:14 and 3:20); after the first time the examples are simply there.
    let flown = false;
    try { flown = !!sessionStorage.getItem('annotated-features-flown'); } catch {}
    if (flown) return;
    const markFlown = () => { try { sessionStorage.setItem('annotated-features-flown', '1'); } catch {} };
    if (/[?&]noplanes\b/.test(location.search) || matchMedia('(max-width: 760px), (hover: none)').matches) return;
    const demos = [...section.querySelectorAll('.ftDemo')];
    // Each one comes its own way, so four in a row do not read as one trick repeated: a glide from behind, a wide
    // swing in from the right, a steep drop from high up, a long S from the far left. A little is left to chance on
    // every visit, and the row of smaller features closes the section in its own way (see chips).
    const jitter = () => (Math.random() - .5) * 24;
    // Height is what makes a plane look big as it falls, so every path starts low enough that the plane is never
    // much larger than the card it becomes; the steep drop reads through its speed and angle, not its height. At
    // 420 it was twice the card's size (recording of 2026-09-25 at 19:26, 1:09 and 2:12).
    const STYLES = [
      { approach: 0, dist: 300, swoop: .15, z0: 80, T: 1100, unfold: 'cascade' },
      { approach: 75, dist: 440, swoop: -.45, z0: 70, T: 1300, unfold: 'flutter' },
      { approach: -55, dist: 240, swoop: .05, z0: 100, T: 800, unfold: 'snap' },
      { approach: 140, dist: 520, swoop: .38, z0: 60, T: 1500, unfold: 'spin' },
    ];
    demos.forEach((d) => d.classList.add('pl-hidden', 'ftWaiting'));
    let queue = Promise.resolve();
    const land = (d) => {
      queue = queue.then(() => new Promise((done) => {
        if (!d.classList.contains('ftWaiting')) return done();
        d.classList.remove('ftWaiting'); markFlown();
        const w = Math.max(1, d.offsetWidth), st = STYLES[demos.indexOf(d) % STYLES.length];
        let over = false; const end = () => { if (over) return; over = true; d.classList.remove('pl-hidden'); done(); };
        // Sized from the card: the plane is about 150 pixels long whatever the card's width, and starts in sight.
        Fold.arrive(d, { ...st, approach: st.approach + jitter(), openT: 1100, s0: Fold.clamp(150 / w, .14, .3), within: true }).then(end);
        // Never held longer than the flight, whatever becomes of it.
        setTimeout(end, 3500);
      }));
    };
    // Only once the page is scrolled: whatever is already in sight as the page opens is simply there, so these never
    // fly at the same moment as the brief and the install button.
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); land(e.target); } }), { threshold: 0.35 });
    demos.forEach((d) => { const r = d.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) d.classList.remove('pl-hidden', 'ftWaiting'); });
    addEventListener('scroll', () => demos.forEach((d) => { if (d.classList.contains('ftWaiting')) io.observe(d); }), { once: true, passive: true });
    // The row of smaller features closes the section differently: a little flock of three small planes, each carrying
    // part of the row, comes in from the left, staggered, and as they open the chips pop into place one after another.
    const chips = section.querySelector('.ftChips');
    if (chips) {
      chips.classList.add('ftFlock');
      const items = [...chips.children];
      const groups = [0, 1, 2].map((g) => items.filter((_, i) => i % 3 === g));
      const flock = () => {
        chips.classList.remove('ftFlock'); markFlown();
        items.forEach((li) => li.classList.add('ftChipWait'));
        groups.forEach((g, gi) => {
          const lead = g[0]; if (!lead) return;
          setTimeout(() => {
            // About 110 pixels long whatever the chip's width: at half a chip they were specks over an empty row.
            Fold.arrive(lead, { approach: 150 + gi * 25 + jitter(), dist: 520, swoop: .3 - gi * .2, z0: 90, T: 900 + gi * 120, openT: 500, s0: Fold.clamp(110 / Math.max(1, lead.offsetWidth), .5, 1.2), within: true, unfold: ['snap', 'spin', 'flutter'][gi % 3] })
              .then(() => g.forEach((li, k) => setTimeout(() => { li.classList.remove('ftChipWait'); li.classList.add('ftChipPop'); }, k * 70)));
          }, gi * 260);
        });
        setTimeout(() => items.forEach((li) => li.classList.remove('ftChipWait')), 4000);
      };
      // It goes as soon as the row is in sight rather than waiting its turn behind the examples above, which left
      // 'Also' over a blank row for two seconds (recording of 2026-09-25 at 23:23, 1:04 and 3:23).
      const cio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { cio.disconnect(); flock(); } }), { threshold: .6 });
      const cr = chips.getBoundingClientRect();
      if (cr.top < innerHeight && cr.bottom > 0) chips.classList.remove('ftFlock');
      else addEventListener('scroll', () => cio.observe(chips), { once: true, passive: true });
    }
    // A click or a key anywhere finishes every flight, as elsewhere on the page, and whatever is still waiting shows.
    const skip = () => { demos.forEach((d) => { if (d.classList.contains('ftWaiting')) { d.classList.remove('ftWaiting', 'pl-hidden'); io.unobserve(d); } }); if (chips) { chips.classList.remove('ftFlock'); chips.querySelectorAll('.ftChipWait').forEach((x) => x.classList.remove('ftChipWait')); } };
    addEventListener('keydown', skip, { once: true });
  }
  return { mount };
})();

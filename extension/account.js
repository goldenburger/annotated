// The account button in the panel's top bar: "Sign in" (Google or X), or your photo with a small menu.
const Account = (() => {
  const G = '<svg class="gmark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  const X = '<svg class="xmark" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-7.2 8.2L23.3 22h-6.6l-5.2-6.8L5.6 22H2.5l7.7-8.8L2 2h6.8l4.7 6.2L18.9 2zm-1.2 18h1.8L7.4 3.9H5.5L17.7 20z"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let me = null, btn = null, pop = null;
  const subs = [];
  // What the panel does for the two actions here. The menu only asks.
  let actions = {};
  const HANDLE = /^[a-z0-9_]{2,30}$/;
  const site = () => (typeof Backend !== 'undefined' && Backend.site ? Backend.site.replace(/^https?:\/\//, '') : 'annotated-app.netlify.app');

  function draw() {
    if (!btn) return;
    btn.classList.toggle('signedIn', !!me);
    if (me) {
      btn.innerHTML = /^https:\/\//.test(me.avatar || '') ? `<img src="${esc(me.avatar)}" alt="" referrerpolicy="no-referrer">` : esc((me.name || '?').slice(0, 1).toUpperCase());
      btn.setAttribute('aria-label', `Signed in as ${me.name}. Account menu`);
      btn.title = me.name;
    } else {
      btn.innerHTML = `${G} Sign in`;
      btn.setAttribute('aria-label', 'Sign in with Google or X');
      btn.title = 'Sign in with Google or X';
    }
    // Lets the panel show the "sign in to publish" line above Publish while signed out.
    document.body.classList.toggle('signedOut', !me);
    subs.forEach((f) => f(me));
  }
  // A sign-in asked for from elsewhere in the panel waits here until a way in is chosen, or the card is put away.
  let waiting = null;
  // Putting the card away answers whoever is waiting, with whoever is signed in by then (bug audit of 2026-09-29: it
  // answered only when signed out, so a sign-in finished elsewhere left "Sign in and publish" waiting for ever).
  // open() puts the old card away without answering, since the new card keeps the question open.
  const answer = (p) => { if (waiting) { const r = waiting; waiting = null; r(p); } };
  function close(keep = false) { if (pop) { pop.remove(); pop = null; } if (!keep) answer(me); }
  function open(errText) {
    close(true);
    // The menu and the help screen put each other away, where they opened one over the other (recording of
    // 2026-09-25 at 15:38, 0:39).
    if (document.body.classList.contains('welcoming') && typeof PanelKit !== 'undefined' && PanelKit.closeWelcome) {
      try { localStorage.setItem('annotated-welcome-seen', '1'); } catch { /* nowhere to keep it */ }
      PanelKit.closeWelcome();
    }
    pop = document.createElement('div');
    pop.className = 'acctPop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Account');
    pop.innerHTML = me
      ? `<div class="who"><span class="avatar ${me.avatar ? 'hasImg' : ''}" aria-hidden="true">${me.avatar ? `<img src="${esc(me.avatar)}" alt="" referrerpolicy="no-referrer">` : esc(me.name.slice(0, 1))}</span>
           <div><b>${esc(me.name)}</b><span class="acctAt">${me.handle ? '@' + esc(me.handle) : ''}</span></div></div>
         <p class="note acctX" hidden></p>
         ${actions.onProfile ? '<button type="button" class="ghost sm acctProfile">Your profile</button>' : ''}
         <a class="link acctAbout" href="https://annotated-app.netlify.app/" target="_blank" rel="noopener">About annotated</a>
         <form class="acctHandle" novalidate><label for="acctH">Handle</label>
           <div class="row"><span class="at">@</span><input id="acctH" value="${esc(me.handle || '')}" maxlength="30" autocomplete="off" spellcheck="false" pattern="[a-z0-9_]{2,30}" aria-describedby="acctHRule acctHLink">
           <button class="strong sm acctHSave" disabled>Save</button></div>
           <p class="note acctHRule" id="acctHRule">On everything you publish. 2 to 30 lowercase letters, numbers or underscores.</p>
           <p class="note acctHLink" id="acctHLink" hidden></p>
           <p class="note acctHMsg" role="status"></p></form>
         <div class="acctFoot">
           <button type="button" class="ghost sm acctOut">Sign out</button>
           ${actions.onDeleteAll ? `<button type="button" class="link danger acctDelAll"${actions.hasAny ? ' hidden' : ''}>Delete all my annotations</button>` : ''}
         </div>`
      : `${errText ? `<p class="err">${esc(errText)}</p>` : ''}<p class="note">Sign in to publish, follow people and join in.</p>
         <div class="acctWays"><button type="button" class="strong sm acctIn" data-provider="google">${G} Continue with Google</button>
         <button type="button" class="strong sm acctIn" data-provider="x">${X} Continue with X</button></div>`;
    document.body.appendChild(pop);
    // A link out of the menu closes it. About annotated opened the home page and left the menu open over the panel
    // (recording of 2026-09-25 at 16:45, 1:48).
    pop.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) setTimeout(close, 0); });
    // Offered only with something to delete. With nothing it opened a profile that said only that there was
    // nothing to delete (recording of 2026-09-25 at 03:14, 1:55).
    const delAll = pop.querySelector('.acctDelAll');
    if (delAll && actions.hasAny) actions.hasAny().then((n) => { if (n) delAll.hidden = false; }).catch(() => {});
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 268, r.right - 260)) + 'px';
    const out = pop.querySelector('.acctOut');
    // One account, two ways in. Connecting X keeps everything under the account already signed in.
    const xLine = pop.querySelector('.acctX');
    if (xLine && Backend.ways) Backend.ways().then((w) => {
      if (!pop || !xLine.isConnected) return;
      xLine.hidden = false;
      if (w.includes('x')) { xLine.innerHTML = `${X} X is connected. You can sign in with it too.`; return; }
      xLine.innerHTML = `<button type="button" class="link acctConnectX">${X} Connect X</button> <span>to sign in with either.</span>`;
      xLine.querySelector('.acctConnectX').addEventListener('click', async () => {
        xLine.textContent = 'Connecting X…';
        try { me = await Backend.connectX(); draw(); xLine.innerHTML = `${X} X is connected. You can sign in with it too.`; }
        catch (e) { xLine.textContent = (e && e.message) || 'X could not be connected just now.'; }
      });
    });
    if (out) out.addEventListener('click', async () => { close(); await Backend.signOut(); me = null; draw(); });
    // Nothing here is a password field, and a handle is two to thirty characters, so the browser's saved
    // entries are only ever in the way.
    const hIn = pop.querySelector('#acctH');
    if (hIn) hIn.setAttribute('autocomplete', 'off');
    // Handles are public and shown on every annotation. They can be changed here.
    const hf = pop.querySelector('.acctHandle');
    // The link it makes, as you type, and what changing it costs before you press Save rather than after.
    const hLive = () => {
      const h = hIn.value.trim().toLowerCase().replace(/^@/, '');
      const ok = HANDLE.test(h), changed = h !== me.handle;
      // The link only ever shows a handle that could be saved, so it never reads as an address with a space in it.
      // The link shows only once a new handle would change it, with what that costs, in two short lines.
      pop.querySelector('.acctHLink').textContent = `New link: ${site()}/@${ok ? h : me.handle || ''}`;
      pop.querySelector('.acctHLink').hidden = !(ok && changed);
      pop.querySelector('.acctHRule').classList.toggle('bad', !!h && !ok);
      pop.querySelector('.acctHSave').disabled = !ok || !changed;
      const m = pop.querySelector('.acctHMsg');
      // An invalid handle says what is wrong with it, rather than leaving Save greyed out with no reason (exploration of
      // 2026-09-26, where "x" did just that).
      const why = !h || ok ? '' : h.length < 2 ? 'At least 2 characters.' : h.length > 30 ? 'At most 30 characters.' : 'Only lowercase letters, numbers and underscores.';
      if (!m.dataset.sticky) m.textContent = why || (ok && changed && me.handle ? `Links to @${me.handle} will stop working.` : '');
    };
    if (hIn) { hIn.addEventListener('input', () => { pop.querySelector('.acctHMsg').dataset.sticky = ''; hLive(); }); hLive(); }
    const pr = pop.querySelector('.acctProfile');
    if (pr) pr.addEventListener('click', () => { close(); actions.onProfile(); });
    const da = pop.querySelector('.acctDelAll');
    if (da) da.addEventListener('click', () => { close(); actions.onDeleteAll(); });
    if (hf) hf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = hf.querySelector('input'), msg = hf.querySelector('.acctHMsg');
      const h = input.value.trim().toLowerCase().replace(/^@/, '');
      msg.dataset.sticky = '1';
      if (!HANDLE.test(h)) { msg.textContent = 'Use 2 to 30 lowercase letters, numbers or underscores.'; return; }
      if (h === me.handle) { msg.textContent = 'That is already your handle.'; return; }
      msg.textContent = 'Saving';
      const { error } = await Backend.client.from('profiles').update({ handle: h }).eq('id', me.id);
      if (error) { msg.textContent = /duplicate|unique/i.test(error.message) ? 'Someone already has that handle.' : 'It did not save. ' + error.message; return; }
      const was = me.handle; me = { ...me, handle: h };
      // The first span inside .who is the avatar, so writing there put the handle inside the circle and
      // left the old one on screen underneath. The handle has a name of its own now.
      msg.textContent = `Saved. Links to your old handle, @${was}, no longer work.`;
      pop.querySelector('.acctHLink').hidden = true;
      pop.querySelector('.acctAt').textContent = '@' + h;
      pop.querySelector('.acctHSave').disabled = true;
      draw();
      subs.forEach((f) => f(me));
    });
    // A way in chosen: the question stays open until that sign-in ends, and the caller hears how it ended, failed
    // included, so a button waiting on it can say so (it sat on Publishing when the card came back for a retry).
    pop.querySelectorAll('.acctIn').forEach((b) => b.addEventListener('click', () => {
      const r = waiting; waiting = null; close(true);
      signIn(b.dataset.provider).then((p) => { if (r) r(p || null); }, () => { if (r) r(null); });
    }));
    setTimeout(() => document.addEventListener('mousedown', function o(e) { if (!pop) return document.removeEventListener('mousedown', o); if (!pop.contains(e.target) && e.target !== btn) { document.removeEventListener('mousedown', o); close(); } }), 0);
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); btn.focus(); return; }
      // Tab stays inside the menu while it is open. It used to walk the panel behind it first.
      if (e.key !== 'Tab') return;
      const f = [...pop.querySelectorAll('button:not([disabled]), input, a[href]')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
      e.preventDefault(); f[next].focus();
    });
    // Focus goes into the menu when it opens, so the keyboard lands where the menu is.
    const first = pop.querySelector('button:not([disabled]), input');
    if (first) first.focus();
  }
  // With no way chosen, the card of both opens and the answer comes once one is picked (null if it is put away).
  async function signIn(provider) {
    if (!provider) {
      if (me) return Promise.resolve(me);
      // Asked again while a card already waits: both askers get the one answer.
      return new Promise((res) => { const prev = waiting; waiting = null; open(); waiting = prev ? (p) => { prev(p); res(p); } : res; });
    }
    btn.disabled = true; btn.innerHTML = 'Signing in';
    try { me = await Backend.signIn(provider); draw(); }
    catch (e) { me = null; draw(); open(e.message); }
    finally { btn.disabled = false; }
    return me;
  }
  function mount(panel) {
    const brand = panel.querySelector('.brand');
    if (!brand || typeof Backend === 'undefined') return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'acctBtn';
    brand.insertBefore(btn, brand.querySelector('.gearBtn') || brand.querySelector('.helpBtn') || brand.querySelector('.x') || null);
    btn.addEventListener('click', () => (pop ? close() : me ? open() : signIn()));
    // The button waits, unseen but keeping its place, until the panel knows who is signed in. It said Sign in for a
    // second to someone signed in (recording of 2026-09-25 at 06:58, 2:02). Three seconds at most.
    btn.classList.add('acctPending');
    const known = () => btn.classList.remove('acctPending');
    setTimeout(known, 3000);
    draw();
    Backend.profile().then((p) => { me = p; draw(); known(); }).catch(known);
    Backend.onChange((p) => { me = p; draw(); known(); if (p && waiting) { close(); } });
  }
  return { mount, signIn, close, get me() { return me; }, onChange: (f) => subs.push(f), setActions: (a) => { actions = a || {}; } };
})();

// The account button in the panel's top bar: "Sign in" with Google, or your photo with a small menu.
const Account = (() => {
  const G = '<svg class="gmark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let me = null, btn = null, pop = null;
  const subs = [];

  function draw() {
    if (!btn) return;
    btn.classList.toggle('signedIn', !!me);
    if (me) {
      btn.innerHTML = /^https:\/\//.test(me.avatar || '') ? `<img src="${esc(me.avatar)}" alt="" referrerpolicy="no-referrer">` : esc((me.name || '?').slice(0, 1).toUpperCase());
      btn.setAttribute('aria-label', `Signed in as ${me.name}. Account menu`);
      btn.title = me.name;
    } else {
      btn.innerHTML = `${G} Sign in`;
      btn.setAttribute('aria-label', 'Sign in with Google');
      btn.title = 'Sign in with Google';
    }
    // Lets the panel show the "sign in to publish" line above Publish while signed out.
    document.body.classList.toggle('signedOut', !me);
    subs.forEach((f) => f(me));
  }
  function close() { if (pop) { pop.remove(); pop = null; } }
  function open(errText) {
    close();
    pop = document.createElement('div');
    pop.className = 'acctPop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Account');
    pop.innerHTML = me
      ? `<div class="who"><span class="avatar ${me.avatar ? 'hasImg' : ''}" aria-hidden="true">${me.avatar ? `<img src="${esc(me.avatar)}" alt="" referrerpolicy="no-referrer">` : esc(me.name.slice(0, 1))}</span>
           <div><b>${esc(me.name)}</b><span>${me.handle ? '@' + esc(me.handle) : ''}</span></div></div>
         <form class="acctHandle" novalidate><label for="acctH">Your handle</label>
           <div class="row"><span class="at">@</span><input id="acctH" value="${esc(me.handle || '')}" maxlength="30" autocomplete="off" spellcheck="false" pattern="[a-z0-9_]{2,30}" title="2 to 30 lowercase letters, numbers or underscores">
           <button class="strong sm">Save</button></div><p class="note acctHMsg" role="status"></p></form>
         <button type="button" class="ghost sm acctOut">Sign out</button>`
      : `<p class="err">${esc(errText || '')}</p><button type="button" class="ghost sm acctIn">${G} Try again</button>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 268, r.right - 260)) + 'px';
    const out = pop.querySelector('.acctOut'), again = pop.querySelector('.acctIn');
    if (out) out.addEventListener('click', async () => { close(); await Backend.signOut(); me = null; draw(); });
    // Handles are public and shown on every annotation. They can be changed here.
    const hf = pop.querySelector('.acctHandle');
    if (hf) hf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = hf.querySelector('input'), msg = hf.querySelector('.acctHMsg');
      const h = input.value.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_]{2,30}$/.test(h)) { msg.textContent = 'Use 2 to 30 lowercase letters, numbers or underscores.'; return; }
      if (h === me.handle) { msg.textContent = 'That is already your handle.'; return; }
      msg.textContent = 'Saving';
      const { error } = await Backend.client.from('profiles').update({ handle: h }).eq('id', me.id);
      if (error) { msg.textContent = /duplicate|unique/i.test(error.message) ? 'Someone already has that handle.' : 'It did not save. ' + error.message; return; }
      me = { ...me, handle: h }; msg.textContent = 'Saved. It shows on your annotations now.';
      pop.querySelector('.who span').textContent = '@' + h;
      subs.forEach((f) => f(me));
    });
    if (again) again.addEventListener('click', () => { close(); signIn(); });
    setTimeout(() => document.addEventListener('mousedown', function o(e) { if (!pop) return document.removeEventListener('mousedown', o); if (!pop.contains(e.target) && e.target !== btn) { document.removeEventListener('mousedown', o); close(); } }), 0);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });
  }
  async function signIn() {
    btn.disabled = true; btn.innerHTML = `${G} Signing in`;
    try { me = await Backend.signIn(); draw(); }
    catch (e) { me = null; draw(); open(e.message); }
    finally { btn.disabled = false; }
  }
  function mount(panel) {
    const brand = panel.querySelector('.brand');
    if (!brand || typeof Backend === 'undefined') return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'acctBtn';
    brand.insertBefore(btn, brand.querySelector('.gearBtn') || brand.querySelector('.helpBtn') || brand.querySelector('.x') || null);
    btn.addEventListener('click', () => (me ? (pop ? close() : open()) : signIn()));
    draw();
    Backend.profile().then((p) => { me = p; draw(); }).catch(() => {});
    Backend.onChange((p) => { me = p; draw(); });
  }
  return { mount, signIn, get me() { return me; }, onChange: (f) => subs.push(f) };
})();

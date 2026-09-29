// Every plane and piece of paper annotated draws, and every way a card folds, opens and flies, on one page, each
// numbered so David can pick favourites (2.34.1). Not linked from anywhere; /paper.html.
(() => {
  const page = document.getElementById('page');
  const DRAW = [
    ['lone', 'A plane, any of seven'], ['swallow', 'Swallow'], ['stunt', 'Stunt plane'], ['lock', 'Nose-lock plane'], ['banking', 'Banking'],
    ['sheet', 'A sheet, corner curling'], ['halfFold', 'Half folded'], ['folded', 'Folded in half'], ['creased', 'A plane unfolded flat'],
    ['smoothed', 'Crumpled, smoothed out'], ['ball', 'Crumpled ball'], ['loose', 'Crumpled in a hurry'], ['stack', 'A stack, clipped'],
    ['strip', 'A torn strip'], ['trail', 'A trail'], ['pile', 'A pile'], ['corner', 'The panel corner'],
  ];
  const OPENS = [['classic', 'Classic'], ['cascade', 'Cascade'], ['snap', 'Snap'], ['flutter', 'Flutter'], ['spin', 'Spin'],
    ['drift', 'Drift'], ['bounce', 'Bounce'], ['peel', 'Peel'], ['tumble', 'Tumble'], ['float', 'Float']];
  const FOLDS = OPENS.filter(([k]) => ['classic', 'cascade', 'peel', 'snap', 'tumble'].includes(k));
  const ROUTES = [['climb', 'Climb'], ['loop', 'Loop'], ['sweep', 'Sweep'], ['zip', 'Zip'], ['glide', 'Glide']];
  const card = () => `<article class="annCard ppCard paperSheet"><p class="ppTake">A take that folds into a plane.</p><blockquote class="quote">The words it was about, marked in highlighter.</blockquote></article>`;
  const on = typeof Fold !== 'undefined' && Fold.on();

  page.innerHTML = `
    <header class="ppHead"><a href="/" class="ppHome">${typeof Brand !== 'undefined' ? Brand.wordmark() : 'annotated'}</a>
      <h1>Planes and paper</h1><p class="note">Everything annotated draws and every way a card folds, opens and flies. Press anything to see it again. Numbers are there so you can say which you like.</p>
      ${on ? '' : '<p class="note ppOff">Paper planes are switched off in this browser (reduced motion, or turned off), so the motions will not play.</p>'}</header>
    <section><h2>Drawings</h2><div class="ppGrid">${DRAW.map(([k, name], i) => `<button type="button" class="ppArt" data-k="${k}"><span class="ppNum">D${i + 1}</span><span class="ppPic"></span><span class="ppName">${name}</span></button>`).join('')}</div></section>
    <section><h2>Opening: how a card arrives and unfolds</h2><div class="ppRow">${OPENS.map(([k, n], i) => `<button type="button" class="ghost sm ppOpen" data-k="${k}">O${i + 1} ${n}</button>`).join('')}</div>
      <div class="ppStage" id="openStage">${card()}</div></section>
    <section><h2>Publishing: how a card folds and flies away</h2>
      <p class="note">Pick a fold and a flight, then send it.</p>
      <div class="ppRow"><span class="ppLab">Fold</span>${FOLDS.map(([k, n], i) => `<label class="ppPick"><input type="radio" name="fold" value="${k}" ${i ? '' : 'checked'}> F${i + 1} ${n}</label>`).join('')}</div>
      <div class="ppRow"><span class="ppLab">Flight</span>${ROUTES.map(([k, n], i) => `<label class="ppPick"><input type="radio" name="route" value="${k}" ${i ? '' : 'checked'}> R${i + 1} ${n}</label>`).join('')}</div>
      <p><button type="button" class="primary ppSend">Send it</button></p>
      <div class="ppStage" id="awayStage">${card()}</div></section>
    <section><h2>Deleting: crumpled into the bin</h2><p><button type="button" class="ghost sm ppTrash">Delete it</button></p><div class="ppStage" id="trashStage">${card()}</div></section>
    <section><h2>Copy link</h2><p class="note">A tiny plane leaves the button.</p><p><button type="button" class="ghost sm ppToss">Copy link</button></p></section>`;

  const draw = (b) => { b.querySelector('.ppPic').innerHTML = PaperDeco.ART[b.dataset.k](); };
  page.querySelectorAll('.ppArt').forEach((b) => { draw(b); b.addEventListener('click', () => draw(b)); });

  const fresh = (id) => { const st = document.getElementById(id); st.innerHTML = card(); return st.querySelector('.ppCard'); };
  let busy = false;
  page.querySelectorAll('.ppOpen').forEach((b) => b.addEventListener('click', async () => {
    if (busy) return; busy = true;
    const c = fresh('openStage');
    try { await Fold.arrive(c, { unfold: b.dataset.k, T: 1000, openT: 1000, z0: 70, within: true }); } finally { busy = false; }
  }));
  page.querySelector('.ppSend').addEventListener('click', async () => {
    if (busy) return; busy = true;
    const c = document.querySelector('#awayStage .ppCard') || fresh('awayStage');
    const fold = page.querySelector('input[name=fold]:checked').value, route = page.querySelector('input[name=route]:checked').value;
    try { await Fold.away(c, { fold, route }); } finally { setTimeout(() => { fresh('awayStage'); busy = false; }, 500); }
  });
  page.querySelector('.ppTrash').addEventListener('click', async () => {
    if (busy) return; busy = true;
    const c = document.querySelector('#trashStage .ppCard') || fresh('trashStage');
    try { await Fold.trash(c); } finally { setTimeout(() => { fresh('trashStage'); busy = false; }, 400); }
  });
  page.querySelector('.ppToss').addEventListener('click', (e) => Fold.toss(e.currentTarget));
})();

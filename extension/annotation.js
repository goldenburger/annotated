// This tab only ever shows annotated's own pages, so a mark left by one of them means there is somewhere
// of ours behind us to go back to. A tab opened straight onto a shared link has no mark and no Back.
const beenHereBefore = (() => { try { const had = sessionStorage.getItem('annSeen'); sessionStorage.setItem('annSeen', '1'); return !!had; } catch { return false; } })();
// Annotation page inside the extension. Shows annotations saved on this computer and shared ones from the
// database. Once an annotation is shared, comments, reactions, votes, edits and claims go to the database.
(async () => {
  Prefs.init(Prefs.chromeBackend());
  let me = null;
  // Pages show the signed-in account's name and photo. Signed out, they fall back to "You".
  // This is read again on every load, because this one tab is reused for every annotation and the account
  // can change in the panel beside it without the page ever reloading. Reading it once meant one person's
  // id travelled with another person's token, which the database refused, and meant Follow appeared on your
  // own annotation and never on anyone else's.
  const readMe = async () => { try { me = await Backend.profile(); } catch { me = null; } AnnotationPage.setMe(me); };
  const page = document.getElementById('page');
  const permalinkOf = (id, author) => Backend.permalink(id, (author && author.handle) || (me && me.handle));
  // Row level security speaks in table names and policies. Nobody reading an annotation should see that, so
  // the real message goes to the console and the person gets a sentence about what to do.
  const notYours = (e) => /row-level security|violates|permission|not yours/i.test((e && e.message) || '');
  // The database's own limits say what happened in plain words, so those are passed on as they are.
  const LIMIT = /lot of comments|lot of annotations|as many reactions|has to be an emoji|lot of claims/i;
  // The panel beside this page shows the same annotation's reactions, comments and votes, and reads them only
  // when something tells it to look again. A shared annotation's activity lives in the database, not in the
  // copy on this computer, so the page says so each time.
  const nudgePanel = () => { try { chrome.storage.local.set({ annotatedStamp: Date.now() }); } catch { /* not in the extension */ } };
  const sayProblem = (e) => {
    console.warn('annotated', e);
    if (LIMIT.test((e && e.message) || '')) { alert(e.message); return; }
    alert(notYours(e) ? 'That did not save, because it is not yours to change. Sign in again from the panel and try once more.'
                      : 'That did not save. Check your connection and try again in a moment.');
  };

  const load = async () => {
    await readMe();
    const id = decodeURIComponent(location.hash.slice(1));
    // How you got here decides what Back can honestly mean. The panel says so when it sent you here from
    // publishing. Otherwise anything behind you in this tab is one of our own pages, because this tab only
    // ever shows them. Arriving cold on a shared link there is nothing behind you at all.
    let from = 'cold';
    try {
      const o = await chrome.storage.session.get('annFrom');
      if (o && o.annFrom === 'publish') from = 'publish';
      await chrome.storage.session.remove('annFrom');
    } catch { /* no session storage, so treat it as any other arrival */ }
    if (from !== 'publish' && beenHereBefore) from = 'history';
    const local = id ? await Store.get(id).catch(() => null) : null;
    window.scrollTo(0, 0);
    // Saved on this computer, or shared by anyone.
    let rec = local ? { id, ...local } : null;
    let shared = !!(local && local.cloud);
    if (!rec && id) { rec = await Cloud.get(id).catch(() => null); shared = !!rec; }
    if (!rec) {
      const gone = Store.wasDeleted && Store.wasDeleted(id);
      page.className = '';
      document.title = 'annotated';
      AnnotationPage.renderMissing(page, {
        title: gone ? 'This annotation was deleted' : 'This annotation was not found',
        why: gone ? 'It was taken down, so there is nothing left to show.' : 'The link may be wrong, or it was deleted before this computer saw it.',
        siteNav: false, onHome: () => { location.href = 'feed.html'; },
      });
      return;
    }
    if (Cloud.markOpened) Cloud.markOpened(id);
    let author = rec.author || (shared && local && local.author) || null;
    // Publishing takes a copy of the author, and the local copy is preferred over the shared one because it
    // holds the files. That copy goes stale the moment a name or a handle changes, so a shared annotation
    // asks who its author is now and keeps the answer.
    if (shared && author && author.id) {
      const now = await Cloud.authorNow(author.id).catch(() => null);
      if (now && (now.handle !== author.handle || now.name !== author.name || now.avatar !== author.avatar)) {
        author = now;
        if (local) Store.update(id, { author: now }).catch(() => {});
      }
    }
    // A plain yes or no. Signed out this used to come out as null, which the banner took for yes, so everyone
    // else's annotation said Published.
    const mine = !author || !!(me && author.id === me.id);
    const title = AnnotationPage.titleOf(rec.item);
    document.title = `${rec.take.text || title} | annotated`;

    // Shared: everyone's comments, reactions and votes come from the database.
    let comments = rec.comments || [], reactions = rec.reactions || [];
    if (shared) {
      const soc = await Cloud.social(id, me && me.id).catch(() => null);
      if (soc) {
        comments = soc.comments; reactions = soc.reactions;
        if (rec.take.poll) rec.take = { ...rec.take, poll: { ...rec.take.poll, counts: soc.poll.counts, vote: soc.poll.vote } };
      }
    }
    const records = await Store.allMeta().catch(() => []);
    // Following and discovery for the rail and the author's Follow button.
    const soc = await Cloud.discovery(me, {
      signIn: () => Backend.signIn().then(() => load()).catch(() => {}),
      onPerson: (handle) => Backend.client.from('profiles').select('id').eq('handle', handle).maybeSingle().then(({ data }) => { if (data) location.href = 'feed.html#user=' + encodeURIComponent(data.id); }),
    }).catch(() => null);
    const social = soc ? { ...soc, youId: me && me.id, followsAuthor: !!(author && soc.followed.has(author.id)),
      you: me && soc.youCounts ? { id: me.id, annotations: AnnotationPage.mineCount(records, me.id), ...soc.youCounts } : null } : null;
    // Signed out, shared annotations can be read but not commented on or reacted to.
    const needSignIn = () => { if (shared && !me) { AnnotationPage.signInPrompt({ text: 'Sign in with Google to comment, react or vote.', onSignIn: () => Backend.signIn().then(() => load()).catch(() => {}) }); return true; } return false; };

    // Everything is here, so the skeleton comes down and the page goes up in the same breath.
    page.className = '';
    await AnnotationPage.render(page, {
      id, item: rec.item, take: rec.take, created: rec.created,
      author: mine ? null : author, mine,
      permalink: permalinkOf(id, author),
      backIsSource: from === 'publish',
      backLabel: from === 'publish'
        ? ({ video: 'Back to the video', post: 'Back to the post', audio: 'Back to the episode' }[rec.item.kind] || 'Back to the article')
        : 'Back',
      // Only arriving from Publish. Opened later from a list or trending, it used to say Published again.
      showBanner: mine && from === 'publish' && !(local && local.seen),
      // Kept only on this computer: no link to share yet.
      localOnly: !shared && !!local,
      youId: me && me.id,
      stats: { annotations: AnnotationPage.mineCount(records, me && me.id), followers: (soc && soc.youCounts && soc.youCounts.followers) || 0 },
      comments, reactions, records, social,
      // The panel beside this page already carries Home and your profile.
      siteNav: false,
    }, {
      onBack: from === 'cold' ? null : from === 'publish' ? async () => {
        const ok = local && local.sourceTabId ? await chrome.tabs.update(local.sourceTabId, { active: true }).then(() => true).catch(() => false) : false;
        // The tab it was captured from is gone, so the source opens in one of its own. Sending this tab there
        // would take the annotation with it, and this is the only tab annotated keeps.
        if (!ok) chrome.tabs.create({ url: AnnotationPage.srcUrlOf(rec.item) });
      } : () => history.back(),
      onHome: () => { location.href = 'feed.html'; },
      onProfile: () => { location.href = mine ? 'feed.html#profile' : 'feed.html#user=' + encodeURIComponent(author.id); },
      onTag: (tag) => { location.href = 'feed.html#tag=' + encodeURIComponent(tag); },
      onOpen: (oid) => { location.hash = encodeURIComponent(oid); },
      onDismissBanner: () => local && Store.update(id, { seen: true }),
      onComments: async (list, change = {}) => {
        if (!shared) return Store.update(id, { comments: list });
        if (needSignIn()) return;
        try {
          if (change.added) change.added.dbId = await Cloud.addComment(id, me.id, change.added.text, change.added.gif, change.added.upload);
          if (change.removed && change.removed.dbId) await Cloud.deleteComment(change.removed.dbId);
          if (change.reaction && change.comment && change.comment.dbId) await Cloud.reactComment(change.comment.dbId, me.id, change.reaction.emoji, change.reaction.on);
          nudgePanel();
        } catch (e) { sayProblem(e); }
      },
      onReactions: async (list, change) => {
        if (!shared) return Store.update(id, { reactions: list });
        if (needSignIn() || !change) return;
        await Cloud.react(id, me.id, change.emoji, change.on);
        nudgePanel();
      },
      onPollVote: async (vote) => {
        if (!shared) return Store.update(id, { take: { ...rec.take } });
        if (needSignIn()) return;
        await Cloud.vote(id, me.id, vote);
        nudgePanel();
      },
      onClaim: shared ? (data) => Cloud.claim(id, data).then((r) => { if (r.error) throw r.error; }) : null,
      // Saved here but not shared (signed out at the time, or the upload failed): share it now. Signed out,
      // this page signs you in itself. It used to send you to the panel to do that.
      shareNeedsSignIn: !me,
      onShareNow: !shared && local ? async () => {
        if (!me) {
          try { await Backend.signIn(); } catch { /* cancelled, or the window was closed */ }
          me = await Backend.profile().catch(() => null);
          if (!me) throw new Error('Sign-in did not finish, so it is still only on this computer.');
        }
        const author = await Cloud.publish(id, local.item, local.take);
        if (!author) throw new Error('Sign-in did not finish, so it is still only on this computer.');
        await Store.update(id, { cloud: true, author });
        // Comments and reactions made while it was only on this computer come along.
        await Cloud.carryOver(id, author.id, local.comments || [], local.reactions || []).catch((e) => { console.warn('carryOver', e); alert('The annotation is shared, but its earlier comments did not come across with it.'); });
        load();
      } : null,
      ...(mine ? {
        onDelete: async () => {
          if (shared && me) await Cloud.remove(id, me.id).catch((e) => { console.warn('remove', e); alert(notYours(e) ? 'That is not yours to delete, so nothing was removed.' : 'It could not be deleted online, so it was kept. Try again in a moment.'); throw e; });
          await Store.del(id).catch(() => {});
          location.href = 'feed.html#profile';
        },
        onEdit: async ({ text, tag }) => {
          if (local) await Store.update(id, { take: { ...local.take, text, tag } });
          if (shared) await Cloud.edit(id, { text, tag });
          document.title = `${text || title} | annotated`;
        },
      } : {}),
    });
    // The banner is for the first visit only.
    if (local && !local.seen) Store.update(id, { seen: true });
  };
  window.addEventListener('hashchange', load);
  // Signing in or out in the panel changes what this page may offer, and the page does not reload by itself.
  Backend.onChange((who) => { if ((who && who.id) !== (me && me.id)) load(); });
  load();
})();

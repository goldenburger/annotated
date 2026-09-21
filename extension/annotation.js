// Annotation page inside the extension. Shows annotations saved on this computer and shared ones from the
// database. Once an annotation is shared, comments, reactions, votes, edits and claims go to the database.
(async () => {
  Prefs.init(Prefs.chromeBackend());
  let me = null;
  // Pages show the signed-in account's name and photo. Signed out, they fall back to "You".
  try { me = await Backend.profile(); AnnotationPage.setMe(me); } catch {}
  const page = document.getElementById('page');
  const permalinkOf = (id, author) => Backend.permalink(id, (author && author.handle) || (me && me.handle));

  const load = async () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const local = id ? await Store.get(id).catch(() => null) : null;
    page.className = ''; page.innerHTML = '';
    window.scrollTo(0, 0);
    // Saved on this computer, or shared by anyone.
    let rec = local ? { id, ...local } : null;
    let shared = !!(local && local.cloud);
    if (!rec && id) { rec = await Cloud.get(id).catch(() => null); shared = !!rec; }
    if (!rec) { page.className = 'ann'; page.innerHTML = '<div class="emptyState shellEmpty"><p class="esTitle">This annotation was not found</p><p><a href="feed.html">See annotations</a></p></div>'; return; }
    const author = rec.author || (shared && local && local.author) || null;
    const mine = !author || (me && author.id === me.id);
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
      signIn: () => alert('Sign in from the annotated panel to follow people.'),
      onPerson: (handle) => Backend.client.from('profiles').select('id').eq('handle', handle).maybeSingle().then(({ data }) => { if (data) location.href = 'feed.html#user=' + encodeURIComponent(data.id); }),
    }).catch(() => null);
    const social = soc ? { ...soc, followsAuthor: !!(author && soc.followed.has(author.id)), you: me && soc.youCounts ? { annotations: records.length, ...soc.youCounts } : null } : null;
    // Signed out, shared annotations can be read but not commented on or reacted to.
    const needSignIn = () => { if (shared && !me) { alert('Sign in from the annotated panel to comment, react or vote.'); return true; } return false; };

    await AnnotationPage.render(page, {
      id, item: rec.item, take: rec.take, created: rec.created,
      author: mine ? null : author, mine,
      permalink: permalinkOf(id, author),
      backLabel: { video: 'Back to the video', post: 'Back to the post', audio: 'Back to the episode' }[rec.item.kind] || 'Back to the article',
      showBanner: mine && local && !local.seen,
      // Kept only on this computer: no link to share yet.
      localOnly: !shared && !!local,
      stats: { annotations: records.length, followers: 0 },
      comments, reactions, records, social,
      // The panel beside this page already carries Home and your profile.
      siteNav: false,
    }, {
      onBack: async () => {
        const ok = local && local.sourceTabId ? await chrome.tabs.update(local.sourceTabId, { active: true }).then(() => true).catch(() => false) : false;
        // The tab it was captured from is gone, so the source opens in one of its own. Sending this tab there
        // would take the annotation with it, and this is the only tab annotated keeps.
        if (!ok) chrome.tabs.create({ url: AnnotationPage.srcUrlOf(rec.item) });
      },
      onHome: () => { location.href = 'feed.html'; },
      onProfile: () => { location.href = mine ? 'feed.html#profile' : 'feed.html#user=' + encodeURIComponent(author.id); },
      onTag: (tag) => { location.href = 'feed.html#tag=' + encodeURIComponent(tag); },
      onOpen: (oid) => { location.hash = encodeURIComponent(oid); },
      onDismissBanner: () => local && Store.update(id, { seen: true }),
      onComments: async (list, change = {}) => {
        if (!shared) return Store.update(id, { comments: list });
        if (needSignIn()) return;
        try {
          if (change.added) change.added.dbId = await Cloud.addComment(id, me.id, change.added.text);
          if (change.removed && change.removed.dbId) await Cloud.deleteComment(change.removed.dbId);
          if (change.reaction && change.comment && change.comment.dbId) await Cloud.reactComment(change.comment.dbId, me.id, change.reaction.emoji, change.reaction.on);
        } catch (e) { alert('That did not save. ' + (e.message || '')); }
      },
      onReactions: async (list, change) => {
        if (!shared) return Store.update(id, { reactions: list });
        if (needSignIn() || !change) return;
        await Cloud.react(id, me.id, change.emoji, change.on);
      },
      onPollVote: async (vote) => {
        if (!shared) return Store.update(id, { take: { ...rec.take } });
        if (needSignIn()) return;
        await Cloud.vote(id, me.id, vote);
      },
      onClaim: shared ? (data) => Cloud.claim(id, data).then((r) => { if (r.error) throw r.error; }) : null,
      // Saved here but not shared (signed out at the time, or the upload failed): share it now.
      onShareNow: !shared && local && me ? async () => {
        const author = await Cloud.publish(id, local.item, local.take);
        if (!author) throw new Error('Sign in from the panel first.');
        await Store.update(id, { cloud: true, author });
        // Comments and reactions made while it was only on this computer come along.
        await Cloud.carryOver(id, author.id, local.comments || [], local.reactions || []).catch((e) => alert('The annotation is shared, but its earlier comments did not copy over. ' + e.message));
        load();
      } : null,
      ...(mine ? {
        onDelete: async () => {
          if (shared && me) await Cloud.remove(id, me.id).catch((e) => alert('Could not delete it online. ' + e.message));
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
  load();
})();

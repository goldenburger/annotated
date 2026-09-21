# annotated: project guide

Read this first. It is the handoff from the chat where this project was built (September 2026), so a new session
can pick up without rediscovering anything.

## What this is

annotated is David Winston's entry for Jason Calacanis's $5,000 bounty for annotated.com (This Week in Startups).
Round two submissions are due around **September 30, 2026**. Jason's brief: a Chrome sidebar extension where you
select a passage of an article, clip part of a video or podcast, or save a post from X, add your take, and get a
public page with your take on top and the source underneath, which other people can discuss. Every annotation must
link back to its source, and every annotation has a **File a claim** button.

Jason's round one feedback that shaped this build: the take is the star and the source is context; put a
screenshot of the page with the quote under it; a drag trimmer for clips; screenshot, embed or both for X posts;
annotation tags (hot take, fact check, steelman, receipts, explainer); go straight to the page after posting; a
profile with followers; people worth following, trending topics and a "for you" feed; invite by email; sign in with
X or Google; "examples matter" in the demo.

## Layout

- `extension/` is the Chrome extension (Manifest V3), loaded unpacked. It is the product.
- `website/` is the Netlify site at https://annotated-app.netlify.app (`public/` is served as-is).
- `preview/` builds `preview/dist/annotated-preview.html`, a single-file browser-in-a-page demo of the extension
  used for quick reviews. It has no backend (no sign-in, no sharing).
- `supabase/migrations/` holds every database change, in order. They are already applied to the live project.
- `tests/` holds the Playwright tests (Python). `scripts/` holds build, package, sync and test commands.
- The repository is public at https://github.com/goldenburger/annotated under the MIT license, which is the
  bounty's open source rule.

## Commands

```
pip install playwright pillow && python -m playwright install chromium
python scripts/build_preview.py        # after changing shared extension code the preview uses
python scripts/run_tests.py            # preview + extension tests (about 10 minutes)
python scripts/run_tests.py online     # tests that reach the live database and Apple's podcast directory
python scripts/run_tests.py ext_all hl # named tests
python scripts/package_extension.py    # dist/annotated-extension.zip, also copied to website/public
python scripts/sync_website.py         # copy shared page code from extension/ into website/public
```

Tests run with `tests/` as the working directory and read paths from `tests/_env.py`. A test passes when it exits
cleanly and prints `errors: []`. Every test that loads the extension passes `LOADEXT` from `tests/_env.py`, because
Chromium 137 and later ignore `--load-extension` without it. Set `ANNOTATED_CHROME` to another Chromium build when
Playwright's own Chromium will not run. On David's computer Playwright's Chromium fails to start with a Windows
side by side error, so the tests run against Edge.

```
set ANNOTATED_CHROME=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

## Extension architecture

- **Side panel** (`sidepanel.html`, `sidepanel.js`): one panel per tab, chosen by the page. A refresh loop every
  400 ms routes the active tab to a mode: `videopanel.js` (YouTube, and podcasts, which reuse it with `kind: 'audio'`),
  `articlepanel.js` (any web page: select text, Annotate), `postpanel.js` (a post on X), the podcast-feed picker
  (`makeFeedPod` in `sidepanel.js`, for podcast apps), or the annotated.com view (`renderSide`).
  The panel can also float over the page (`floatframe.js`); Display settings live in `prefs.js`.
- **Display settings** (`prefs.js`, drawn by `PanelKit.displayMenu`): display, after publishing, what a selection
  captures, highlighter, density, theme and the page button. Two of them reach the page you are reading through
  messages, because page scripts have no access to `Prefs`. `set-snap` carries whether a selection is taken
  exactly or grown to the sentence, and `set-pen` rebuilds the injected highlight style. `sidepanel.js` sends both
  when a panel is made and again on every preference change.
- **Page scripts**: `content.js` + `capture-engine.js` on YouTube; `article.js` + `article-core.js` + `post-core.js`
  on every other page. They talk to the panel with `chrome.runtime` messages (`sendTo` in the panel).
- **Video capture** (`capture-engine.js`): plays the range and records a 240p canvas with MediaRecorder, capped at
  90 seconds. Some browsers paint video frames blank on canvas, so it picks a method (canvas drawing or VideoFrame),
  rechecks every second, switches if frames go blank, and stops with a message if both are blank. The panel then
  runs checks (length, picture, audio) with time limits, and a failed check puts Capture again first.
- **Filmstrip** (`filmstrip.js`): YouTube's own storyboard sprites in the extension, frames from a hidden copy in
  the preview.
- **Podcasts**: pages with a normal audio player are recorded directly (three routes: the element, a CORS copy, or
  tab audio). Podcast apps (Spotify, Amazon Music, iHeartRadio, Apple Podcasts and others) use `feedpod.js`: search
  Apple's free directory for the episode, open the show's own MP3, and cut the clip from a byte range on MP3 frame
  boundaries with no re-encoding. Encrypted audio is never recorded, on purpose.
- **Selections**: what you select is what is captured. The sentence around it is offered, never assumed, through
  the link beside the quote, and that offer lasts for one capture. Anyone who wants sentences every time sets it in
  Display settings. Exact selections only have to clear `MIN_EXACT`, twelve characters, rather than `MIN_CHARS`,
  and a whole paragraph or post passes at any length through `coversWholeBlock`.
- **Articles and X**: `article-core.js` handles selection, the Annotate button, sentence snapping, the held
  highlight (cleared by clicking elsewhere or Escape), and screenshots. A selection inside a post on X becomes an
  annotation of that post, with the selected words as its quote.
- **Local storage** (`store.js`): IndexedDB `annotated` version 2 with two stores. `annotations` holds everything
  including clips and screenshots. `meta` holds light copies (no files, a small `shotThumb`) for lists, feeds and
  duplicate checks. A change stamp in `chrome.storage` lets the panel skip rereads.
- **Pages** (`annotation.html` + `annotation.js`, `feed.html` + `feed.js`) render with `annotation-page.js`, which is
  shared with the website and the preview. Anything from a shared annotation goes through `esc`, `safeLink` and
  `safeImg` before it reaches the page, because other people write that data.
- **Accounts** (`backend.js`, `account.js`): Google sign-in through Supabase with `chrome.identity.launchWebAuthFlow`
  and the PKCE code exchange. The session is kept in `chrome.storage.local`. The manifest carries a public `key` so
  the extension ID is always `cggmedbnmeinbhahhllbphkpdbpjeofm`, which sign-in returns to. Do not remove the key.
- **Sharing** (`cloud.js`): publish uploads files to the `media` bucket under the user's folder, then inserts the
  row. Signed out, or if upload fails, the annotation stays local and says so. `discovery()` and `homeTabs()` supply
  follows, people worth following, trending and the For you, Following and Everyone tabs.

## Backend

- **Supabase** project `annotated` (id `efuotxdeifqzdfsavekb`, us-west-1, free plan). Tables: profiles,
  annotations, comments, reactions, comment_reactions, poll_votes, follows, claims. Everything is readable by
  anyone; people can only write their own rows; anyone can file a claim, nobody can read claims through the API.
  Storage bucket `media` is public by link, 25 MB per file. RPC functions: `people_to_follow`, `trending_sources`,
  `trending_tags`. Handles come from the person's name, never their email.
- The publishable key in `backend.js` and `backend-web.js` is public by design. Never put a secret key or the
  Google client secret in this repository.
- **Google sign-in**: Google Cloud project "Annotated", OAuth client "annotated web". Published to **In production**
  on 2026-09-21, so any Google account can sign in. Sign-in asks for no scopes of its own, so Supabase requests only
  openid, email and profile, which are not sensitive and need no Google review. If a logo is ever added to Branding
  it would need verification to appear on the consent screen, though sign-in works without it. The same Audience
  page has Back to testing if it ever needs closing again.
- **Supabase auth settings** (dashboard only): email sign-up is off, so Google is the only sign-in. Site URL is the
  Netlify site; redirect URLs are the extension's `https://cggmedbnmeinbhahhllbphkpdbpjeofm.chromiumapp.org/**` and
  `https://annotated-app.netlify.app/**`.
- **Netlify** site `annotated-app` (id `7b1045ff-71db-4a13-a177-6c4a6b8fa152`). Routes `/@*` to `index.html`
  (profiles and annotation pages are drawn by `site.js`). `netlify/edge-functions/preview-card.ts` adds link-preview
  tags for X from the database. Environment variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
  Share links are `https://annotated-app.netlify.app/@handle/id` (`Backend.permalink`).

## How David works, and conventions

- David reviews by screen recordings of the extension in real Chrome. For each recording: watch it all (frames about
  every second, full-resolution crops of the panel), list what to improve, add or remove with timestamps, then fix
  only after he approves. Check the live database when a recording shows publishing.
- Before big changes, back up (a zip, or now a git tag).
- He prefers short answers, complete sentences, no colons or semicolons in prose written for him, and lists whose
  items all belong to the same category. Never invent data; say what was and was not verified.
- In the product, text is plain and specific ("Saved on this computer. Sign in to publish it for everyone."), with
  no jargon.
- Extension pages allow no inline scripts or handlers (Manifest V3). Escape everything from the database.
- After changing shared page code: run the tests, `build_preview.py`, `sync_website.py`, bump the manifest version,
  `package_extension.py`, and deploy the website if its files changed.
- Every bug fix gets a test, and a test that simulates the failure when the real one cannot be reproduced.

## Known risks, from the audit on 2026-09-21

- The `media` bucket is public by link, so a screenshot of a page behind a login is fetchable by anyone holding the
  URL. The URLs are unguessable and that is the whole protection.
- Anyone may file a claim and there is no rate limit, so claims are spammable.
- IndexedDB grows without pruning. Clips and screenshots stay until deleted by hand.
- Supabase reports leaked password protection as disabled. It does not apply, because email sign-up is off and
  Google is the only way in, so no password exists.
- Four unused indexes sit on the `user_id` columns of comments, reactions, comment_reactions and poll_votes.
- Page scraped text (a post's author, an outlet, a byline) reaches the panel's checks list. It is written with
  `textContent`, never `innerHTML`, and it has to stay that way, because a hostile page controls every word of it.

## Open items

- Follow, For you and trending were tested signed out only. Following someone needs a second real account, which
  is now possible because sign-in is published. This is the last part of the product with no evidence behind it.
- Sign-in with X is skipped because X's API costs money. Google meets "X or Google".
- `ui.css` has many stacked override blocks from review rounds. Consolidating it is safe only with the full test
  suite and screenshots before and after.
- This Week in Startups cannot be clipped, which matters because it is Jason's own show. Apple's directory gives a
  `rss.podscribe.ai` tracking address that answers 500 or 503, while the same file at `traffic.megaphone.fm`
  answers 206. Falling back to the unwrapped address when a tracking prefix fails would fix it.
- Amazon Music never sets a page title, even on a fresh load, so the episode box opens empty and the person types
  the name. The show name does sit in the address as a slug if a guess is ever wanted. Checked in a real browser on
  2026-09-20.
- iHeartRadio works end to end. Its page title is the episode and show, the first search result is the right
  episode, and its audio serves byte ranges. Checked in a real browser on 2026-09-20.
- Buzzsprout works. Its earlier refusal was the HeadlessChrome user agent rather than byte ranges, which is why
  `fphosts.py` now sets `REAL_UA` from `tests/_env.py`.
- Demo: pick strong examples (Jason: "examples matter"), a meaningful paragraph, a good clip, a real podcast moment.

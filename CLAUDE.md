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
- **Who may show the panel**: `sidepanel.html` is the only web accessible resource, and any page may load one
  it can reach, so `float.js` writes a random key to `chrome.storage.local` under `floatKey<tabId>` and puts it
  in the frame's address. The panel checks it (`OURS` in `sidepanel.js`) and nothing is drawn or started until
  it matches, so a site that frames the panel itself gets one sentence and no buttons to lay anything over.
  Scripts injected with `chrome.scripting.executeScript` need no entry in `web_accessible_resources`, so do
  not add one back.
- **Display settings** (`prefs.js`, drawn by `PanelKit.displayMenu`): display, after publishing, what a selection
  captures, highlighter, density, theme and the page button. Two of them reach the page you are reading through
  messages, because page scripts have no access to `Prefs`. `set-snap` carries whether a selection is taken
  exactly or grown to the sentence, and `set-pen` rebuilds the injected highlight style. `sidepanel.js` sends both
  when a panel is made and again on every preference change.
- **Page scripts**: `content.js` + `capture-engine.js` on YouTube; `article.js` + `article-core.js` + `post-core.js`
  on every other page. They talk to the panel with `chrome.runtime` messages (`sendTo` in the panel).
- **The clip range**: a player goes on reporting the video you just left for a moment after a change, so a
  range read from it can sit outside the video that is now loaded. `videopanel.js` brings the range back
  inside as soon as the real length arrives, rather than trusting the length it had when the video changed.
- **Video capture** (`capture-engine.js`): plays the range and records a 240p canvas with MediaRecorder, capped at
  90 seconds. Some browsers paint video frames blank on canvas, so it picks a method (canvas drawing or VideoFrame),
  rechecks every second, switches if frames go blank, and stops with a message if both are blank. The panel then
  runs checks (length, picture, audio) with time limits, and a failed check puts Capture again first.
- **Filmstrip** (`filmstrip.js`): YouTube's own storyboard sprites in the extension, frames from a hidden copy in
  the preview.
- **Podcasts**: pages with a normal audio player are recorded directly (three routes: the element, a CORS copy, or
  tab audio), and that now includes podcast apps, whose own player is tried before anything else. Only a service
  that encrypts its audio (Spotify, Amazon Music, Audible) goes straight to `feedpod.js`, which searches Apple's
  free directory for the episode, opens the show's own MP3, and cuts the clip from a byte range on MP3 frame
  boundaries with no re-encoding. An app whose player turns out to be unreadable falls back to the same place, and
  "Clip a podcast by name" reaches it from anywhere. Encrypted audio is never recorded, on purpose. Routing every
  app to the feed, which is what it used to do, meant searching for an episode that was already playing.
- **Selections**: what you select is what is captured. The sentence around it is offered, never assumed, through
  the link beside the quote, and that offer lasts for one capture. Anyone who wants sentences every time sets it in
  Display settings. Exact selections only have to clear `MIN_EXACT`, twelve characters, rather than `MIN_CHARS`,
  and a whole paragraph or post passes at any length through `coversWholeBlock`.
- **Articles and X**: `article-core.js` handles selection, the Annotate button, sentence snapping, the held
  highlight (cleared by clicking elsewhere or Escape), and screenshots. A selection inside a post on X becomes an
  annotation of that post, with the selected words as its quote. The Annotate button tries the margin beside the
  passage, then the paper left over at the end of the last line, then above the first line. A margin counts as
  empty by `elementFromPoint`, and the tail of a line counts as empty only when the button's whole box clears
  every line box of the block, because the button is taller than a line.
  Capturing a post again with nothing selected keeps the words the last capture quoted, remembered as words and
  found again with `findText`, because a range drifts every time the page is marked and unmarked.
- **The highlighter**: `highlightRange` wraps one word per `<mark>`, each word carrying the space after it, then
  `shapeRun` gives every mark its line's width and offset so the gradient runs across the line rather than
  restarting at each word, and caps the ends of each line. Before that, `fitToLines` makes sure no mark has a
  piece on two lines, because the pen is one box laid over the whole mark and a mark that wraps paints a bar of
  ink hanging from one line to the next. X writes a post as one run of text with real newlines in it under
  `white-space: pre-wrap`, which is where that shows up. `sweep` then grows a layer behind each word with a
  transform. One edge, one speed. Each word starts exactly as the one before it finishes and is given time in
  proportion to its width, so only one word is ever part drawn. Giving every word the same length of time let
  several draw at once, each from its own left edge, and the stroke came out as a row of separate blocks. The transform matters. A stroke drawn by widening a background runs on the
  page's own thread, the page is busy capturing at that moment, and the stroke arrived finished every time, which
  is why three rounds of recordings showed no animation at all. The pen crosses the passage once, before the
  picture, and the picture waits for it (`sweep` returns how long it takes). Drawing it finished for the
  screenshot and again afterwards marked the same passage twice over, which is what it looked like. Pale text on
  a dark page keeps the page's own colour until the pen reaches it (`hl-lit`, then `hl-inked`). A click anywhere
  in the page, or Escape, wipes whatever is drawn on it, including the stroke a capture left, and a click while
  the picture is being taken is ignored so the screenshot does not lose it.
- **Local storage** (`store.js`): IndexedDB `annotated` version 2 with two stores. `annotations` holds everything
  including clips and screenshots. `meta` holds light copies (no files, a small `shotThumb`) for lists, feeds and
  duplicate checks. A change stamp in `chrome.storage` lets the panel skip rereads.
- **Pages** (`annotation.html` + `annotation.js`, `feed.html` + `feed.js`) render with `annotation-page.js`, which is
  shared with the website and the preview. Anything from a shared annotation goes through `esc`, `safeLink` and
  `safeImg` before it reaches the page, because other people write that data. That includes a reaction, which
  is a sixteen character column anyone may write and was the one piece that used to reach the page as markup.
  `reactEmojis` escapes at the source and `EmojiKit.reactions` escapes the chip, and `harden.py` would notice
  either coming undone. A render also puts the previous clock away (`stopClock`), because annotations share one
  tab now and the old one used to run forever.
- **Accounts** (`backend.js`, `account.js`): Google sign-in through Supabase with `chrome.identity.launchWebAuthFlow`
  and the PKCE code exchange. The session is kept in `chrome.storage.local`. The manifest carries a public `key` so
  the extension ID is always `cggmedbnmeinbhahhllbphkpdbpjeofm`, which sign-in returns to. Do not remove the key.
- **Reading an annotation**: a post's screenshot is taken with the stroke already on it, so the picture points
  at the words that were quoted. A quote that starts or ends in the middle of a sentence gets a
  quiet line saying so from `PanelKit.fragmentNote`, which never stops anyone publishing. In a feed, a run of
  cards on one source names it once and the rest say "Same post", because the quote is what tells them apart.
- **What counts as a take**: written words, a voice note, or a poll with a question and at least two options.
  A poll on its own is named by its question wherever annotations are listed. `compose.js` decides this in
  `validate`, and the poll editor tells it whenever the question or the options change.
- **A GIF in a take or a comment** (`giphy.js`): GIPHY search, with the key in that file. It is a client key
  in a public repository and GIPHY cannot restrict it, so the protection is that it only searches for GIFs.
  The free key allows a hundred calls an hour shared by everyone running the extension, so the picker is
  thrifty on purpose. Trending is asked for once, every search is remembered while the panel is open, and a
  search goes out once you stop typing rather than per letter. Running out is refused rather than charged and
  the picker says so. `Giphy.mount` is the picker itself, used by both the take box and the comment box so
  they cannot drift, and it asks through `Giphy.list` so a test can stand in for the network. A GIF counts as
  a take and as a comment on its own. The annotation keeps GIPHY's address rather than a copy of the file,
  which is what their terms ask for, so a GIF they take down stops showing. `gif jsonb` on annotations and on
  comments, and a comment may have empty words only when it has a GIF.
- **GIFs** (`gifmaker.js`): Share on a clip annotation offers Save as GIF. The frames are seeked out of the
  clip onto a canvas, reduced to 256 colours by median cut, dithered, and written as a GIF89a with its own
  LZW. It is all here because none of it needs a service, and because posting media to X does need their paid
  API, which is why the clip itself still travels as a link with a preview card. Two things to know if this is
  ever touched. The reader builds its dictionary one code behind the writer, so the code width has to grow one
  code later than it looks like it should, and Chrome forgives getting that wrong while stricter readers will
  not open the file at all. `gifmake.py` reads the compression back with an ordinary decoder for that reason.
- **The screenshot** (`tabShot` in `sidepanel.js`): Chrome only ever gives a picture of whichever tab is in
  front of a window, never of the tab it is asked about, and setting a capture up takes about a second. A tab
  change inside that second used to put a picture of a different page on the annotation, and publishing sends
  that picture to a bucket that is public by link. `tabShot` now refuses when the front tab is not the one
  being annotated, and the annotation is saved without a picture and says why. `shottab.py` proves it with a
  solid red decoy page, so the answer is in the pixels rather than in a message.
- **Where things open**: annotated's own reading pages live in one tab. Home, a profile and every annotation
  move that tab (`openExtPage`), and leaving annotated, a source or a post on X, opens a tab of its own.
  Publishing stays where you are. The panel shows the published card with the link and View page, and Display
  settings offers Open the page for anyone who wants Jason's "go straight to the page" instead.
- **The panel's own Home and profile**: `PanelKit.topLinks` puts them in the top bar in every mode, and they
  read inside the panel through `AnnotationPage.renderBrowse` rather than taking a tab. `refresh` pauses while
  the panel is browsing and Back resumes it, so a take in progress is untouched. "See all annotations" opens
  the full page for what the panel is too narrow for. The pages inside the extension pass `siteNav: false`,
  because the panel beside them already carries Home and You; the website keeps its nav, having no panel.
  Deleting every annotation at once is offered both there and on the profile page, from one piece of code.
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
- **Website headers**: `website/public/_headers` carries the content security policy and the framing, sniffing
  and referrer rules. Scripts are files of our own and no page may carry one written inside it, which is why
  the wordmark on the plain pages lives in `wordmark.js`. Styles keep the inline allowance because a poll bar
  sets its own width. The edge function copies the headers of the response it rewrites, so annotation pages
  get them too.
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

## Second audit, 2026-09-21

Fixed in the same pass. Each is here because the shape of it is easy to reintroduce.

- Menus put one listener on the document each, per render. There is one for the whole document now, because
  annotations share a tab and the old ones stayed forever holding the page they came from.
- `destroy()` in `article-core.js` has to take off the window scroll and resize listeners as well as the three
  on the document. It used to leave those two behind on every extension reload.
- A blob address is given back when the thing it points at is replaced. Capture again in `videopanel.js` and
  Record again in `compose.js` are ordinary paths and each one used to leave a whole recording in memory.
- A podcast server that answers `bytes 0-131071/*` will not say how long the file is. `probe` says so rather
  than carrying on, which used to give a clip cut in the wrong place with nothing said about it.
- A waveform window is marked done only once it has been fetched, so one hiccup no longer leaves that stretch
  blank for good.
- `capture-post` replies whatever happens inside its timers. Anything that threw left the panel on Capturing
  with a reply that was never coming.
- `pod-info` no longer measures the page on every tick. `innerText` asks for a full layout, which is about a
  millisecond on a settled page and about forty on one that is scrolling or loading, and the panel asks for
  `pod-info` two and a half times a second. The length is only used to guess whether a page looks like a
  podcast, so it is measured every ten seconds instead.
- A recording comes back as a data address and is turned into a file with `fetch`, not with `atob` and a loop
  over several million characters.
- `HOSTLIKE` in `feedpod.js` requires a real ending, so an address hidden inside a tracking address can no
  longer be an IP address. A podcast publisher controls that string through Apple's directory.

## Known risks, from the audit on 2026-09-21

- The `media` bucket is public by link, so a screenshot of a page behind a login is fetchable by anyone holding the
  URL. The URLs are unguessable and that is the whole protection.
- Anyone may file a claim and there is no rate limit, so claims are spammable.
- Nobody has a storage quota. One signed-in account can upload 25 MB at a time until the free plan's gigabyte
  is gone, which is the same shape as the claim spam above.
- IndexedDB grows without pruning. Clips and screenshots stay until deleted by hand.
- Supabase reports leaked password protection as disabled. It does not apply, because email sign-up is off and
  Google is the only way in, so no password exists.
- Four unused indexes sit on the `user_id` columns of comments, reactions, comment_reactions and poll_votes,
  and `source` has no size limit. `10_tidy_indexes_and_source_size.sql` fixes both and **has not been applied**.
- Page scraped text (a post's author, an outlet, a byline) reaches the panel's checks list. It is written with
  `textContent`, never `innerHTML`, and it has to stay that way, because a hostile page controls every word of it.

## Open items

- The panel polls every 400 ms (`setInterval` at the foot of `sidepanel.js`), and on a YouTube or an X tab
  each pass also sends a ping and an info message. Driving it from `chrome.tabs.onUpdated`, `onActivated` and
  `chrome.storage.onChanged` with a slow poll behind it would save nearly all of that. Left alone before the
  deadline because every extension test leans on the current timing.
- The website's headers have only been tried locally, against a server that sends the same file. Deploy and
  check the policy on the live site.

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

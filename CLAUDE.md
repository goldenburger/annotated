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
- `website/` is the Netlify site at https://annotated-app.netlify.app (`public/` is served as-is). The front
  page is `landing.js` (the headline, a four-tab try-it, the install steps and Yours so far) with `tryit.js`,
  `scenetry.js` and `planes.js`. The feed is at `/?feed`, behind "Look around first". `_headers` carries the
  site's CSP and framing rules, so pages there have no inline scripts (`wordmark.js`).
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

A test that watches a panel in a window of its own and clicks the page's Annotate button must call
`one_panel(sw)` from `_env.py` first, and must close any other `sidepanel.html` page it opened. Annotate asks
the background to open annotated's panel, which in a test is a second panel, and both then capture. The first
succeeds, the second finds the selection used up and says "Select a passage on the page first", and which one
the test is watching decides whether it passes. That made `upload`, `batch14` and `explorefix` fail about one
run in two until it was found. In real use the panel it opens is the one you are looking at.

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
  The key is handed to the frame by message once it loads (`annotated-key`), never written into its address,
  because the frame sits in an open shadow root and a page could read the key from there, which defeated the
  check. The host page shares the window and can post too, so every key offered is kept and only the right
  one counts; a hostile page sending wrong keys first used to turn the real panel away. A key in the address
  is still accepted, and only a test uses that. `refresh` does nothing in a panel
  turned away by the check. `tests/audit22.py`.
  Scripts injected with `chrome.scripting.executeScript` need no entry in `web_accessible_resources`, so do
  not add one back.
- **Display settings** (`prefs.js`, drawn by `PanelKit.displayMenu`): display, after publishing, what a selection
  captures, colour, highlighter, density, theme and the page button. Two of them reach the page you are reading through
  messages, because page scripts have no access to `Prefs`. `set-snap` carries whether a selection is taken
  exactly or grown to the sentence, and `set-pen` rebuilds the injected highlight style. `sidepanel.js` sends both
  when a panel is made and again on every preference change.
- **Colour** (`tint` in `prefs.js`, the blocks at the foot of `ui.css`): six palettes, Yellow (stored as `highlighter`),
  Apricot, Rose, Lilac, Sky and Mint. The first is called Yellow on screen because Highlighter is the name of
  the setting beside it. Light or dark is one question and the hue is another, so `theme` and `tint` are
  chosen separately and every palette carries a light half and a dark half. `apply()` puts `data-tint` on the
  root, which is all the panel, the annotation pages, the website and the preview need. The page you are
  reading is the exception, because the stroke is injected into a page with no stylesheet of ours, so the ink
  goes with the `set-pen` message as numbers and `prefs.js` keeps a copy of the six for that. Change a palette
  and both places have to change. A palette whose highlighter is too dark for `--hi-ink` is not allowed in,
  and `tint.py` measures that rather than trusting the eye. A saved colour that no longer exists reads as the
  first one. Nothing else in `ui.css` carries a colour of its own now, so the hover on the main button and the
  text selection follow the choice too.
- **Display settings has two headings**, How it works (display, after publishing, what a selection captures,
  the page button) and How it looks (colour, highlighter, theme, density). Every group there is a `dmGroup`
  fieldset, because a bare fieldset draws the browser's own grey box.
- **The floating panel keeps its top bar.** The frame's own bar carries the gear, help, minimise and close, so
  inside `body.embedded` only the wordmark, gear and help are hidden. Hiding the whole bar left Home, your
  profile and signing in with nowhere to live.
- **Page scripts**: `content.js` + `capture-engine.js` on YouTube; `article.js` + `article-core.js` + `post-core.js`
  on every other page. They talk to the panel with `chrome.runtime` messages (`sendTo` in the panel).
- **The clip range**: a player goes on reporting the video you just left for a moment after a change, so a
  range read from it can sit outside the video that is now loaded. `videopanel.js` brings the range back
  inside as soon as the real length arrives, rather than trusting the length it had when the video changed.
- **How short a clip can be**: `MIN` in `videopanel.js` is three seconds. It was one, and two clips in a row
  in the recording of 2026-09-22 came out at exactly one second, because dragging an end until it stops is
  silent. The handles still clamp there, and now the length turns amber and a line says it is as short as a
  clip goes. Typed times keep the clip's previous length instead, so they cannot reach the floor at all.
- **Video capture** (`capture-engine.js`): plays the range and records a 480p canvas (the source's own height when
  smaller, 1.4 Mbps, about 16 MB for 90 seconds; it was 240p and read as blurry) with MediaRecorder, capped at
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
  The feed picker says why it is there, and only a service that really encrypts its audio is told its player
  cannot be recorded. An app with nothing playing is told that instead, because starting the episode is the
  thing the person can actually do.
- **A quote that starts or ends mid sentence** says so, and offers to grow it beside that line. `capture` and
  `takeWithin` keep the range they used (`lastRange`), and `widen` holds those words again with sentence
  snapping on, so the panel simply captures a second time. `widen(true)` peeks instead, which is how the
  button knows to say **Use the whole post** rather than **Use the whole sentence** on a post with no full
  stop in it, and how it stays hidden when growing the quote would change nothing. While the panel is doing
  this it sets `widening`, because otherwise its own change reads as you selecting new words and the panel
  says to capture again, which is the very thing already happening. It is never a block. The note itself
  shows only when growing the quote would change it, because the text alone cannot tell a headline from half
  a sentence. Publish used to ask "Publish a part sentence?" (`fragWarn`), and it was removed on 2026-09-22
  because it stopped every publish in that day's recording. A passage that has moved too far says so rather
  than doing nothing.
- **Selections**: what you select is what is captured. The sentence around it is offered, never assumed, through
  the link beside the quote, and that offer lasts for one capture. Anyone who wants sentences every time sets it in
  Display settings. **Any words may be annotated**, which David asked for on 2026-09-22 after the panel refused a
  headline with "Pick a passage from the story, not the headline". That rule is gone, `MIN_EXACT` and
  `MIN_CHARS` are both two characters (they were twelve and forty), and `h1` and `[itemprop="headline"]` are
  blocks in `BLOCKS`, so a headline is a whole thing rather than the start of whatever follows it. The only
  refusal left is `MAX_CHARS`, 1,200. A selection's own red line goes when the selection does
  (`selErr.dataset.from === 'sel'`), while a capture's or a publish's stays. `tests/headline.py`.
- **A timeline is not an article**: on X with nothing selected, `articlepanel.js` heads the panel "Posts on X"
  with the post icon and "Whichever post you select words in", rather than naming the page X under an article's
  icon, which read like a news outlet. Select words in a post and `postpanel.js` takes over as before.
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
- **Which account is signed in** is read again on every load in `annotation.js` and `feed.js`, and both
  listen to `Backend.onChange`. One tab serves Home, every profile and every annotation, and a hash change
  does not reload a page, so reading it once meant the tab kept whoever was signed in when it opened. In the
  recordings of 2026-09-22 that sent one person's id with another person's token, which the database refused
  with a row level security message, and it put Follow on your own annotation, took it off everyone else's,
  and offered you yourself under people worth following. The panel's own `profileCache` is thrown away on
  every auth change for the same reason.
- **Yours, and this computer's, are different things.** IndexedDB belongs to the browser, not to an account,
  so two people signing in on one computer share one store. `youId` decides what the panel lists under "Your
  annotations", what `mineCount` counts, and what may be deleted. Without it a profile counted four
  annotations for someone who had written one. Your own profile page (`feed.js`) lists a local annotation
  only when nobody else wrote it, and its header counts your own follows (`pStats`, from `youCounts`), which
  used to be asked for only on other people's profiles. `tests/profilecount.py`.
- **File a claim comes with publishing.** An annotation kept only on this computer has nobody else looking at
  it, and its form used to say "Claim received" while sending nothing, so the button is left off until the
  annotation is shared. The preview passes no `localOnly` and keeps it.
- **A plain date stays on its day** (`dayOnly` in `annotation-page.js` and `articlepanel.js`, `timeZone: 'UTC'` for
  podcast releases). A date with no time is midnight in Greenwich, and shown in local time it read a day early
  anywhere west of it: an episode out on September 1 said "Aug 31". `tests/walk23.py` runs on Los Angeles time.
- **The recording of 2026-09-23 at 00:43** (`tests/walk0043.py`). Signed out, "is this yours" in `annotation.js`
  came out as null, which the banner read as yes, so everyone else's annotation said Published; it is a plain
  boolean now. The Publish mark (`annFrom`) is written only just before a page really loads (`openExtPage`'s
  `beforeLoad`) and never from the duplicate warning's View it (`justPublished: false`). `Cloud.remove` clears
  the held discovery lists in every window, since trending went on listing a deleted annotation for a minute.
  The quote note comes from the page's own sentences (`PanelKit.fragmentFrom`, from the `widen(true)` peek),
  because a quote opening on a name ("Shotwell just filed") passed for one opening a sentence. An annotation's
  page leaves itself out of Trending (`railTrending(social, here)`). Delete all with nothing to delete says so,
  an empty list of yours beside a page says so (`.sideNone`), a missing annotation is drawn inside the page
  frame (`AnnotationPage.renderMissing`), and a Most talked about row has a tooltip only when its title is cut.
- **The recording of 2026-09-23 at 01:08** (`tests/walk0108.py`). A page measured while blank is not held at
  nought (`pageTextLen` in `article.js`), and the article panel asks again for up to eighteen seconds, since
  YouTube's home page said "No words on this page" while it filled with titles. YouTube away from a video
  (`ytHost`) reads "Open a video to clip it" under a video icon. The page nudges the panel (`annotatedStamp`)
  after every comment, reaction and vote, and the panel's card beside a shared annotation reads the live counts
  (`Cloud.social`), where it showed only "Poll". A GIF and a photo putting each other away say so (`.swapNote`).
  The rail leaves out of Trending what it already lists under your recent annotations. The take box's emoji and
  poll tips open to the right, and the picture buttons let go of focus after a mouse press, so their tip does
  not stay up behind the file picker.
- **The recording of 2026-09-23 at 02:09, on Spotify** (`tests/walk0209.py`). The podcast finder is kept while
  the tab moves about inside one app, and `p.hint` puts each new page title in the box and searches it, until
  you type or pick an episode, because the box went on suggesting the first episode page while another
  episode played. Double quotes are dropped from the suggestion (`unquote`). "Listen to the episode" goes to the
  app's own page for that episode when the tab showed one with a matching title, otherwise to Apple's page for
  it (`episodeLink`), where it used to be whatever the tab showed when you clipped, a show page. Whether
  Spotify's real title names the playing episode is assumed, not checked in a real browser. The profile page
  leaves your own annotations out of Trending, and a feed card counts poll votes (`pollVotes` from `Cloud.list`).
- **The recording of 2026-09-23 at 02:22, on Spotify** (`tests/walk0222.py`). With an episode open, the tab moving
  to another episode's page shows "Now on this tab: ... Clip this one instead" (`.fpNow`), which opens it in
  one press and never switches by itself. "Choose a different episode" lets go of the open episode (`ep`, which
  it used to keep, so the panel went on ignoring the tab), puts the usual note back and fills the box from the
  tab. An emptied box says what to type. The clip starts where the app's player is (`app-pos` in `article.js`,
  Spotify's `[data-testid="playback-position"]`) when the tab is on the same episode (`sameEpisode`). That
  selector is assumed from Spotify's page, not checked in a real browser.
- **The recording of 2026-09-23 at 02:48** (`tests/walk0248.py`). "I can't seem to get back to the start up page."
  The start page (`startHtml` and `wireStart` in `sidepanel.js`) was drawn only beside a page with nothing to
  annotate, so once the tab went to a video nothing led back to it. It is now also the top of the panel's Home,
  above For you, Following and Everyone, and what the panel shows beside the feed and your profile, under a way
  back that names the tab it returns to ("Back to Harbor story", `sourceName`) and brings its window forward.
  Away from the empty panel (`beside`), a pasted link, a site and Clip a podcast by name open a tab of their own
  unless the tab is blank, since the page may hold a clip or a take in progress. Home opens on the same tab in
  the panel, the extension's page and the website (`Cloud.startTab`, `savedTab`, `saveTab`, one
  `annotated-feed-tab` in localStorage): the one last pressed, For you by default, and Everyone when For you is
  empty and Everyone is not, unless For you was pressed on that screen. An empty For you gives one line. Your
  own page is called Your profile in the panel heading and its tab. The Home and Your profile tips sit beside
  the icon inside the bar, because below it they covered the heading of the list just opened.
- **The recording of 2026-09-23 at 03:16** (`tests/walk0316.py`). Opening any page of ours makes Supabase tell
  every other open page "signed in" again, through its cross-tab broadcast, and the panel redrew on each, so a
  press that landed during a redraw was lost: Back at 1:12, and Back to ... at 1:49 and 2:16. `Backend.onChange`
  now passes on only a change of who is signed in (id, handle, name, picture), and the view beside the feed is
  drawn again only when its words would change (`dataset.sig`). Back to ... looks its tab up at the press and
  says "That tab has been closed." when it is gone. The podcast finder never takes an address for an episode
  (`LOOKS_LIKE_ADDRESS`), says it is waiting for the app on an episode page, and uses the name a Most talked
  about row gave the tab (`rowNames`, `tabName`) until the page names it, since Spotify took twenty seconds
  and more. Most talked about is asked again after a minute and at once when annotations or follows change
  (`staleTalk`). `goTo` switches to a tab already showing the page (`sameAddress`: same video on YouTube,
  tracking tags ignored, Apple's `?i=` kept), where ten tabs had piled up. A tab still loading says "Opening
  youtube.com…" (`openingHost`) instead of flashing the empty start page.
- **The UX audit of 2026-09-23** (`tests/uxaudit.py`). Beside a tab with nothing to annotate the panel is Home
  (`bareTab`, the fallback at the foot of `refresh`), with a line saying what to open, where it used to be a
  screen of its own that looked like Home and was not. Home and Your profile say where Back goes ("Back to
  Harbor story", and "Back to Home" beside a bare tab, where Home itself has no Back), using `cleanTitle`.
  Signed out the take box's button says "Save on this computer" and the last step reads Save (`.stSave`), and
  the saved card leads with "Sign in and publish" (`PanelKit.setPublishLater`, `publishSaved` in
  `sidepanel.js`), which says so when the sign-in does not finish. The take box comes before the tags, because
  the take is the star. The whole sentence is offered once, after capture, beside the note saying the quote is
  part of one. The article panel offers clipping a podcast only on a page with audio of its own. Your profile
  and Following signed out explain themselves and offer "Sign in with Google" (`action` in `renderBrowse`). The
  first welcome beside a new tab ends on "Show me where to start", and Home stays hidden behind the welcome.
- **The second UX audit of 2026-09-23** (`tests/uxaudit2.py`). An annotation kept on this computer has one
  notice on its page, "Only on this computer. Nobody else can see it yet.", with "Sign in and publish" that
  signs in on the page itself (`shareNeedsSignIn`, `onShareNow` in `annotation.js`) and says so when the
  sign-in does not finish. The toast saying Saved on this computer above it is not drawn for such annotations.
  The Home page's empty tabs say the tab's own reason (`tabs.empty`) and offer "See your N annotations" when
  you have some. Your own profile page leaves out the rail's You card, and signed out its header says how many
  are saved on this computer and offers Sign in (`onSignIn` from `feed.js`) instead of follower counts.
- **The third UX audit of 2026-09-23** (`tests/uxaudit3.py`). Saved while offline, the card says "You are offline,
  so it is saved on this computer." and its button reads "Publish when you're back online", greyed, until the
  browser's `online` event wakes it (`offline` from `publish` through to `PanelKit.published`). It used to say
  "Publish it from its page" above a Sign in and publish button that could not work. An unreachable server
  with the browser still online keeps the button live, since no `online` event would ever come. The poll
  question's hint is "Ask a question (optional)", because the longer one was cut off in its box.
- **The front page's try-it** (`website/public/tryit.js`, `tests/tryit.py`). The hero is the annotated.com brief,
  quoted word for word from annotated.lovable.app and linked. A visitor selects words, presses its Annotate
  button (in the bar under the text, where it cannot cover a line), the extension's real pen crosses them
  (`ArticleCore.highlightRange`, `sweep`, and `ArticleCore.penCss`, which moved there from `article.js` so both
  share it), and a take makes the card an annotation becomes. Nothing is sent. Left alone for a few seconds it
  marks one phrase itself. The last one made is kept in the page's `annotated-tryit`. Takes made on the front page
  are demonstrations and are never handed to the extension or published (David, 2026-09-24). The panel used
  to offer "You made this on annotated's front page" with Publish it, and `sidepanel.js` now clears the
  `annotatedTryit` keys that older versions left. The extension's own Annotate button keeps out of
  `[data-annotated-self]`. The scripted bus loop in `hero.js` is now only the fallback if the highlighter did
  not load.
- **Media-first cards** (`renderFeed` in `annotation-page.js`, used by the feed, profiles and the website). The take,
  then the source large under it, then what it is and the counts. A clip plays silently while half its card is
  on screen (`wirePreviews`, fetched only once seen, since the free plan allows five gigabytes of downloads a
  month), and Play with sound, a button on the picture, opens the full player and holds the preview. The card
  is a `div` with `role="link"` now, so that button can sit inside it, and it opens with Enter or Space. A
  passage with no picture shows its words inked (`.cquote`), a podcast shows its square artwork beside the
  listen button, and a picture that fails to load is dropped rather than left as a black box.
- **The website's front page** (`hero.js`, `tryit.js`, `tests/homepage.py`, `tests/tryit.py`). One sheet of paper that
  gets marked up, and every motion is the pen, the paper or a take lifting off it. The headline's word is
  redrawn by the pen through a passage, a clip, a podcast and a post on X, two rounds, held at its tallest so
  nothing jumps, and it stops the moment the try-it is touched (`annotated-tryit-touched`). The try-it's brief
  sits on a sheet tilted 6 degrees back and 2 round (`.tiTilt`), leaning up to 4 degrees toward the pointer.
  A take lifts off as a card 70 pixels above the paper, its shadow landing on its words and a dashed hairline
  joining them (`hang`, `drawWire`), below the words when there is no room above. Left alone for four seconds
  a small pen marks one phrase and a card labelled Example lifts, once, and any touch puts it away. Under it,
  four scroll scenes drawn in SVG (a passage, a clip, a podcast with Spotify named, a post), driven by CSS
  scroll-driven animations on a `--scene` view timeline, so scrolling back rewinds them. They do not pin the
  page. Each ends on the newest real published annotation of that kind, drawn by `renderFeed`, or on a dashed
  card labelled Example that links nowhere. Then the install steps (`#get`), whose numbers pop in, and headings
  the pen underlines (`.drawLine`). Phones get no tilt, and the card lifts straight up under the paper. Reduced
  motion gets no tilt, cycle, example or scene motion, only finished frames. The whole of it adds about 30 KB,
  with no libraries. A shared annotation opened signed out ends with "Make one like this" (`#try`).
- **The recording of 2026-09-23 at 12:27** (`tests/walk1227.py`, run with the extension loaded). The extension's page
  script wiped every highlight on a click, the try-it's included, so the try-it held strokes that were gone and
  stopped working. `clearHighlights(document)` now leaves `[data-annotated-self]` alone, and clicks and Escape in
  `.tryit` are not the extension's, and the try-it checks its own marks (`intact`, `recover`) and starts clean
  if they have gone. New words selected with the take box open offer "Use these words instead", keeping the take.
  Make the annotation waits for words, and its message sits under the box (`.tiSay`). The quote is
  `ArticleCore.quoteText`, so two paragraphs keep their break. The card is placed by the paper's own layout
  (`offsetTop`), placed again on scroll, and under the paper when there is no room above. Follow signed out
  answers `null` (not tried) and `AnnotationPage.signInPrompt` asks inline, where a browser dialog asked and a
  cancel said it had failed. The same prompt replaces the dialogs for commenting, reacting and voting, and the
  extension's own pages sign in themselves. The feed under the scenes leaves out what they show, the hero's
  buttons lead to `#get` and the scenes, the scenes play mid screen, a scene card's picture is held to 190
  pixels, and downloading ticks the first install step with a Copy button for `chrome://extensions`.
  `scripts/serve_website.py` serves the site locally as Netlify does, routing `/@...`, sending `_headers`, and
  caching nothing.
- **The four scenes work** (`website/public/scenetry.js`, `tests/scenetry.py`). Each scene's drawing is a small
  working version of the tool, labelled Example throughout and sending nothing. A passage and a post are
  selected and marked with the real pen (the post also offers Use the whole post). A YouTube clip and a
  podcast moment are cut with a trimmer over a filmstrip or a waveform: a window of two and a half or three
  minutes around the clip, with the whole length as a thin bar under it, because a 42 second clip is a
  sliver of a 12 minute bar. The handles drag, and so does the middle. They keep between 3 and 90 seconds and
  say when they stop, and the arrow keys move them by a second, five with Shift. The podcast's Play selection
  runs a silent playhead across the stretch and says the panel plays it with sound. Each ends in a take and
  the card it becomes, with Start over and Make another. The drawn SVG is only the fallback if the pen did not
  load, and the static Example card beside a working scene is gone, because the scene makes its own. A real
  published annotation of that kind still sits beside it.
- **Real media in the YouTube clip and Podcast tabs** (`website/public/media/`, `scenetry.js`, `tests/scenetry.py`),
  downloaded with David's go on 2026-09-24. Both are NASA works, which NASA's guidelines treat as generally not
  under copyright in the US, credited on the page and linked, with nothing implying NASA endorses annotated. The
  video is "To the Moon and Back: The Journey of Artemis I" (Johnson Space Center, images.nasa.gov, 5:47). It is
  NASA's 64 MB "small" rendition, 640 by 360, re-encoded with ffmpeg (x264 crf 26, 700 kbps cap, AAC 96 kbps,
  faststart) to 19.4 MB, which replaced the blurry 320 by 180 mobile file on 2026-09-24. The clip is
  2:44 to 3:06 (it was 2:57 to 3:19, which ran into black frames). The audio is Houston We Have
  a Podcast, "So You Want to be an Astronaut?" (11:04), re-encoded with ffmpeg to 64 kbps mono (5.3 MB from 27 MB),
  and the moment runs 1:16 to 1:38, from one pause to the next. The filmstrip is a sprite of the video's own
  frames, one every two seconds (`artemis-i-frames.jpg`, `fps=1/2,scale=96:54,tile=12x15`), cut to fill each tile,
  and the waveform is the episode's loudness per half second (`astronaut-peaks.json`). Play selection seeks to
  the start handle and plays with sound, and the card carries a player for exactly the clip (`#t=a,z`). A browser
  can only seek in media whose server answers byte ranges, which Netlify does, so `serve_website.py` and the
  scenetry test's stand-in now answer them too; without that every clip started from 0:00.
- **The front page, rebuilt 2026-09-23 afternoon** (`website/public/landing.js`, `tests/homepage.py`). It is drawn
  at once, before the database is asked anything: `site.js` reads the session from this browser and, for a
  visitor, mounts `Landing` and only then asks for the latest annotations. It used to wait on the profile and
  the whole feed, a blank page for a second and for good with the database unreachable. "/" is the home page for everyone since 2026-09-25 (it was the feed when signed in). `/?feed` is the feed.
  The hero is the kicker, the headline, one line and two buttons, with a four-tab try-it (Article is `TryIt`,
  the brief; YouTube clip, Podcast and Post on X are `SceneTry` on the same paper). A tab sets the headline's
  word, and the headline only starts changing after the example has played (`annotated-tryit-demo-done`), so
  two pens never move at once. Under it, the install steps in a row (`#get`), and "Latest on annotated", the
  four newest shared annotations with See everything, hidden with fewer than three. The extension marks our
  pages (`data-annotated-installed`, from `article.js`), and then the hero says you have it and the steps
  hide. The paper keeps its own light ink in dark mode, the headline word keeps dark ink on its stroke, and
  nothing in the hero or steps is under 12.5 pixels. `og.png` and the `og:` and `twitter:` tags give the link
  a preview. `hero.js` and the scenes section are gone. After that: choosing a tab mid-example puts the
  example away (TryIt listens for `annotated-tryit-touched`); the headline is "Say what you think about
  anything." with no "on the web", so every word fits two lines and no empty third line is held; the Latest
  row takes as many columns as it has cards (`--n`); and `/install` (`installpage.js`) is the same header and
  the same three steps as the front page, where it was an older list of four with no header.
- **The paper planes** (`extension/fold.js` and `fold.css`, shared with the website by `sync_website.py`; the
  front page's choreography is `website/public/planes.js`; `tests/planes.py`, `tests/planespub.py`). One engine
  (`buildPlane`, `flight`) folds any element into a real dart made of copies of it: ten pieces, each printed with a
  clone and a blank back (mirrored clip, `rotateY(180deg)`), nested in the order a dart is folded (half, wing,
  leading fold, corner). The second fold crosses the folded corner, so the corner is two pieces and the far one
  turns back as the leading fold turns. A plain cover hides the print in the air. Planes fly in a layer of their
  own on `body` at page coordinates; the brief's perspective and tilt are copied onto it. Clones sit in
  `display: contents` stand-ins for their ancestors so their styles still match, and carry `pl-copy`. Paths are
  sampled into keyframes with heading, bank from the rate of turn, pitch from the climb, height as `translateZ`,
  and a shadow. `Fold.arrive(el)` drops a plane in and opens it as `el`; `Fold.carry(el)` folds `el` and circles
  until `.land(target)`. `Fold.on()` is false with reduced motion, with "Paper planes when you publish" off in
  Display settings (`planes` in prefs.js, `Prefs.get()` returns the whole object), and in a browser driven by
  tests unless it asks (`?planes`, or localStorage `annotated-planes` = on).
  In the extension: Publish folds a plain card of the take and quote (`.flyCard`, since a copied text box keeps
  none of what was typed) into a plane that flies off, up and out of the panel (`Fold.away`, `PanelKit.sendOff`,
  `grounded` on failure), and the published or saved card appears once it has gone. It used to circle for the
  length of the upload and land back as the card, which read as bouncing about (recording of 2026-09-24 at
  19:06). Publish it now on a saved card does the same; an annotation's page opened from Publish drops in (`opts.showBanner === true` in
  `annotation-page.js`, saved ones included, which have no banner).
  On the front page: the brief flies in over the headline and opens; after two seconds the example marks a
  phrase, lifts its card, and, while Yours so far is empty, folds away and lands there as a card labelled
  Example (`annotated-tryit-example`, `annotated-example-settled`, `data-planes-on`); your takes from any tab fold
  away after four seconds and land there; the brief comes back with a short drop. A click or key finishes every
  flight, and ?noplanes shows the page without them.
- **Undo, right after publishing** (`PanelKit.published` `onUndo`, `unpublish` in `sidepanel.js`, `tests/undo.py`).
  The card offers Undo for ten seconds, and not once anything else on it is pressed. It deletes what was just
  made, online and here, and puts the take box back with the words in it. The help screen links to the website
  ("See annotated's website"); the logo on the extension's own pages stays Home, being their only way there.
- **The recording of 2026-09-24 at 19:34** (`tests/walk1934.py`). Beside annotated's own page, Home and Your
  profile in the panel move that page (`homeOrPage`), where the panel used to draw its own list for a second
  and offer "Back to annotated". Beside the feed with a way back to what you were reading, the start page is not
  repeated; with none it stays. The help screen has "Open annotated's home page" as a button, and the account
  menu has About annotated. The website was deployed on 2026-09-24 through the Netlify connector, since the
  CLI is not signed in (`npx -y @netlify/mcp@latest --site-id ... --proxy-path ...` from `website/`, the path
  given by the connector's deploy-site). Netlify adds its own toolbar script, which the CSP blocks; harmless.
- **The recording of 2026-09-24 at 20:19** (`tests/walk2019.py`). The extension's feed and profile pages redraw
  when the store's stamp changes, so a delete in the panel no longer leaves them listing, and offering to delete,
  what is gone. The delete-all button stays red on hover. Beside annotated's own website the panel is Home,
  where it read the demo episode as a podcast to clip. The panel starts blank rather than on the old "Open
  something to annotate". Signed out on the website's feed the rail offers Sign in, not a "You" card, Following
  does not mention the panel, and an empty feed offers the home page. On the home page, the example does not run
  for someone who has made one, your cards from before do not fly in again, the headline's word follows only the
  tab (it no longer goes round on its own), and the install area waits up to 0.8 s for the extension's mark
  (`landChecking`). A take in the clip, podcast or post tab says "You, just now", not Example. A fold keeps the
  words until it is halfway. The clip card uses the brightest frame in the clip (`artemis-i-frames.json`, from the
  sprite), and the cards in Yours so far share one height. The panel keeps the start page beside an empty page.
- **The recording of 2026-09-24 at 21:03** (`tests/yours2103.py`). Yours so far has a × on each card and Clear all,
  each with Undo for six seconds; removing the brief's take clears `annotated-tryit` and tells the extension
  (`annotated-tryit-removed`, and `-restored` on Undo), so the panel stops offering it. A clip's card plays its clip
  muted and on repeat while in sight (`loopClip`; the address carries only the start, since with the end the
  browser pauses there). A card waiting for its plane holds a dashed slot (`:has(> .card.pl-hidden)`), and quotes
  are cut to three lines. The logo on the extension's own pages opens the website (the panel has Home). The
  website's feed is headed Feed. Feed cards use a published annotation's full-size screenshot before the small
  copy kept here, and that copy is now 760 pixels wide, where 360 looked blurry.
- **The recording of 2026-09-24 at 21:48** (`tests/walk2148.py`). Your earlier cards fly in again on each visit, as
  David asked (reverting the change after 20:19). With the extension installed a card opens the tab it was made in
  (`annotated-open-kind`), since its install link went nowhere. The foot of the home page has "Turn paper planes
  off/on" (`annotated-planes-off` in localStorage, honoured by `planes.js` and `Fold.on()`), and the panel's
  setting is called "Paper plane animations".
- **The recording of 2026-09-24 at 23:56** (`tests/walk2356.py`, the hold since cut to 0.6 s). The help screen's "Open annotated's home page"
  goes to a tab already on the home page, whatever its query (`a.wSite`, handled in `sidepanel.js`). An empty
  Your profile says to select words or clip something. Installed, the front page says "annotated is
  installed." (it said "You have annotated."). A card in Yours so far scrolls to the try-it only when it is out
  of sight, and a moment's whole waveform plays it. A take is shown for two seconds, not four, and its card is
  kept out of the row meanwhile (`pl-held`), so no empty dashed slot waits there. The brief resets while it is
  folded away and drops back in 1.3 seconds, about 2.6 seconds without paper in all, where it was over three.
  A passage's and a post's card show their words large and marked (`.yQuote`), and name the kind under the
  source. Undo sits in the row's heading, so removing a card no longer moves the row. Not done: the website
  and the extension keep separate sign-ins, so the site offers Sign in with Google beside a signed-in panel.
  The audit's guard on a floating panel the browser reports as covered no longer disables Publish, Undo and the
  delete buttons. They ask for a second press ("Press again to confirm") instead, because headless Edge reports
  a plainly visible frame as covered, and real Chrome may on some pages. `publish_now` in `_env.py` presses twice
  when asked, and `ext_float.py` checks the wording.
- **The recording of 2026-09-25 at 01:15** (`tests/walk0115.py`). Under the panel's Home and Your profile lists, and
  under Your annotations beside an annotation, a full-width button opens the full page ("Open Home as a full
  page", "Open your profile as a full page"), since the small "See all annotations" link was hard to find. Beside
  the full Home or profile page the panel keeps its start tools under the way back, where it was one line and
  white space. Help closes on Home, Your profile, the home page link, or another tab once it has been seen
  (`leaveHelp`). The clip follows the player once, until the range is touched (`wanted`, `userSet`, `followed` in
  `videopanel.js`), so a live stream no longer offers 0:00 to 0:30 of a two hour stream; a live clip ends where
  you are, and the bar reads "Stream so far" (`live` from `content.js`, `.ytp-time-display.ytp-live`, assumed from
  YouTube's page, not checked on a real live stream). Letting go of a handle rescales the trimmer only when the
  pointer leaves the track or after 1.5 s. The YouTube heading has its icon (`phead('video')`, it asked for
  'clip'). "Publishing…" stands where the take was while its plane flies (`.flyNote`). An annotation page from
  Publish holds its comments, rail and banner until the card's plane has opened (`pl-landing`). The extension's
  Home page asks for who you are, the local copies, the list and the rail together (`feed.js`).
  On the website: a take folds 0.6 s after Make the annotation (two seconds read as a delay), Yours so far says
  "Get the extension to do this on any page" once under the row and not on every card (`.llGet`, hidden when
  installed), the example post is laid out like a post on X (`.stX`), and the GitHub link reads "See the code on
  GitHub".
  The Post on X tab then became a real post, at David's choice: Elon Musk's of September 24, 2026
  (https://x.com/elonmusk/status/2103160462472892536), word for word as X's public embed gives it, with his name,
  handle, date and a link to it, and no view, like or repost numbers, since the real ones are not known here.
  The video and podcast tabs keep the NASA media: a CBS interview or an All-In episode could not be hosted.
- **The recording of 2026-09-25 at 03:14** (`tests/acctmenu.py`, `tests/walk0115.py`, `tests/walk2356.py`). The
  account menu offers Delete all only when you have something to delete (`hasAny` in `Account.setActions`), since
  with nothing it opened a profile saying only that. The small "See all annotations" and "Open your profile" links
  are gone, the full-width buttons under the lists being the one way to the full page. After Clear all on the
  front page, the emptied row says "All cleared. Make one above." while Undo is offered (`.llEmpty`). The
  headline showing "a passage" at 0:12 was the Article tab already chosen in that tab, not a flicker.
- **The recording of 2026-09-25 at 03:54** (`tests/walk0354.py`). The plane's shadow blur is kept at zero or above
  (`fold.js`), since Chrome listed dozens of "Invalid keyframe value for property filter: blur(-0.2px)". A website
  tab notices a sign-in or sign-out in another tab and reloads when next looked at (`storage` on `annotated-auth` in
  `site.js`), and a front page picks up Yours so far from other tabs (`storage` on `annotated-yours`). On an
  annotation page your card counts your annotations (it said 0). The feed asks for its list and who you are while
  the page's code loads. The example plays whenever Yours so far is empty (the brief's last take no longer counts).
  Yours so far is drawn like the feed's cards: one hairline frame, the take as the headline, the quote as marked
  words, the source as one line with its icon, the × on hover. A clip card starts on its brightest frame. The hero
  reads "For Chrome" and "Highlight a sentence, clip a video or podcast, or quote a post. Add what you think. Share
  the link." (David's pick), and the installed line "You're set." The install button arrives as a plane after the
  brief lands and unfolds into the button.
  **One account on both, without sharing a session.** `article.js` tells our site who the extension is signed in as
  (`data-annotated-user-id`, `-name`, `-email`, event `annotated-user`), never a token: two clients refreshing one
  Supabase session would present a rotated refresh token and get the session revoked for both. Signed out, the site's
  buttons read "Sign in as <first name>" and Google opens with that account picked (`login_hint`); signed in as
  someone else, `.acctMismatch` offers "Use <name> here". The site's count fix and the account line were checked
  with stand-ins, not against a real second account.
- **The recording of 2026-09-25 at 04:27** (local copy against the live site). The install button's plane sets off
  1.3 s in, while the brief is still arriving, instead of after it lands. The example plays once a browser visit
  (`annotated-example-shown` in sessionStorage). The way back names our site "annotated's home page" (`cleanTitle`).
  A feed picture still loading shows a light placeholder rather than a black box, clips keeping their dark frame.
  Beside the local copy (127.0.0.1:8812) the panel takes the page for a podcast and the hero still offers the
  install steps: both are local only, the extension recognising only annotated-app.netlify.app.
- **The recording of 2026-09-25 at 04:48** (Edge, Chrome and Firefox against the local copy). The YouTube tab's clip is
  2:44 to 3:06, ignition and liftoff, lit throughout (it ran into the black night after 3:08), and a clip card keeps
  its still frame until the video is really playing and whenever it seeks or waits (it flashed black in Edge and white
  in Firefox). A clip or podcast tab shrinks as soon as it has reset, where it held its full height for the whole
  flight. The website draws its outline for every page, the feed included, before the page's code loads. Your own
  profile ends with Delete all and Sign out (`.profileFoot`), where they led the page above your annotations.
- **The recording of 2026-09-25 at 05:34.** "/" is the home page for everyone, signed in or not; the feed is at
  `/?feed`, a Feed link in the header (`landing.js`), and the feed's own Home and "See annotations" go there. Signed in,
  "/" used to be the feed, so help's "Open annotated's home page" landed on an empty feed and the example was one small
  "Try it" line away (`slimLine`, no longer called). The try-it has "Show me an example" (`.tiShowMe`, `demo(true)`),
  which plays it whatever has happened before; on its own it still plays once a visit, with Yours so far empty.
  After the recording at 05:47: on the website the logo is the home page and the nav's button is Feed (`.navFeed`,
  `onFeed`), where the button was called Home and opened the feed, so Home on the feed went nowhere.
- **The recording of 2026-09-25 at 06:01** (`tests/walk0601.py`). A published annotation deleted online (from another
  page, computer or the website) is taken off this computer when the panel or the extension's feed pages list it
  (`Cloud.gone`, `Store.pruneGone`), and the panel says so once; "test 5" went on showing in the panel and on the
  extension's profile after it was deleted online at 04:53. `Cloud.gone` treats an error as nothing gone, so a network
  hiccup never drops anything. `?preview=visitor` shows the home page as a visitor sees it, extension or not, with the
  install plane every time. The install button's plane is decided at launch: holding it only when the button was
  already showing skipped the plane whenever the 0.8 s installed check was still running, real visitors included.
  Tests that serve an empty database must answer the existence check (`exists_reply` in `_env.py`), or their published
  records are taken for deleted online. The YouTube tab shows the clip's start frame from the sprite until the video
  plays (`.stScreen.live`), where it was a black box.
- **The recording of 2026-09-25 at 06:58** (`tests/walk0658.py`, `tests/planespub.py`). The install button arrives by
  plane for everyone, the extension installed or not (David's call); installed, it downloads the zip, the steps stay
  hidden and "You're set" sits under it, naming "the annotated plane in your toolbar" (it said pen, and ran on into a
  "What people are saying" link). Signed in, the home page's header has You (`navProfile`, `onProfile` from
  `site.js`), and the Feed button lost its house, the logo being the home page. The logo on "/" scrolls to the top
  rather than reloading and replaying every flight. `site.js` writes "?feed=" back as "?feed" after Google sign-in
  (`tidy`). An empty feed or profile on the website offers "Get the extension to publish one" (`/install`), since
  the home page's takes never reach either. The extension's full list is headed Feed, its tab "Feed | annotated",
  and the panel's button reads "Open the feed as a full page". Help's headline is the website's. On an annotation
  page from Publish the Published toast waits for the plane, since its `riseIn` animation outranked
  `.pl-landing .banner`'s opacity. The plane was made a small card of the take and quote for 2.33.11 and put back
  to the whole annotation folding and opening out in 2.33.12, which David asked for (recording of 2026-09-25 at
  14:50: "the whole post i captured would unwrap in a cool way"). The panel's Home draws its start tools from this
  computer at once (`drawBrowse({ quick })`, "Loading annotations…") and then the lists, where it sat blank for two
  seconds; the account button stays out of sight (`acctPending`, three seconds at most) until the panel knows who
  is signed in, where it said Sign in to someone signed in. The white frame at 2:16 was the launch's steam.
- **The recording of 2026-09-25 at 14:08** (`tests/walk1408.py`). You on the home page waits up to three seconds
  for the account and otherwise uses the handle this browser last read (`annotated-last-handle`,
  `Backend.lastHandle`); it went to the feed. The feed and profile pages read their lists again when their tab comes
  back into view after 1.5 s away (not with Delete all's question open or a box in use), since a profile went on
  listing what the panel had deleted. The loading outline carries Feed and You or Sign in, and the footer hides
  while `#page` is an outline. The panel's `renderBrowse` does nothing when its words would not change
  (`dataset.sig`), because a redraw replaced "Open your profile as a full page" under the pointer and it took two
  seconds to answer; the button says "Opening…" when pressed. The full page goes to a website tab already on
  `/?feed` or your `/@handle` before opening the extension's (`openFull`), and the extension pages' logo goes to a
  tab already on the home page. The panel's Home, opened again, shows the lists it last drew for that account
  (`lastHome`) instead of "Loading annotations…" and a jump from For you to Everyone. Help's button reads Got it,
  and beside the home page help leaves out "Open annotated's home page". An empty profile says "Select words on any
  page, or clip a video or podcast, and it shows up here." on the full page as in the panel, and someone else's says
  they have not published anything. Download buttons read Downloaded once pressed. The page does not scroll
  sideways while a plane flies (`html:has(> body > .pl-layer)`). The stroke under the take is gone. The dark
  divider on a post card in Yours so far at 0:36 could not be reproduced: all cards draw the same line.
- **The recording of 2026-09-25 at 15:38** (`tests/walk1538.py`). Beside the extension's own feed page, Home in the
  panel opens the panel's list (`homeOrPage`), since moving the page to where it already was did nothing four
  times. Beside our website, "Open the feed as a full page" moves that tab to `/?feed` (`openFull`). The annotation
  page asks for who you are, the local copy, its social counts and the rail together (`annotation.js`), 1.9 s
  where it was 3.5 s with a slow database, so the plane from Publish starts sooner. The account menu and help put
  each other away (`Account.close`). The panel's last Home lists are kept in `chrome.storage.session`
  (`annotated-lastHome`, slimmed by `slim`), so reopening the panel shows them rather than "Loading annotations…"
  and a jump from For you to Everyone. A video folds into a plane as the frame it shows (`fold.js` draws it to a
  canvas, or uses the still set on it), where it was a black bar, and the try-it's new clip card shows the clip's
  first frame from the sprite until the video has one. The podcast example's player plays the episode and the
  clipped waveform plays 1:16 to 1:38; "It lands as a page" has four reactions; the poll editor holds only the
  question. The way back calls an X post's page "the post on X" (`cleanTitle`).
- **The recording of 2026-09-25 at 16:02** (`tests/walk1602.py`). Home in the panel beside any feed page opens the
  panel's list, whatever follows in the address, and Your profile beside `feed.html#profile` does the same
  (`homeOrPage`); should Home only have switched to the tab already in front, the panel shows its list. It did
  nothing five times in real Chrome while the exact-address test passed. From Publish, an annotation page is held
  from its first frame (`pl-arriving` set at the start of `render`), where its back link, rail and comments showed
  for a quarter second before the plane. The website's loading outline (`index.html`) is the real header, still,
  with only the outline under it breathing, where the home page opened on a white screen. The panel's first Home
  with nothing kept hides its tabs while loading. The home page replaying its opening at 2:15 was a new tab from
  the extension page's logo, not a tab Chrome had put to sleep.
- **More of the extension on the front page** (2026-09-25, `tests/features.py`). "Receipts that stay": a post
  saved as a marked picture, with a Delete the post button that leaves the saved annotation standing. Under "It
  lands as a page", how its link looks as a card in a post on X. The Post on X tab asks to show the post as a
  Screenshot, an Embed or Both (`postAs` in `scenetry.js`, the screenshot a copy of the marked post scrolled to
  the quote). The Article tab offers "Use the whole sentence" when the words start or end part way through one
  (`tiWhole` in `tryit.js`, from `ArticleCore.expandToSentences`). Six more chips: trending and people to follow,
  invite by email, already annotated, drafts kept, clips checked, works offline. The example account in Receipts
  is invented and labelled Example; nothing claims a real person said it.
- **Other things it does**, called What else it does until 2.33.22 (`website/public/features.js`, `tests/features.py`, 2026-09-25). Under Yours so far on the
  front page and before the install steps, three working examples, each labelled Example and sending nothing: "Say
  it your way" (a take, a tag, a poll to vote on and reactions, drawn as the card while you make it), "It lands as a
  page" (a finished annotation with reactions, a reply box and File a claim, which says nothing was sent), and "Clip
  what's playing, even on Spotify" (three steps, playing, found in Apple's directory, cut from the show's own file,
  over the NASA episode's real loudness). Then a line of chips with a tip each for the rest (floating panel, six
  colours, light and dark, voice notes, GIFs, photos and videos, save as GIF, Undo, signed out, the shortcut, live
  streams, For you). Marked words keep dark ink in dark mode, and the section clips sideways so a tip cannot widen a
  phone page. A backup before it is the tag `backup-2026-09-25-before-features` and
  `E:\claude_code\backups\annotated-backup-2026-09-25-before-features.zip`.
- **Audit of 2026-09-24, fixed** (`tests/walk2148.py` part 4). The try-it's reset empties the box and puts the ending
  away at once and only waits (for the card to sink) before taking the marks off, skipped if a new take began
  (`resetGen`); "Mark a sentence for me" puts a finished take away first. Undo on Yours so far ends when a take is
  made or published meanwhile (`endUndo`). The planes queue only the cards there on arrival (the observer stops
  after the first landing), so a redrawn row does not fly in again. Beside the website, the panel's Home has no
  Back. Delete all on the profile page always lets it redraw again (`try/finally`). Installing only moves a tab on
  the front page or /install. The try-it's tilt loop runs only while moving or while a card rises (it ran at 60
  frames a second, a layout each, while a card was up). The clip tab's video loads when the tab is first shown.
  Capture decides blank frames on a 40 by 24 copy, so the 480p canvas stays on the GPU.
  Not fixed, for David's decision: a page can restyle the floating panel's open shadow root and a script's
  `.click()` on the Annotate button counts as a press (security audit, both medium); caching headers; lazy
  loading the emoji and compose code on the front page; one round trip for comment reactions; GIFs from any host.
- **Yours so far** (`landing.js`, `tests/installed.py`). The front page shows no published annotations; people
  make their own in the try-it. The row under the install steps holds up to four of yours from any tab
  (`annotated-yours` in localStorage, newest first), with a frame of the clip or the moment's waveform, and hides
  while empty. Every card says "Get the extension to do this on any page", since they are all demonstrations. Installed from the front page, the extension moves that
  still-open tab to `/?installed` and brings it forward (`showInstalled` in `background.js`), where the hero says
  it is installed and what to do next; installed any other way, nothing opens.
- **The logo** is the paper dart: `extension/icons` (on the dark square, with its dashed trail at 48 and 128),
  `website/public/favicon.png` and `icon.png`, and `Brand.mark()` beside the name in `Brand.wordmark` (`.wmPlane`,
  the swipe now behind `.wmWord` only).
- **The recording of 2026-09-24 at 17:09** (the front page, `tests/planes.py`, `tests/scenetry.py`).
  Scenes announce a take with `annotated-scene-made`, and the brief's try-it with `annotated-tryit-made`, and
  landing announces the drawn card with `annotated-yours-drawn`, which is all the planes listen to. With the
  planes: the take waits four seconds under "That's an annotation. It's going to Latest, below." (a click in
  the tab or another tab keeps it there and shows the card at once), then folds and flies to its card if Latest
  is in view, or down and off the window if not, and the line becomes "Yours is in Latest, below. See it"
  (`.seeYours`, handled in `landing.js`, scrolls there). The brief returns with a short drop from above, not
  the opening flight, and the tab holds its height until then. The tabs share one grid cell (`.heroTry`), a
  hidden one keeping its place, so switching tabs never moves the page; `[hidden]` in `ui.css` is `!important`,
  so that rule needs it too. A capture folds the trimmer to its line of times, the card's player (`.stClip`)
  covers only the clip and returns to its first frame at the end, and leaving a tab pauses its card's player.
  The clip and podcast tabs carry a source line at the top, and the post tab drops its marking links once words
  are marked. An annotation or profile page draws its outline (`.skel`) at once. The Latest planes wait for half
  the row, start just above it, and are smaller. The example waits two seconds after the first landing
  (`data-plane-landed`). The small plane that carried a tab is gone.
- **Published is said once**, arriving from Publish (`annFrom`). Opening your own annotation later from a
  list or from trending used to say Published again, because the banner went by whether the page had been
  seen, and staying in the panel after publishing means it never had been.
- **A refused delete is silent.** Row level security answers a delete of someone else's row with no rows and
  no error, so `Cloud.remove` and `Cloud.deleteComment` ask for the deleted ids back and treat none as a
  failure. Before that the local copy went, the panel said it worked, and the shared annotation stayed up.
- **Your own lists are yours on every screen.** The panel's You (`drawBrowse`) and the page's "Your recent
  annotations" (`railRecent` through `yoursOnly`) list only what the person signed in wrote, or what nobody has
  published. The recording of 2026-09-22 at 22:17 signed out of one account and into another, and both lists
  went on showing the first account's work, and the panel offered to delete it. The panel draws You again on
  every sign in or out. Beside someone else's annotation, the panel says whose it is ("By Robo Taxi").
  `tests/youlist.py`.
- **X's profile cards stay out of the screenshot.** X opens a card when the mouse rests on a name, and a capture
  takes its picture a moment later, so the card used to cover half the post. `hideHovers` in `article.js` keeps
  `[data-testid="HoverCard"]` from being drawn for five seconds from the start of a capture. `tests/hovercard.py`
  proves it with a solid red card, 16 percent of the picture without the fix and none with it.
- **The account menu takes the keyboard.** Focus moves into it when it opens and Tab stays inside until it
  closes. The link preview only ever shows a handle that could be saved.
- **The author is asked for again.** Publishing snapshots the author into the local record and the local
  record is preferred, so a changed name or handle used to stay wrong forever on the computer that published
  it. `Cloud.authorNow` refreshes it and writes the answer back.
- **The account menu** says what a handle is ("Your name on annotated. It shows on everything you publish and in
  the link to your profile."), shows the profile link as you type, gives the rules before any mistake, keeps
  Save off until the handle has changed, and warns that links to the old handle stop working before you save.
  It also holds Your profile and Delete all my annotations (`Account.setActions`, set by `sidepanel.js`).
  Delete all opens your list with the question already asked, so you see what is about to go. On the profile
  page Delete all is a red outlined button, where it was a faint link. David said it was hard to find.
  `tests/acctmenu.py`.
- **Accounts** (`backend.js`, `account.js`): Google sign-in through Supabase with `chrome.identity.launchWebAuthFlow`
  and the PKCE code exchange. The session is kept in `chrome.storage.local` under `annotated-auth`, which is
  also how `handlesave.py` signs a test in without Google. The handle can be changed in the account menu, and
  it is written to `.acctAt` rather than to the first span in the block, which is the avatar. Writing to the
  avatar filled the circle with "@testh" and left the old handle on screen. Changing a handle keeps every
  annotation link working, because those resolve by id, and breaks every profile link, because those resolve
  by handle, which is what the message now says. The manifest carries a public `key` so
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
- **A photo or video of your own in a take** (`compose.js`, the picture button). Chosen, dropped onto the
  take or pasted. JPEG, PNG, WebP or GIF pictures and MP4, WebM or QuickTime videos, up to 25 MB, which is the
  bucket's limit, and anything else is refused on the spot with the reason. One picture per take, so a
  photo and a GIF put each other away, and it counts as a take by itself. It has a line describing it for
  anyone who cannot see it. Publishing puts it in the media bucket as `upload.<ext>` and the row's `upload
  jsonb` holds the path, kind, size and description, and the column is only sent when there is one.
  Migration 11 added that column and let the bucket take GIF, MP4 and QuickTime, applied 2026-09-22. The
  GIF button carries a small GIF badge, because it used the picture icon and read as an upload button.
  `sidepanel.js` and `preview.js` copy a take field by field before saving it, so a new field has to be
  added there too, which is the one place this is easy to miss. `tests/upload.py`.
  Comments take a photo or video the same way. `Compose.checkMedia` is the one set of rules for both boxes,
  and it opens the file once and hands the same address to the preview, which is why the picture now shows
  at the same moment as its Remove button. A comment's file goes to `<uid>/comments/<annotation>-<time>`,
  because the bucket only lets each person write under their own folder, and `comments.upload jsonb` holds
  it. Migration 12 added that column and let a comment with no words stand on a photo, applied 2026-09-22.
  Deleting a comment does not yet delete its file.
- **A quote over several blocks keeps its breaks** (`quoteText` and `blockText` in `article-core.js`). Each
  block is collapsed on its own and blocks are joined by a blank line, so a headline and the paragraph under
  it no longer read "in a decade The board says". The panel shows it with `white-space: pre-line` and the
  annotation page draws each block as a paragraph (`inked`). One block reads exactly as before.
- **A capture survives a panel reload** (`keepFor` in `sidepanel.js`, `opts.keep` in both panels). The
  capture and its screenshot wait in `chrome.storage.session` under `annotated-cap:<a|p>:<url>` and are
  drawn again when the panel comes back, with the take restored by the draft. Publishing or starting a new
  annotation clears it. The post panel had no `draftKey` until then, so its words were not kept either.
- **A page with no words** (`textLen` in the `a-info` reply) says "No words on this page" rather than asking
  for a passage.
- **The comment clock stops itself** when the comments it keeps current are gone (`render` in
  `annotation-page.js`), and the deleted and not-found pages stop it before replacing the page. An annotation
  deleted while its page was open used to throw "Cannot set properties of null" every thirty seconds, which
  the recording of 2026-09-22 at 21:56 found in Chrome's error list. `tests/clockstop.py`.
- **Publishing never waits forever** (`inTime` in `sidepanel.js`). Offline, the session and the profile both
  wait on the network, so Publish used to show nothing for five seconds and then sit on "Publishing" with no
  end. Offline now saves on this computer at once and says so. Online, publishing has a minute plus ten
  seconds a megabyte, and if it lands after that the local copy is marked shared, so nothing publishes twice.
  The duplicate check waits at most a second and a half for who you are. Before publishing, one quick request
  to `/auth/v1/health`, carrying the public key (`Backend.key`) so it is answered rather than refused with a 401
  the browser logs as an error, asks whether annotated can be reached at all, because a browser can think it is online
  while nothing gets through, and the database client retried for about seven seconds. `tests/plan9.py`. The late-landing path has no test,
  because the wait is a minute long.
- **A take in progress survives a reload** (the draft in `compose.js`, keyed by `draftKey`). The words and
  the tag are kept in `sessionStorage` for the article and post panels, and a line says a photo or voice note
  has to be added again. A new capture no longer clears the take either, so "Capture this passage instead"
  keeps what you wrote. Publishing and starting a new annotation still clear it.
- **Typed clip times that cannot be times** leave the clip alone and say why (`applyTyped`). The real-time
  capture line uses the clip's own length, and a tip button says whether it will show or hide the tip.
- **Empty panel shortcuts**: beside a page with nothing to annotate, the panel offers YouTube, X, Spotify,
  Apple Podcasts and Google News (`GO_SITES` in `sidepanel.js`). A blank or new tab goes there, and any other
  page stays put while the site opens beside it. `tests/golinks.py`.
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
- **On X the panel says what works there**: the timeline is not a story and it is not one post, so
  `makeArticle` passes `xHost` and the empty state reads "Quote a post" with a line about selecting words
  inside a post. Only a `/status/` address gets the post panel proper.
- **Back, and the source**: an annotation page carries two controls in `.topRow`, Back on the left and the
  thing it was taken from on the right, because one button doing both jobs under the name Back sent people to
  X when they meant to return to the list they came from. The source control says what it opens ("See the post
  on X", "Watch the original", "Listen to the episode", "Read the article") and opens a tab of its own. Back is
  offered only when there is somewhere of ours behind you, and `annotation.js` works that out three ways. The
  panel writes `annFrom: 'publish'` into `chrome.storage.session` when it sends you here from publishing, which
  is the one case where the page behind you is the source, so Back says "Back to the post" and returns to the
  tab you captured from. Otherwise a mark in `sessionStorage` left by `annotation.js` and `feed.js` says one of
  our pages has been in this tab, so Back means `history.back()`. `history.length` cannot answer this, because a
  tab that has only ever been to one place still reports two entries, having started on a blank page. Arriving
  cold on a shared link there is no mark, and no Back. On the website `cameFromHere()` asks the same question of
  a same origin referrer. `tests/backnav.py` covers all four arrivals.
- **Where things open**: annotated's own reading pages live in one tab. Home, a profile and every annotation
  move that tab (`openExtPage`), and leaving annotated, a source or a post on X, opens a tab of its own.
  Publishing stays where you are. The panel shows the published card with the link and View page, and Display
  settings offers Open the page for anyone who wants Jason's "go straight to the page" instead.
- **The panel's own Home and profile**: `PanelKit.topLinks` puts them in the top bar in every mode, and they
  read inside the panel through `AnnotationPage.renderBrowse` rather than taking a tab. `openBrowse` draws
  the list before it swaps the panel over, because hiding everything first left the panel empty for about a
  second every time. Home holds only while
  you are still on the page you opened it from (`browseFrom`), so a take in progress is never pulled out from
  under you. Change tab, or let the page go somewhere else, and `refresh` drops browsing and comes back to
  what you are looking at. Waiting for Back left the panel on a stale list for a whole minute in the recording
  of 2026-09-22, including on a post it should have been offering to annotate. "See all annotations" opens
  the full page for what the panel is too narrow for. The pages inside the extension pass `siteNav: false`,
  because the panel beside them already carries Home and You; the website keeps its nav, having no panel.
  Deleting every annotation at once is offered both there and on the profile page, from one piece of code.
- **A follow has to reach every window.** `Cloud.discovery` holds follows, people and trending for a minute,
  and the panel and the page are separate documents with a cache each. Following someone on the page left
  the panel's Following tab empty and saying you follow nobody, which is what the recording of 2026-09-22 at
  16:56 showed. `onFollow` now writes `annotatedFollows` to `chrome.storage.local` and every document drops
  what it held when that changes. The website skips this, having no `chrome.storage` and one window.
  Pressing Follow also moves your own following count (`.youFollowing`) and takes that person out of people
  worth following, because the same screen used to say Following on the byline and nought in your card.
- **For you** (`forYou` in `cloud.js`, rebuilt 2026-09-22 after David asked for it to make sense). It never
  offers your own annotations or ones saved only here, since those are under You. Interest comes from people
  you follow (strongest), someone you follow joining in, a source you annotated, people you have replied to,
  reacted to or voted with before, and your tags. Worth comes from how many different people joined in, the
  author's own replies not counting, with replies and reactions worth far less than a new voice. Newer counts
  more, halving about every two days. Picking is greedy for variety, so no two cards in a row share a person
  or a source and nobody has more than two in the top ten while others are left. What you have opened
  (`annotated-opened` in localStorage, written by `Cloud.markOpened`) and what you already joined in on move
  down. Every card carries its reason (`r.why`, drawn as `.cwhy`), such as "You follow Sawyer Merritt". This
  needs who replied, reacted and voted, so `Cloud.list` selects `comments(author_id)` and `poll_votes(user_id)`
  and each record carries `voices`. The panel keeps For you in its ranked order. `tests/foryou.py`.
- **Every tab says what it would hold.** `homeTabs` carries an `empty` line for each of For you, Following
  and Everyone, and the panel draws it. It used to say "Capture something and it shows up" under Following,
  which is about your own annotations.
- **Telling two of one thing apart**: trending named a source by its author, so two different posts by one
  person read as the same row twice. `Cloud.trending` asks for a quote for the rows that share a name, and
  only those. People worth following says where everyone went instead of disappearing when the list empties,
  and a refused Follow says so rather than letting the button flip back in silence.
- **What the walk-through of 2026-09-22 fixed** (`tests/explorefix.py`): a captured whole post shows its
  text under "You're annotating" (`.pWhole`); setting one end of a clip past the other says which end moved
  (`.rMoved`) and the panel says a capture takes as long as the clip (`.capTime`); Ctrl or Cmd and Enter
  publishes from anywhere in the take box; Escape closes help; the widen offer goes once an article is
  published; after publishing, Back is the one way to the source (`backIsSource`); a source card uses the
  site's own picture or none; the line under Publish, the duplicate warning, the claim form, the Following
  tab and the signed-out page all say what is actually true; your card and your tags on Home count your
  annotations, not the tab's (`yours`); incomplete trending and people rows are dropped.
- **Most talked about lately** (`drawTalked` in `sidepanel.js`, `Cloud.talkedAbout`, the `talked_about` RPC from
  migration 13): three rows above "Start somewhere" on the empty panel. Nothing counts views of pages on the open
  web, so "talked about" means talked about here. Per source over fourteen days, an annotation counts 1, a reply
  1.5 and a reaction 0.5, each weighted by `exp(-age / 3 days)` so the weight halves about every two days, and
  the sum is multiplied by the square root of the number of different people, so one person posting a lot
  cannot top it alone. The panel asks once and again after ten minutes at most. It shows nothing, not even the
  heading, when there are no rows. Titles are written with `textContent`, and a row whose address is not
  http(s) is dropped. Display settings has "Suggest places to start on an empty panel" (`suggest` in
  `prefs.js`), which hides this list and the site links together and leaves pasting a link and clipping a
  podcast by name, because those are tools. `tests/talked.py`.
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
- **Podcast audio only comes from the public internet** (`FeedPod.publicAddress`, audit of 2026-09-22). A
  publisher writes the episode's address, and the extension can reach addresses on your own network that no
  web page can, so a clip cut from `http://192.168.1.1/...` and published would have put that device's answer
  in a public bucket. Private, loopback, link-local and single-label names are refused, before the request
  and again after any redirect. The panel's waveform of a page's own audio uses the same check. A public name
  that resolves to a private address is not caught, and cannot be from here.
- **A dropped panel gives back its recordings** (`drop` in `sidepanel.js`). An object address keeps its file
  in memory until released, and moving from one video to the next used to hold the last capture.
- **A panel that goes away stops what it was recording.** `drop` calls each take box's `__stopRec` and aborts
  a tab-audio recording, because a voice note being recorded when its panel was dropped kept the microphone
  on, with nothing on screen, until its minute ran out. `tests/audit22.py` watches the microphone track end.
- **The privacy policy says what the product does** (updated 2026-09-22). It had said the page loads X's embed,
  which the site's own security policy forbids, and said nothing of GIPHY, of photos and videos in takes and
  comments, or of what For you keeps in the browser. Change it when any of those change.
- **A page script left behind by an extension reload stays quiet.** `chrome.runtime.sendMessage` throws
  "Extension context invalidated" at the call itself once the extension is gone, before any promise exists, so
  `.catch` never saw it and Chrome listed it as an extension error on every selection. `send` and `podSend` in
  `article.js` and `send` in `content.js` check `chrome.runtime.id` and wrap the call, and the leftover takes
  its button off the page. `tests/ctxgone.py` reloads the extension under an open page.
- **`floatframe.js` declares `var FloatFrame`**, like every other script put into a page, because the toolbar
  button injects it again on every press and a second `const` throws.
- **The link-preview edge function** leaves anything but a 200 HTML page alone, since rewriting a "not
  modified" answer as a 200 sent an empty page, and inserts its tags with a replacement function, because a
  take containing `$'` or `$&` would otherwise copy parts of the page, scripts included, into the title.
- `HOSTLIKE` in `feedpod.js` requires a real ending, so an address hidden inside a tracking address can no
  longer be an IP address. A podcast publisher controls that string through Apple's directory.

## Known risks, from the audit on 2026-09-21

- The `media` bucket is public by link, so a screenshot of a page behind a login is fetchable by anyone holding the
  URL. The URLs are unguessable and that is the whole protection.
- **Times belong to the database** (migration 16). An annotation's `created_at` is set on insert and kept on
  every edit, because an author could date one in the future and hold first place under Newest and in "Most
  talked about" for good. A comment may be dated in the past, which carrying over a local annotation needs,
  but never later than now.
- **Activity is paced in the database** (migration 17): eight reactions from one person on one annotation or
  comment, no letters or markup in a reaction (keycap emoji hold a digit, so digits pass), twenty comments a
  minute, thirty annotations an hour. The page passes those refusals on in their own words (`LIMIT` in
  `annotation.js`), and so does the panel when publishing is refused.
- **The limits need their indexes** (migration 18, audit of 2026-09-23). Migration 10 dropped `comments_author` as
  unused, and migration 17's comment limit then read the whole comments table on every new comment; the claim
  limits did the same to claims. `comments (author_id, created_at)`, `claims (annotation_id, created_at)` and
  `claims (created_at)` put that right, and a plan was checked to use the first. The advisor still lists the
  `user_id` foreign keys on reactions, comment_reactions and poll_votes as unindexed. That is on purpose: they
  are read only when an account is deleted.
- **`sameEpisode` needs a whole word at the end** of the shorter name, since "Episode 1" matched "Episode 12".
  "Clip this one instead" searches once, not twice.
- Claims are limited in the database (migration 15, `claims_guard`): ten on one annotation in an hour and thirty
  across the site in a minute, with the time set by the database so a backdated claim cannot slip under.
- Nobody has a storage quota. One signed-in account can upload 25 MB at a time until the free plan's gigabyte
  is gone, which is the same shape as the claim spam above.
- IndexedDB grows without pruning. Clips and screenshots stay until deleted by hand.
- Supabase reports leaked password protection as disabled. It does not apply, because email sign-up is off and
  Google is the only way in, so no password exists.
- Migration 10 (unused indexes dropped, `source` capped) and migration 14 (poll, GIF, upload and avatar sizes
  capped) were applied in the audit of 2026-09-22.
- Deleting an annotation now removes the files its row names (`Cloud.remove`), because listing the folder
  sometimes came back empty and left the screenshot public by link. The five left from before the fix were
  deleted from the dashboard on 2026-09-22, and the bucket then held only the files of live annotations. Files
  other people attached to comments on an annotation still stay when the annotation is deleted, because
  nobody may delete another person's files.
- Page scraped text (a post's author, an outlet, a byline) reaches the panel's checks list. It is written with
  `textContent`, never `innerHTML`, and it has to stay that way, because a hostile page controls every word of it.

## Open items

- **The panel's refresh** (2.33.16, foot of `sidepanel.js`). Every 400 ms only while a clip, a podcast moment or
  the podcast finder is open (their trimmers follow the player) or a tab is opening (`fast`); otherwise every two
  seconds, with `tabs.onActivated`, `tabs.onUpdated` (address, status, title of the active tab),
  `windows.onFocusChanged` and the store's stamp calling `refresh` at once. A refresh asked for while one is
  running runs straight after it (`refreshAgain`) rather than being dropped.
- **Paper on the desk** (`extension/paperdeco.js`, shared with the website; `tests/paperdeco.py`, 2026-09-25). Drawings
  in the site's own paper and ink, in the shape of annotated's own dart (`brand.js`): planes thrown in a pile (one
  marked in highlighter), a crumpled sheet, a sheet half folded with one line marked, a plane leaving a dashed trail.
  The full pages (feed, profiles, annotations, Not found; `shell` calls `PaperDeco.desk`) carry a pile low on the left,
  a trail above it and a sheet high on the right, fixed in the margins, only at 1440 pixels and wider with a mouse.
  Empty lists show a crumpled sheet and a plane; the panel's lists end on a small pile (`cornerArt`), help has a
  plane on its trail over its drawing, and the home page ends on the desk (`.pdFoot`). All `aria-hidden`, no
  pointer events, no motion; colours are `--pd-*` tokens with a dark half. The examples under "What else it does"
  each arrive their own way (`STYLES` in `features.js`: a glide, a wide swing, a steep drop, a long S, each with a
  little chance), using `approach`, `dist` and `swoop` added to `Fold.arrive`; the row of chips arrives as a flock
  of three small planes whose chips then pop in one by one. They fly only once the page is scrolled, and not with
  ?noplanes, on a phone or a touch screen, as on the rest of the front page.
- **The recording of 2026-09-25 at 21:28** (`tests/walk2128.py`). The loading outline's dart flies nose first along a
  path (`offset-path` with `offset-rotate: auto 42deg`, since the drawing's nose sits 42 degrees above its travel),
  glides down, lands on the outline's top bar and stays (`pdLand`, once), where it slid sideways across and off,
  "like it's strafing". A plane grows only as it opens (`grow` in `fold.js`; the sheet eases with its halves): every
  style measured at most 0.13 of the way to full size while its halves were still more than 60 degrees from open,
  where classic reached 0.8, flutter 0.91 and cascade 1, a closed dart as big as the card. The empty feed's "Get the
  extension to publish one" hides as soon as the page carries the extension's mark (a CSS rule on
  `data-annotated-installed`). The paper was redrawn at David's word that it looked like a word processor's icons
  and footballs: hand-drawn edges, curled corners, soft shadows, written lines and a rough highlighter stroke; the
  stack has a paper clip; the crumpled balls are made fresh from a seed, with uneven facets, a few creases and scraps
  of the page's writing.
- **The recording of 2026-09-25 at 23:23** (`tests/walk2323.py`, `tests/features.py`). The website asks for a list up to
  three times before calling it empty (`listOrNull` in `site.js`), and one that never loads says "These annotations did
  not load" with Try again (`loadFailed`, `onRetry` in `renderFeed`); the profile said "0 annotations" and "Nothing here
  yet" for half a second before three appeared. A clip card waits on the light placeholder, not black (pictures still load
  only once on screen, as `cardpic.py` asks). Beside a YouTube video still arriving, or with no player yet, the panel reads
  "Opening the video…" (`openingHost = 'the video'`) instead of the start page. Reaching the take step puts the cursor in
  the take box (`setStep` in `panel-kit.js`). The examples under Other things it does fly once a browser visit
  (`annotated-features-flown`), and the chips go as soon as their row is in sight, faint while waiting, on planes about
  110 pixels long. A website tab behind the latest release reloads when looked at again, unless something is being typed
  or made (`site.js`, checks `/` at most once a minute). A filter with nothing in it is drawn faint (`.zero`).
  `?noplanes` had never switched off the examples' planes: a backspace character stood where `\b` belonged in
  `features.js` and `landing.js`. The Bash tool turns `\b` in a heredoc into that character, so edit such lines with the
  Edit tool. At David's word, "If the post gets deleted" became **For you, and why** (three example readers' annotations,
  each with its reason, For you and Following tabs, Follow that changes both), and the examples quote real public posts
  on X, word for word and linked. In 2.33.24, at David's choice, they became one debate about the pace of AI and open
  models: Jensen Huang's first post (Jul 24, the open-weights letter), Elon Musk's "Dario is right" quoting Dario Amodei's
  "We Must Pace the Frontier" (Sep 12), Dwarkesh Patel on labs no longer deploying during RSI (Sep 17), and Anthropic's
  position statement on open-weights models (Jul 27, quoted as an article from anthropic.com), and in 2.33.25 Demis
  Hassabis backing Dario's essay (Sep 12). The Post on X tab became Dario Amodei's "We Must Pace the Frontier" post (Sep
  12), where it was Elon Musk's of Sep 24, and "Use the whole post" keeps a space between paragraphs (`quoteText` treats
  a range on an element holding several blocks as several). The takes are written to
  take no side, the readers are made up, all marked Example, and no like or view counts are shown.
- **The recording of 2026-09-26 at 03:37** (`tests/walk2323.py`). The examples under Other things it does fly at most once an
  hour (`annotated-features-flown` in localStorage holds when they last flew), where once a browser visit left a tab that
  reloaded itself onto a new release with none. The plane at the end of the trail at the foot of the home page is a
  button (`footTrail` in `landing.js`, `PaperDeco.ART.flyTrail`, its plane wrapped in `.pdFlyer`, the one decoration
  that takes the mouse): it bobs on hover and, pressed, flies off, then the page plays its flights again from the top,
  the examples included. Only while the planes are on; otherwise the trail is a plain drawing.
- **X signed out** (`tests/xsignedout.py`, 2.33.30). Signed out, x.com serves other markup: no `data-testid`, the words in
  a `div[dir=auto]`, no `<time>`, the date as the text of the status link ("7:01 AM · Sep 12, 2026"). The post panel sat on
  "Waiting for the post". `PostCore` now reads both (`POST`, `TEXT`, `postOf`, `timeLink`), and `article-core.js` finds a
  post through `PostCore.postOf`. Checked against the real signed-out x.com on 2026-09-26 with Dario Amodei's post.
  Found recording the demo video, whose script lives in the session's scratchpad (`demo/demo2.py`, `compose.py`).
  YouTube stalled a capture that seeked back to a point it had not buffered after the page jumped ahead (a script's
  jump, not a person's); a clip set while watching captured fine. Not checked on a real live account.
- **The second exploration of 2026-09-26** (`tests/explore0926b.py`). With the planes on, the home page's example never
  played on a first visit: `demo()` in `tryit.js` marked `annotated-example-shown` before waiting for the opening flight
  to land, and found its own mark when it came back. The tests missed it because they run with the planes off. It is
  marked now only when the example really starts, and it starts about 5.4 seconds in (0.7 s after the landing and 2.5 s
  after the try-it is seen; it was 2 and 4). Each paste box has its own id (`pasteUrl1`, `pasteUrl2`, class `pasteUrl`),
  since the panel holds several and a shared id pointed the label at a hidden one. The install page's header has Feed.
  An invalid handle says why ("At least 2 characters.", "Only lowercase letters, numbers and underscores.").
- **The exploration of 2026-09-26** (`tests/explore0926.py`; the scripts that drove it live in the session's scratchpad, not
  the repository). The examples under Other things it does fly lower and smaller (`z0` 40 to 60, `s0` about 95 pixels;
  the chips' about 85), and the home page's header sits above planes (`.landBar` z-index 70); one was about 310 pixels
  across on a 1280 pixel screen. Signed out, the feed opens on Everyone (`signedOut` on `homeTabs`, read by `startTab`)
  and For you no longer points a visitor at a profile. Signed out, the rail's card says "N annotations saved on this
  computer" (`railYou`, by `me.handle`). A passage card showing its words does not quote them again under the source.
  Words selected in a post on the X timeline name it ("Evan's post on X", `postBy` from `article-core.js`) and the button
  reads Capture from this post. Comments on a saved-only annotation say only you can see them (they were not hidden, which
  about ten tests rely on). Terms and Privacy carry the site header. Two wordings: "before the start of the video", and a
  full stop after the signed-out sign-in line.
- **The recording of 2026-09-26 at 04:06** (`tests/walk0406.py`). The foot's plane clears the brief's own once-a-visit mark
  (`annotated-plane-seen`) too, so the opening flight plays again, and it goes to the top at once rather than gliding up.
  The panel's way back names our own full pages "your profile page" and "the feed page" (`cleanTitle`). A For you card
  unfollowed gives its own reason (`otherwise`), not the one beside it. After Clear all, "Make one above" scrolls up to the
  try-it. A jump to the headline a second after Clear all at 2:05 could not be reproduced: in a test Clear all leaves the
  page where it was.
- **The recording of 2026-09-25 at 21:59** (`tests/walk2159.py`). Clear all in Yours so far no longer brings an
  Example flying into the row it just emptied. The example's turn comes four seconds after the try-it is seen, and a
  row emptied before then read as a visitor with nothing made. `tryit.js` counts what the row held when the page
  opened (`hadYours`), and `landing.js` marks the visit (`annotated-example-shown`) on any removal. Show me an example
  still plays it, and a fresh visit with nothing made still gets it. The extension's own pages land the loading
  plane on their outline too (`.bootMain::before`, the same `pdLand`). The examples under Other things it does were
  rewritten to sound less like AI writing, with David's approval: Tags, polls and reactions; Every annotation gets its
  own page; If the post gets deleted; Clip podcasts from Spotify; and the chip row headed Also.
- **The recording of 2026-09-25 at 20:19** (`tests/walk2019b.py`). The decorations come in many versions
  (`paperdeco.js`): the dart, a glider, a half folded sheet, a dart landed nose first, three crumpled balls, a stack
  of sheets, a torn strip, a sheet folded in half, and four trails (loop, arc, zigzag, and one that missed and ends in
  a ball). Piles are laid out fresh from them on each call, the panel's corner picks one of five, empty lists one of
  four, and a full page's margins choose what goes left and right and at what height (`--pdy`) on every visit.
  Planes open five ways (`open(T, reverse, style)` in `fold.js`, `unfold` on `Fold.arrive`): classic, cascade (one
  fold after another), snap (springing past flat), flutter (wobbles first) and spin; the four examples each use a
  different one, the chip flock three, and an annotation page picks one of classic, cascade and flutter. The example
  planes start inside the window (`within`) at a smaller scale and lower, measured in flight at about half their
  card's width (they were cut by the window's edge and larger than the card). The loading outline is visible (grey
  lines on a bordered sheet; it was white on white, so the annotation page after View page looked blank), its avatar
  is a light placeholder, and switching to an open home page scrolls it to the top.
- **The recording of 2026-09-25 at 19:26** (`tests/walk1926.py`). View page did nothing, ten presses: `openExtPage`
  reused annotated's Feed tab in a second window (opened at 0:07) and moved it to the annotation without bringing
  that window forward. Our pages now open in the window you are in (the panel's tab's window): a tab of ours there
  is reused, one showing the very page elsewhere is switched to with its window brought forward, and otherwise a
  new tab opens in this window. `openFull` prefers a website tab in this window too. The examples' planes start no
  higher than 190 and at a smaller scale, since at 420 the steep drop was twice its card's size. The headline's pen
  starts at once (0.56 s). "Open the feed as a full page" stops saying Opening as soon as the page has opened.
- **Paper in the interface** (2.33.18, `tests/paperdeco.py` part 5, David's ask to integrate it subtly). A dashed trail
  ending in a tiny dart under the Feed heading and "What else it does" (`PaperDeco.rule`); the main card on an
  annotation's page has its top right corner folded down (`.annBody .annCard::after`); a small dart glides across
  loading outlines (`pdGlide`, still with reduced motion); a dart rests on "No comments yet" (`PaperDeco.waiting`); the
  Published toast's tick is the mark (`Brand.mark`). A faint trail behind your own avatar was tried and dropped,
  since at full size it read as a stray line.
- **The recording of 2026-09-25 at 16:45** (`tests/walk1645.py`). A link in the account menu (About annotated) closes
  it. A clip card in Yours so far waits on a light placeholder, not black, and the clip's picture of frames is
  fetched as the home page opens, so the card shows its frame at once. Each example under "What else it does"
  arrives as a plane the first time it comes into view and unwraps as itself, like an annotation after Publish
  (`arrive` in `features.js`, David's ask), one at a time in page order; a key finishes them, and with the planes
  off they are simply there.
- **The UX audit of 2026-09-25** (`tests/audit_shots.py` takes the pictures, read-only against the live database;
  `tests/uxaudit4.py`). A saved post on a feed card keeps its own shape (`.cthumb.cwide img.top`, height auto,
  cut only at its foot), where a short wide one lost both sides; the stored picture was whole. The take on a feed
  card is 22 pixels, the largest words on it. For you no longer gives "New today" as a reason. The panel's tags wrap
  with padding, the selection is counted in words, a failed picture says "No picture this time." once. "Not found"
  on the website is drawn in the site's frame (`renderMissing` with `onAll`). In dark mode the bar under the home
  page's paper has light ink. "Save on this computer" only looked disabled because the audit shot it before the
  take was checked.

- Follow, For you and trending were tested signed out only. Following someone needs a second real account, which
  is now possible because sign-in is published. This is the last part of the product with no evidence behind it.
- **Sign in with X** (2.34.0, `tests/xsignin.py`). Every sign-in offers Continue with Google and Continue with X as equal
  buttons: the panel's account button opens a card of both (`Account.signIn()` with no provider waits for the choice),
  and every prompt uses `AnnotationPage.signInPrompt` / `twoWays`, whose `onSignIn` is handed 'google' or 'x'. The
  extension goes through `Backend.signIn(provider)` (Supabase provider `x`, the same launchWebAuthFlow and PKCE trip as
  Google, `roundTrip`); the website through `chooseSignIn` in `site.js` and `Backend.signIn({ provider })`. The account
  menu offers Connect X when the account has only Google (`Backend.ways`, `Backend.connectX` through `linkIdentity`),
  so one person keeps one account. Handles come from X's `user_name` (the profile trigger already read it). Only
  "Sign in with X" is used, which X's free tier allows; nothing is posted or read on anyone's behalf. It works only
  once David has made the X app and put its keys in Supabase (Authentication, Providers, X / Twitter (OAuth 2.0)), and
  Connect X only with Manual linking switched on (Authentication, Settings). Privacy and terms say Google or X.
- `ui.css` has many stacked override blocks from review rounds. Consolidating it is safe only with the full test
  suite and screenshots before and after.
- This Week in Startups clips (checked against the real feed on 2026-09-23). Apple's directory gives a
  `rss.podscribe.ai` tracking address that either answers 500 or hangs without answering, so `openStart` in
  `feedpod.js` gives each address but the last six seconds and then tries the one inside it
  (`traffic.megaphone.fm`), which answers 206. A clip takes about seven seconds to open for that reason.
  `tests/fp_unwrap.py` covers a tracker that hangs.
- Amazon Music never sets a page title, even on a fresh load, so the episode box opens empty and the person types
  the name. The show name does sit in the address as a slug if a guess is ever wanted. Checked in a real browser on
  2026-09-20.
- iHeartRadio works end to end. Its page title is the episode and show, the first search result is the right
  episode, and its audio serves byte ranges. Checked in a real browser on 2026-09-20.
- Buzzsprout works. Its earlier refusal was the HeadlessChrome user agent rather than byte ranges, which is why
  `fphosts.py` now sets `REAL_UA` from `tests/_env.py`.
- Demo: pick strong examples (Jason: "examples matter"), a meaningful paragraph, a good clip, a real podcast moment.
- **2.34.0, after watching the other entries** (recordings of 2026-09-28 at 21:38 and 22:04; backup tag
  `backup-2026-09-28-submitted` and `E:\claude_code\backups\annotated-backup-2026-09-28-submitted.zip`, the submitted
  version). David's direction: lean into the paper and planes, stay minimal, never blast the viewer. Added, each in its
  own quiet way (`tests/features234.py`, `tests/planes234.py`):
  the moment on a clip or podcast card's picture ("1:38:10–1:38:25", length in the tooltip, `.cdur`); the first reply by
  someone else as one line under a feed card (`firstReply` from `Cloud.list`, which now selects the comments' bodies and
  authors, `.creply`); folding an annotation's corner to keep it (`AnnotationPage.Folded`, localStorage
  `annotated-folded`, `.foldBtn` over the corner the card already had, a Folded filter in the feed with its count, the
  corner shown on folded feed cards); a tiny plane off any Copy link (`Fold.toss`); Watch the demo and "Free and open
  source. No ads." under the hero (`.heroTrust`); two pencil margin notes on the home page, wide screens with a mouse
  only (`.marginNote`, Newsreader italic with a drawn arrow; the try-it's goes once the paper is touched).
  **Paper everywhere there is a sheet** (David: the windows should read as paper, subtly): cards, rail cards, the
  annotation card, the panel's cards, menus and prompts share a faint grain (`--grain`, an SVG noise), a warm white
  (`--sheet-warm`), warm edges and wells (`--rule-warm`, `--well-warm`) and the shadow of a sheet lifted off the desk
  (`--lift`), fainter in dark mode, all in one block at the foot of `ui.css`.
  **More paper and more motion** (David: more planes, crumpled paper, more ways to fold, unfold and fly): drawings
  `swallow`, `stunt`, `lock`, `banking`, `creased` (a dart unfolded flat, its creases showing), `smoothed` (a crumpled
  page smoothed out) and `loose` (crumpled in a hurry, a corner still flat) in `PaperDeco.ART`, used by piles, corners,
  desks and empty lists; five more ways of opening in `fold.js` (drift, bounce, peel, tumble, float, ten in all, and any
  of them played backwards folds a plane); Publish folds in one of five styles and leaves by one of five routes
  (`Fold.FOLDS`, `Fold.ROUTES`: climb, loop, sweep, zip, glide), the annotation page opens one of seven ways, and the
  front page's examples draw from nine flights.
- **2.34.1, paper in the panel** (`tests/paper2341.py`, David: "even these windows need to look like paper", "slightly
  folded edges"). The quote is a strip with a torn bottom edge (a CSS mask), the take box a notecard with faint rules and
  a highlighter margin line, every sheet (feed and rail cards, the published card, the account menu, the take box) has
  the same small turned corner (`--corner`), the grain is a little stronger, and the panel header sits on grained paper.
  Drawings now show where they are seen: under the published card (`.pd-sent`), beside the feed's heading
  (`.pd-feedTop`), and in the desk margins from 1180 pixels, smaller below 1440. The try-it's margin note was removed at
  David's word; the install one stays. **/paper.html** (`paperpage.js`, not linked, noindex) shows every drawing (D1 to
  D17, press to redraw) and plays every opening (O1 to O10) and every fold and flight (F1 to F5, R1 to R5), numbered so
  David can name favourites.
- **2.35, every window a torn notebook sheet** (David's example of 2026-09-29, `tests/paper2341.py`). Each window's
  `::before` is the sheet, cut to a gentle tear by a mask of four tileable edges (`--tear-top/bot/left/right`, 7 pixels
  deep; none read as a plain box, deeper read as perforation), with baked grain and very soft wrinkles
  (`extension/paper/grain.png`, `wrinkle.png`, copied by `sync_website.py`; they were SVG filters rendered on every
  paint). Its `::after` is the shadow, the same mask blurred, never `filter: drop-shadow` on the window, which repainted
  the whole element. The larger sheets (feed cards, an annotation's card and its comments, the home page's sections)
  have binder holes in a 34 pixel margin. No outline inside a sheet, no crease. Paper is `#FEFCF8`, David's "1% whiter"
  after "a tiny bit more tan". Popups (account menu, Display settings, the claim form) keep `--sp: 0` and an opaque
  back, since their sheet overflowed the window. A captured post sits on the sheet as a taped print (`.xshot`: white
  border, tape, a slight tilt), because a screenshot edge against torn paper read as too sharp. A clone inside a plane
  carries no sheet (`.pl-copy::before/::after`). The header's `.scrolled` has hysteresis (on past 40, off under 8), since
  toggling at 24 changed the height and looped, which is why Publish was "not stable" in `undo.py`. Deleting crumples
  the card into a bin (`Fold.trash`, run beside the delete by `crumpleWhile`, the card put back if the delete fails).
  "Other things it does" is now **Features**.
- **Audit of 2026-09-29** (2.36.0). Security: a shared annotation's `source` goes through `Cloud.cleanSource` (no blob,
  poster, shot or media address from the row, a thumb only from `i.ytimg.com`, strings and numbers coerced), avatars
  only from Google, X or Supabase (`AVATAR_OK`), so nobody can put a tracking picture in everyone's feed, and one card
  that cannot be drawn is left out rather than breaking the feed. Migration 21: a comment's time must be finite and
  within 30 days (an '-infinity' broke an annotation's comments for every reader, and backdated rows skipped the
  comment pace), and Most talked about takes its title from a source's first annotation, so a third account cannot
  retitle it. Bugs: `Account.signIn` could wait forever when the card closed, the fold corner went missing with the
  sheet, a first reply that was only a photo showed empty, a menu opened on a card hid under the comments sheet (z 19).
  Performance: baked textures, clip previews' blob addresses given back on redraw (`previewBlobs`), the panel's Home
  asks for its list and rails together, a tab change refreshes the panel once (it was twice), `Folded` keeps a Set, and
  the page script stops sending empty selection updates. Not done: the session tokens stay in `chrome.storage.local`,
  as every extension keeps them. Whether Supabase links an X sign-in to an existing Google account by email was not
  checked.
- **A video in a post on X is clipped** (2.36.0, `tests/xvideo.py`; the recording of 2026-09-29 at 02:24 got a
  screenshot of the player). On a status page whose main post has a `<video>`, the panel opens the YouTube trimmer on it
  (`makeXVideo` in `sidepanel.js`, the `xv-*` messages and a second `ClipEngine` in `article.js`), with a switch between
  Clip the video and Quote the post (`PanelKit.modeSwitch` now takes its modes). The mode is decided once per post, when
  the video reports its length; words chosen with the Annotate button, or a live video, go to the post panel, and the
  Annotate button pressed while the trimmer is open switches to it. The record is `kind: 'video'` with `site: 'x'`, the
  post's `url`, `author`, `handle` and `text`, and no `videoId`, so its source bar reads X, it links to the post, and
  duplicates and "Same video" go by the post's address. The trimmer has no filmstrip, since X has no storyboard. A GIF
  on X plays an MP4 straight from video.twimg.com, which may not allow its frames to be read; that and the real x.com
  are not yet checked.
- **2.37.0, the UX pass and paper notes of 2026-09-29** (`tests/uxpass0929.py`; backup before it: tag
  `backup-2026-09-29-before-ux100` on 2.36.0 and `E:\claude_code\backups\annotated-backup-2026-09-29-before-ux100.zip`).
  The pass was scripted tours of every screen of the site (served locally, desktop light and dark and phone) and of the
  panel in every mode beside stand-in pages; the scripts live in the session's scratchpad (`ux2/`). At David's word the
  binder holes are gone from every window, with the margin they needed, the torn edges stay, and the paper has more
  grain (`paper/grain2.png`, fine light and dark speckle and a few fibres; `grain2-dark.png` is a quieter copy for
  dark mode). Cards in a list are separate sheets, 36 pixels apart, which is more than two sheets' reach, so both
  tears show between them. Fixes from the tours: the panel's Sign in has no Google mark, since it offers Google or X;
  the way back drops a site's name from a page title (`cleanTitle`); tag chips keep their own width and their label
  has room above it; Following signed out says one thing and, on the website, offers Google or X instead of the
  extension; a sign-in asked for with nothing beside it drops from the top right under the header on opaque paper
  (it floated at the foot of the window, see-through in dark mode); a post card with its screenshot names the post
  without quoting the words again; the podcast tab's button reads Capture clip; the brief's hint says "in the brief";
  the panel's Home intro is one plainer sentence. Two things the tours showed were test artifacts, not bugs: a panel
  whose window went to the back in headless Edge stops refreshing, and a persistent context starts with its own blank
  tab, so a panel pinned by "the about:blank tab" watched the wrong one.
  Then five subtle paper touches David chose, all in one block at the foot of `ui.css`, varied by a sheet's place among
  its siblings (a feed card by its list item) so a page looks the same every time: tears that start at a different
  point of the torn pattern on each sheet (`--tx`, `--tx2`, `--ty`, `--ty2` in the masks, where every sheet repeated one
  tear); a tilt of at most a quarter degree on feed cards (`rotate`, none on a phone); a faint warm or cool wash on
  some sheets (`--sheet-shade`); one corner lifting on about one sheet in three (`--lift-at`, a little light on the
  paper there and the shadow layer moved a few pixels toward it, `--ldx`, `--ldy`); and a barely warm tone just inside
  the tear (`--age`, `--age-edge`, darker rather than warmer in dark mode). Popups stay plain. The dark mode shadow
  between sheets is lighter (`--sheet-shadow` .32), since it read as a black bar.
  Then five more: a thin light fringe of fibres just inside every tear (`--fray-*`, each tear's torn line stroked, made
  from the tear shapes by a scratchpad script, the mask cutting away the outer half); the highlighter multiplying into
  the paper on our own pages in light mode (`mix-blend-mode: multiply` on `.pq mark`, `.cqInk`, the try-it's and the
  scenes' marks; pages elsewhere untouched); a feed card rising 2 pixels under the pointer, its shadow softer and lower;
  one more sheet under an annotation's card (`.underSheet`, a few pixels off and turned 0.9 degrees, hidden in a
  plane); and one light, every shadow falling straight down, the drawings' shadows taken out of the turned drawing and
  laid flat under it (`at` in `paperdeco.js`).
  And two more: the paper's thickness, a darker hairline of the sheet's side along its bottom tear with the light
  fibre line 1.5 pixels above it (`--edge-bot`); and replies on slips, every comment a small torn slip on the comments
  sheet, a touch whiter (`--slip-paper`), with its own soft shadow and a tilt of a third of a degree either way, where
  comments were rows ruled apart (`.comments li.cmt::before`, `::after`; flat on a phone). The main dart in
  `paperdeco.js` now goes through `at` too, so its shadow stays flat like the others.
  After David looked at it in the pane: the grain is a third lighter again; the folded corner no longer sits on every
  annotation's card, showing only while the card is pointed at or focused, and once folded; the line between sheets
  is finer (the thickness edge at .13, 1.6 pixels) and the shadow lighter and softer (`--sheet-shadow` .10, blur 4).
  The try-it's brief and the other three tabs are torn sheets too (at the foot of `web.css`, keeping the light paper
  in dark mode as their ink needs; the dotted paper and the curl, `.tiCurl`, are gone). So are "This annotation" and
  "Your annotations" in the panel beside an annotation's page (`.annside > .sideNow`, `.annside > .sideList`). The
  full pages' margins show only planes (`desk` in `paperdeco.js`), where the right one could be a folded-open sheet.
  A sheet's side tears paint only between its top and bottom tears (`mask-clip: content-box` with the sheet layer
  padded 9 and 7 pixels), since at each corner the side tear filled back in paper the top tear had torn away, which
  showed as light specks on a dark page.
  2.37.1: no drawing twice on one page. Every drawing made by `PaperDeco.make` carries its kind (`data-pd-kind`), and
  the Feed heading's plane and the margins pick with `PaperDeco.free`, which leaves out kinds already shown; the
  same banking plane had sat beside the heading and in the margin.
- **The transcript beside a YouTube clip** (2.38.0, `tests/transcript.py`; David's idea from the recording of 2026-09-29
  at 06:35, where the panel sat empty under Capture clip while he looked for the moment). `content.js` reads YouTube's
  own transcript: it opens the page's Show transcript panel out of sight (expanding the description if the button is
  inside it), reads `transcript-segment-view-model` or `ytd-transcript-segment-renderer` rows by their leaf texts (the
  m:ss stamp, the "3 seconds" accessibility label dropped, the rest the line), sets the panel back to hidden unless the
  person had it open, and keeps the lines per video id. Rows a previous video left are marked first so only new ones are
  read. Downloading the captions directly needs a token YouTube does not give out, which is why it reads the page.
  `videopanel.js` draws them in `.vTrans`, a paper sheet under Capture clip, every word with `textContent`: the line
  being spoken marked and followed (wheel, touch or the scrollbar stop following, Back to now resumes), the clip's lines
  in highlighter, a click on a line seeks there, a selection across lines becomes the clip (3 to 90 seconds, said in
  `.rMoved`), Find words marks and counts matches (Enter for the next, "Not said in this video"). Captured, the sheet
  folds to its heading and the clip's words go with the result (`transcript`, at most 1,500 characters, kept by
  `cleanSource`), shown under the clip on its page as "What's said in the clip" (`.clipWords`). YouTube only; a video
  without a transcript shows no sheet. Checked against a stand-in page built like YouTube's, and the reading was tried
  on the real YouTube in the browser pane on 2026-09-29; the whole flow has not yet been run on real YouTube in Chrome.
- **Play with sound plays the card's own video** (2.38.0, `tests/playinplace.py`; David's recording of 2026-09-29 at
  07:05). It opened a second player of the same clip under the card while the silent preview went on above it. Now the
  preview itself unmutes, stops looping, gets its controls and starts from the clip's beginning (`data-sound`,
  `.cthumb.sounding`, shown even with reduced motion); the preview observer leaves it alone except to pause it out of
  sight; a press on its controls does not open the annotation; Play with sound on another card quiets it again. A
  podcast card, which has no picture to play in, keeps its player under the card.
- **Audit of 2026-09-29, after 2.38.0** (2.38.1; three reviews, bugs, security and performance, each finding checked
  in the code before fixing). Bugs: a transcript reading is per video (`transcriptBusy` a Map) and kept only if the page
  still shows that video, and rows are told apart by their words rather than marked, since YouTube may reuse them (a
  quick move to another video drew the first video's lines under the second, and published them with its clip); no
  transcript yet is asked again three times (`trTries`); a post's panel is keyed by the post up to `/status/<id>`, so
  X's `/video/1` view keeps the clip and the take; a post panel up four seconds, or used with the Annotate button, is
  settled (`p.born`), where the trimmer took over the moment the video reported its length; a clip panel survives a
  moment the post's video cannot be found; a GIF whose frames cannot be read (`blocked` from a 1 by 1 draw, unknown
  until it has a frame) is quoted as a post, and a trimmer the panel chose is switched back when that turns out
  (`autoMode`); only the post's own video counts, not one in a post it quotes (`ownVideo`); a panel dropped mid capture
  stops it on the page, and a panel takes `capture-done` only while it is capturing; lines chosen at the very end
  still make three seconds; the transcript list scrolls by its own measure; a failed delete gives its button back;
  the silent preview no longer restarts a video playing with sound. Security: profile pictures only from Google, X or
  annotated's own storage (`AVATAR_OK` pinned to this project, `Cloud.avatarOk` on every path, the website's profile
  header too); `shotThumb` is dropped from shared rows; a clip of a video on X links only to a post on X (`xPost`); the
  Back path opens a source only if it is http(s); migration 22 makes an empty videoId count as none in Most talked
  about, where every X clip shared one key and the first one's title and link. Performance: the small grain
  (`--grain`) is baked from its SVG filter into 64 colour PNGs at twice the size (`paper/grain-l.png`, `grain-d.png`,
  `image-set` 2x), measured at about one level in 255 from the filter; the transcript list is built in a fragment and
  its line found by binary search; the hover lift no longer animates a blur that a stronger rule held still; the page
  underneath lost a drop shadow its own mask cut away. Tried and taken out: `content-visibility` on feed cards, since
  cards not yet drawn are guessed at a height and the page's length and scroll positions shifted. Not done: a stall
  watchdog in the capture engine, expanding the `:is()` paper rules (their specificity is an id's), removing the
  overridden paper blocks from `ui.css`, and podcast artwork and page images still load from any host, as og images do.
- **Second pass of the audit of 2026-09-29** (2.38.1, with the first). Security: the panel checks its floating key
  whenever it is inside any frame (`FRAMED`), since a site framing `sidepanel.html` without `embed=float` got the whole
  signed-in panel with every button live (`tests/uxpass0929.py` part 15 frames it from another site). Migration 23:
  comments carry `inserted_at`, always the database's time, and the twenty a minute counts that, since backdated
  comments walked around it; past ten claims an hour on one annotation a claim is kept and marked `throttled` rather
  than refused, so an author cannot keep real claims out with junk (the thirty a minute across the site still
  refuses). Regressions the first pass made: the stale-transcript check ran before a last read that overwrote it, and
  rows unchanged by the click are now never used (a panel YouTube left open shows another video's rows, and they cannot
  be told apart; a missing transcript is better than another video's words); a reading for a video the page has left
  stops at once; no button answers null (asked again), a button with no rows answers an empty list (not asked again);
  a panel takes `capture-error` only while capturing; a post panel is settled as a post by any press or typing in it,
  not after four seconds, so a slow video still turns into the trimmer; a GIF is not offered Clip the video
  (`blocked` in `p-info`); a clip made on mobile.x.com or www.x.com still links to its post. Performance: a click on a
  page with nothing marked does no document-wide search (`liveMarks`); the post on X is read once per 300 ms, not twice
  per look; the trimmer writes its words only when they change (`setText`); the comment clock moves only the times,
  where it rebuilt every comment every thirty seconds and closed an open reaction picker; the podcast example loads
  only what plays (`preload = 'metadata'`); the website's scripts, styles and paper keep a day (`_headers`, listed by
  name). Not done: two accounts can still put a link in Most talked about (needs a higher bar or an account age),
  Trending has no bar, the podcast fetches check a redirect after following it, the session is readable by content
  scripts (`setAccessLevel` would need `article.js` and `float.js` moved behind the background), the email sits in our
  own site's page for `login_hint`, polls are not checked against their options in the database, the annotation limit
  resets on delete, and whether X ever wraps a post's own video in a `role="link"` (which `ownVideo` would skip) was
  not checked on the real site.
- **Third pass of the audit of 2026-09-29** (2.38.1, with the first two). Publishing: one publish at a time in each
  panel (`publishing`, `tests/publish2x.py`; a double press made two annotations); an id already in the database and
  yours counts as published (a publish that timed out and landed, or whose answer was lost, failed on the key when
  tried again); a refused insert takes back the files it had uploaded; Undo and Delete of an annotation not marked
  shared still take down a copy that landed late; reactions, votes and edits the database refuses now say so on the
  annotation page and the website (`must` in `cloud.js`), where they looked saved, and an edit goes online before this
  computer's copy changes; `Store.update` reads and writes in one transaction (two at once could undo the late
  "shared" mark), and a write the browser aborts (a full disk) fails rather than hanging Publish; the microphone
  cannot be left on by a double press on Record or a panel dropped while permission is asked; a published take is not
  offered back as a draft; local comments carried over go in groups of fifteen a minute, under the comment limit.
  Transcript: whose rows are in YouTube's panel is known from YouTube's own `yt-navigate-start`, which records the
  leaving video's rows (`staleSig`); rows unlike those that fit the video (first under two minutes, last within its
  length) are used, including a transcript the person opened themselves or rows that came late, and the request names
  its video (`v`), answered with nothing by a page that has moved on. Selecting words in a post settles it as a post.
  Migration 23 now also gives existing comments their own times. Website: a saved row holding something that is not a
  card is skipped, and one card that cannot be drawn no longer takes Features, the install steps and the foot with it;
  an address with a broken escape shows Not found; a moment playing from Yours so far stops when the row is redrawn;
  Undo puts back only what was removed, keeping cards made meanwhile in another tab; the name from the extension is
  written as text; switching browser tabs just before the example plays no longer loses it for the visit. Not done:
  planes waiting on a delay are not finished by a click, the front page loads `annotation-page.js`, `panel-kit.js`
  and `cloud.js` though only Sign in uses them, the example media is fetched early on purpose, and `annotation.js` and
  `feed.js` have no guard against an older load drawing over a newer one.
- **Fourth pass of the audit of 2026-09-29** (2.38.1, with the first three). Capture: a capture ends when the video under
  it changes (the player's source, the element, or a jump back before the start; YouTube reuses one player and fires no
  seek, so a capture ran on through the next video, possibly past Chrome's 64 MB message limit) and when nothing moves
  for thirty seconds, video, audio and a tab's playing range alike (`tests/transcript.py` part 9). Podcasts from a
  feed: an episode opened, or a search answered, after a newer one is dropped (`pickGen`; a slow probe put episode A's
  file under episode B's name); Cancel stops the clip's download, which also has a time limit (the finder's controls
  had no abort); the finder's player stops and lets go when its panel goes; a server that ignores byte ranges is
  refused before its whole file is downloaded; the request past a large cover image has the same limit and checks as
  the first; `publicAddress` drops trailing dots ("localhost." is loopback); tab audio says Capture cancelled when
  cancelled mid start, gives back the tab if the recorder cannot start, and stops after the clip's length and half a
  minute. Shell: the toolbar button opens the float directly, and the other ways in wait for the saved display
  setting, since a worker woken from sleep chose the side panel; Clip a podcast by name belongs to the site it was
  asked on (`feedAsked` a Map), where it stayed on the tab for good; a panel answers only its own window's tabs, and a
  tab moved to another window lets its panel go; the feed and annotation pages ignore a load a newer one has
  overtaken (`loadGen`); an annotation opened from the page's own rail offers Back; the floating panel's listener goes
  with it and closed tabs' keys are cleared; room is made before a capture is kept; a handle change that saved nothing
  says so, and the account menu closes when someone else signs in. The third pass's regressions: a publish landing
  after its annotation was undone is taken down; files are removed after a refused insert only when no annotation with
  that id is live; a video with no transcript button, asked three times, is not asked again; a transcript may start up
  to ten minutes in; many carried-over comments wait only for the first group; a reaction already there counts as
  saved; Undo and Delete of an offline annotation do not wait on the network. Not done: the recording is still sent to
  every extension page as a data address, the whole-file waveform can use a lot of memory on a long non-MP3 episode,
  part of a podcast waveform can stay blank until the trimmer moves, a GIF is made in one long stretch, the panel page
  can be used to tell annotated is installed (`use_dynamic_url` would stop it but needs the tests changed), and whether
  the float opens on the first click after a pause was not checked in a real browser.
- **Fifth pass of the audit of 2026-09-29** (2.38.1, with the first four). The fourth pass's wait for the saved display
  setting lost Chrome's user gesture, so after the worker slept the side panel could not open from the right-click item,
  the shortcut or the Annotate button: it now opens at once and gives way to the float if the setting is floating, and
  the toolbar button in side mode opens the panel. A pause the person makes, or X pausing a post scrolled away, is no
  longer a stall (the clock runs only while playing, tab audio's limit counts playing time); a mid-roll ad gives its own
  message. The finder is let go of on another site only when it holds no episode (`busy`). A transcript button with no
  rows that are this video's is pressed twice at most; `fits` reads the player's own video. Selection: sentence ends
  looked at the whole text before every full stop, which froze a tab on a long plain page (a book, a big file;
  `ABBR` now tests only the eight characters before it, and a 20,000 sentence page answers in milliseconds); any
  editable area is left alone (`isContentEditable`, where only `contenteditable="true"` was); a page that swaps in a
  new body keeps the Annotate button; an Annotate press nobody answered lets go after eight seconds; Escape clears the
  page's selection only when annotated has something on the page; a passage with nothing drawable says so. Take and
  comment boxes: pasted text stays text (Word and Sheets put a picture of it on the clipboard too); a take box that has
  gone stops watching the page. The emoji picker reads the skin tone once in a while, not per emoji, and escapes what it
  draws. A comment reaction the database refuses says so. The floating panel says its height only when it changes.
  Website: a profile or annotation the database could not read says "This did not load" with Try again, where it said
  it did not exist (`didNotLoad`; `Cloud.get` now throws on an error, since the client already retries for seconds). The
  link-preview edge function asks the database while the page is fetched, gives up after 1.5 s, survives a broken
  escape and drops the static file's validators. Tests: `tests/uxpass0929.py` parts 18 to 21. Not done: marking and
  unmarking still merge text nodes the page made (`normalize`, a risk on React pages), `findText` can miss a quote
  across a paragraph break on X, a comment's own files stay after its annotation is deleted, any handle can be put in
  front of an annotation's id in a link, and the pen style of an older copy stays in a long-lived tab.
- **Sixth pass of the audit of 2026-09-29** (2.38.1, with the first five). Database (migration 24, applied live): an
  annotation's author may change only its take and tag, and a profile only its handle, where row level security let an
  author rewrite an annotation's source and files after it was listed; TRUNCATE, REFERENCES and TRIGGER are taken from
  anon and authenticated; the old comment pace index and a second updated_at trigger are dropped; a reaction may hold no
  letters of any alphabet (it refused only Latin ones; checked against thirteen emoji, keycaps, flags and skin tones
  included); a vote must be for one of the poll's options. The fifth pass's regressions: Try again sits in the message
  and cannot be pressed twice; `contenteditable="false"` text can be annotated again (`isContentEditable` alone decides);
  on Chrome before 141, which has no `sidePanel.close`, the side panel opened for a sleeping worker is turned off and on
  so it does not stay beside the float; a page that stalls ends a tab-audio recording too, and a recording's own timer
  cancels only itself; a second tone press in the emoji picker shows the new tone; an earlier Annotate press's timer
  no longer cuts a later one short; the finder on another site is kept only while a clip is being cut. Tests:
  `tests/uxpass0929.py` parts 19 and 20. Not done: a player that pauses itself mid capture (YouTube's "Continue
  watching?") still waits rather than counting as a stall, `Cloud.gone` asks for every id in one request, and
  `Cloud.list` reads every comment's words to find the first reply.
- **Seventh pass of the audit of 2026-09-29** (2.38.1, with the first six). Link previews: every shared annotation link
  showed the home page's card since 2026-09-23, because the edge function replaced a fixed `<title>annotated</title>`
  and the page's title had changed; it now replaces any title and drops the page's own card tags
  (`tests/previewcard.py` runs the function in Node against the real `index.html`; checked on the live site before
  the fix). Website (`tests/audit7web.py`): the front page reads who is signed in from the stored session, where
  `getSession` first refreshed a token near its end over the network and held the page on its outline while the auth
  server was slow; a feed or profile tab come back into view keeps its list when the read fails and leaves the page
  where the reader has scrolled; an annotation's counts and rails, and a profile's, are asked for with it; the reading
  scripts download together and run in order; the clip frames are fetched only by the front page; the try-it places
  its card once a frame on scroll. Extension (`tests/audit7ext.py`): Play selection stopped before its seek landed left
  a listener that played the video and then paused it at the range's end for good, and a capture crossing that point
  sat on Recording; the extension's annotation page says "This did not load" with Try again when the read fails;
  a feed page in a hidden tab reads its list once when looked at, not on every reaction; Most talked about is asked
  once however many boxes draw it, and not for boxes out of sight; an MP3 header's frame count may not make an
  episode more than four times longer than its bytes (a wild one sized the waveform to days). Also fixed, without a
  test of their own: a Home or profile draw overtaken by a newer one (a sign-in or sign-out) is dropped
  (`browseGen`); the front tab is checked again after the picture is taken; a floating panel answers Annotate only
  from its own tab; the thumbnail backfill writes only the thumbnail inside one transaction; a video id is escaped
  in a selector; floating turned off while the frame is being made leaves nothing; a clip's local `blob:` address is
  not published as its source (two live rows already hold one, which nothing reads). Found by the full run: the fifth
  pass's reattached Annotate button came back after a newer copy of the page script had removed it, so a page held
  two (`ghostbtn`); only a button whose body was swapped away (it still has a parent) comes back now. The second
  pass's skip of the highlight wipe when no marks were counted is undone. `snappref` read the grown quote after a
  fixed 2.5 s and failed about one run in five even on 2.38.0; it now waits for it. `handlesave` and `walk23` had
  stand-ins older than the fourth pass (an update answered with no row, `feedAsked` as a Set). `explore0926`'s plane
  limit is 250, since one of its random flights measures 243. Not done: a comment's files after its annotation is
  deleted, and a player that pauses itself mid capture still waits.
- **In Chrome on the home page** (2.38.2, `tests/inchrome.py`). Compared with the other entries on 2026-09-29, nothing on
  the home page showed the panel the brief asks for. A section under Yours so far (`inChrome` in `landing.js`,
  `.landChrome` in `web.css`) plays 0:03 to 0:30 of the submitted demo (`media/panel-demo.mp4`, cut from
  `C:\Users\dswin\Videos\annotated-demo-4.mp4`, 1280 wide, no sound, 617 KB; still `panel-demo.jpg` from 0:16), muted and
  looping while at least a third of it is on screen, fetched only then, with its controls and no autoplay under
  reduced motion. The recording carries Chrome's own address bar and David's captions, so the frame adds none.
- **2.38.3** (`tests/fullslip.py`, `tests/inchrome.py` part 5). "Open the feed as a full page" and "Open your profile as
  a full page" under the panel's lists are torn slips like a reply (`.fullRow .fullBtn` at the foot of `ui.css`), where
  they were the one plain outlined box left. The home page's try-it is as tall as the tab shown and grows, never shrinks,
  when a taller one is chosen (`pick` in `landing.js`), and the hero's bottom padding is 16: holding the tallest tab
  from the start left about 55 pixels of empty paper, and the next section now starts about 100 pixels higher, on the
  first screen of a laptop. Backup before the paper planes pass: `E:\claude_code\backups\annotated-backup-2026-09-29-before-planes.zip`
  and the tag `backup-2026-09-29-before-planes`.
- **2.38.4, the paper planes redrawn and chosen** (`tests/planevary.py`; backup before it is the tag
  `backup-2026-09-29-before-planes` and its zip). David: improve the planes' look, add variations, never the same one twice
  on a page, and not always the same asset. Every plane is now a set of facets drawn by `craft` in `paperdeco.js`, hand
  drawn like the sheets (edges bowed, not ruled), each facet shaded from its lit edge (`TONE`, and `--pd-deep` for a
  keel's far side), a lit line along each fold, a soft blurred shadow, and a few lines of the page on the widest wing,
  sometimes highlighted. Twelve planes (`DEF`, `SHAPES`): dart, glider, swallow, stunt, nose-lock, banking and landed as
  before, and new, a needle, a hammerhead, one seen from above, one head on, and a pair flying together. Each drawn plane
  carries `data-pd-shape`. `PaperDeco.choose` leaves out a plane already on the page or drawn in the last two seconds and
  not yet placed, leaves out the last six this browser showed while two others remain, and weights the rest by how long
  ago they were shown (`annotated-pd-seen` in localStorage, the last 24). The margins (`lone`), the Feed heading
  (`heading`), piles and the panel's corner (`fleetAt`) all go through it; a named plane (`swallow`, say) draws itself
  unless it is on the page already. The same swallow had sat top right and bottom left of the feed because "lone" drew
  from the same planes as the named kinds while `free` compared only kind names. /paper.html draws every plane as named
  (`PaperDeco.exact`), D1 to D12 now planes. Over 20 feed visits the right margin showed 10 or 11 different planes and
  never one twice running.
- **The recording of 2026-09-29 at 16:31, sharp bouncing** (2.38.4, `tests/nobounce.py`). On the home page, Annotate
  opened the take box and everything below jumped 200 pixels in one frame (2.38.3 had taken away the 55 spare pixels
  that used to soften it), and Make the annotation hid Yours so far and brought it back two seconds later, the card's
  landing and the try-it's reset each another jump. `smooth(el, inner)` in `landing.js`: `inner` keeps its own height and
  `el` eases to it over half a second (`cubic-bezier(.4, 0, .2, 1)`), clipped while it moves with a 28 pixel margin for
  the paper's shadows. A ResizeObserver on `inner` starts the move in the frame of the change, before paint (waiting a
  frame painted the new size once first); a move under way continues from its current height; margins, top padding and
  rule slide with it (`EDGE`), carried across a restart. The try-it sits in `.heroTryBox` (made in `hero`), Yours so far's
  contents in `.llIn`, and Yours so far folds away and back (`ease.fold`) instead of `hidden`. Nothing moves with reduced
  motion. The test reads In Chrome's top every frame and counts a move over 40 pixels between frames under 40 ms apart
  that stays; the old code gave 202 and 378, the new none, planes off or on. Headless Edge, drawing with a software GPU,
  can still stall about 200 ms while the textured paper moves (a 199 ms GPU task in a trace); a real GPU is expected to be
  far quicker, not measured.
- **2.38.5.** The In Chrome demo on the home page is a print taped into the notebook like a captured post (`.lcPrint`
  in a tilted `.lcFrame` with two strips of tape and the caption "From the demo, recorded in Chrome." written under it),
  where it was a screen box with rounded corners (David, 2026-09-29).
- **2.38.6, planes that only looked different** (`tests/planevary.py` counts by family). David saw two alike on the feed:
  a dart beside a banking plane, which is the dart turned. `FAMILY` in `paperdeco.js` makes the dart, banking, landed and
  nose-lock one family and the glider and needle another, and `choose`, `named`, piles and corners never show two of a
  family on a page (a pile draws a crumpled ball when every family is out). The old code did so on 10 of 20 feed visits.
  Plane facets are straight now: bowed one by one they left a notch where two folds met, the "fold artifact". The
  nose-lock's folded tip lies on the wing, where it floated ahead of it, and the landed plane's shadow is under it.
- **2.38.7, drawings answer the pointer** (`tests/pdhover.py`; backup before it is the tag `backup-2026-09-29-before-hover`
  and `E:\claude_code\backups\annotated-backup-2026-09-29-before-hover.zip`). David asked for a very subtle, cool hover on
  the planes and paper. Every piece `at` draws is a `.pdPiece` (`pdIsPlane`, `pdIsPaper` or `pdIsBall`) holding its drawing
  in `.pdLift` and its shadow in `.pdFlat`, so a pile's pieces answer one by one. With the pointer over it a plane lifts
  5 pixels, noses up 4 degrees and edges forward with a small spring (`cubic-bezier(.34, 1.45, .64, 1)`), its shadow
  staying on the desk, shrinking and fading; a sheet lifts a hair and turns; a ball rolls a little. The margins lie under
  the page's full-width grid, which takes the pointer first, so paperdeco.js marks the piece under the pointer itself
  (`pdOn`, one listener, once a frame) and the drawings never take the pointer. Mouse only, nothing with reduced motion,
  and not the home page's foot plane, which has its own hover.
  Each spot (the Feed heading, the left and right margins) also remembers its last plane (`annotated-pd-at-<spot>` in
  localStorage) and never shows its family twice running; the page-wide memory alone let the heading repeat, its last
  plane six or more places back once the margins and piles had been drawn.
- **Eighth pass of the audit of 2026-09-29** (2.38.8, `tests/audit8.py`; two reviews, one of 2.38.2 to 2.38.7, one of the
  extension files the earlier passes touched least, and the database advisors, which list only what is known and meant).
  Extension: signing out offline (an expired token, no network) returned the library's error and kept the session in
  storage, so it came back once online, on a shared computer as the last person; the session is now removed and
  listeners told (`signOut` in `backend.js`). `Backend.onChange` is one subscription for every listener with one profile
  read per change (each listener subscribed and read on its own, two reads per open panel whenever a page of ours
  opened), and a profile read that fails keeps the last good answer instead of reporting no handle. No capture while a
  publish is on its way (`publishing` in `grab` and `captureNow`; it paired the take with other words). A publish's plane
  and "Publishing…" line belong to their own tab's panel (`flights` keyed by `rootOf` in `panel-kit.js`; publishing in
  two tabs mixed them, and the line stayed over the other tab), hidden while that panel is. A preference is announced
  once, not again on the storage echo (`prefs.js`). A floating panel the page removed is made again. The small floating
  button lets go on `pointercancel` and has `touch-action: none`. The floating panel measures its height at most once a
  frame. Save as GIF gives up after ten seconds on a clip that never answers (`once` in `gifmaker.js`).
  Home page: a slide under way is retargeted, not restarted (no forced layout and no restart from rest every frame while
  something grows); Clear all brings the edges back with Yours so far (they stayed at nothing and snapped 67 px); a
  region takes its first size as it is, so nothing slides open on load (the try-it slid from its empty tabs, Yours so far
  ended 23 px short and snapped); the try-it's held height leaves out a flight's hold and an open take box, and a real
  resize lets it go; the demo is fetched and played only once a third of it is in sight (the observer also reports the
  first pixel). Drawings: a lit piece keeps 8 pixels of room (lifting pulled its edge in and it flickered), the hover
  keeps a live list and does nothing without drawings, and leaving the window is noticed (`mouseout` with no
  `relatedTarget`). Not tested: the per-panel flights (the planes are off in tests) and the capture guard.
- **Ninth pass of the audit of 2026-09-29** (2.38.9, `tests/audit9.py`; reviews of the panel shell and pages, and of the data
  layer, website and migrations). Database (migration 25, applied live): a trending row takes its title and kind from the
  source's first annotation (one account could retitle a row others built with a title that sorts first), an empty
  videoId is no key, every profile has a handle, and a few names are kept for annotated (`handle_reserved`: annotated,
  admin, support and the like; new accounts step past them, and the account menu says "That handle is kept for
  annotated."). Comments, reactions and votes the database did not take are taken back: the hooks in `annotation.js` and
  `site.js` answer false (signed out, a limit, the network), the page removes the reply and puts its words and GIF back in
  the box, `EmojiKit.reactions` restores its chips and the poll its counts; signed out, a reply showed as yours and was lost
  on the way to sign in. A deleted comment leaves the database only when its six-second Undo has gone (or the page
  closes), and a delete made while it was still posting waits for it (`adding`); Undo re-posted it without its photo.
  Comments are told apart by a key of their own (`keyOf`), not their millisecond. Carried-over comments keep GIFs and
  photos, and at most eight reactions go (a ninth refused them all). A tag page asks the database for the tag; a profile's
  count and Delete all cover all of them (`Cloud.countBy`, a head count; Delete all reads again until none are left); your
  count beside someone else's annotation is counted, not downloaded; For you, Following and Everyone draw from the list
  already read on the website, the panel and the extension's feed page; a feed keeps its filter and sort when drawn again
  (`feedChoice`); the claim form holds 200, 320 and 2000 characters. Panel: the way back beside the feed follows the tab
  you were last reading (`annKey` carries `lastSourceTab`); a slow profile or count read no longer draws the annotation
  card beside another tab; View page opens that annotation (the tab publishing opened may show another); a page that fails
  to open after publishing is not a failed publish; `openExtPage` matches `pendingUrl` (two quick presses opened two
  tabs); Clip a podcast by name asked on a blank tab lets go on the first site reached; a finder behind another tab's
  panel stops following and pauses its preview; a list is drawn again when your handle changes (`sigExtra`). The
  extension's annotation and feed pages wait three seconds at most for who you are, and the annotation page three for its
  rail; a kept annotation showed nothing for over fourteen seconds with the network failing and the token expired, and now
  shows in about six. Not done: `Cloud.list` still reads every comment's words to find the first reply (a leaner select
  could change which reply is shown, not checked), and the second annotation page asks who you are before its rail.
- **Tenth pass of the audit of 2026-09-29, and the recording of 2026-09-29 at 20:27** (2.38.9 with the ninth,
  `tests/audit10.py`). A regression review of the eighth and ninth passes: a rollback checks it is still the same drawing
  of the page (`current()`, `__annGen`; annotations share one container, so `isConnected` always passed and a failed reply
  was drawn into the next annotation opened); a deleted comment is sent once (a `done` flag, the timer cleared, one
  `pagehide` listener for the page) and one already gone with its annotation counts as deleted; Undo of a delete on an
  annotation kept here is saved (`restored`); a late answer to who you are never redraws over a box in use or an open
  question, and a failed read is not signing out (`FAILED`); a rail that arrives after its three seconds is drawn then; a
  publish whose panel went cleans up its line; a reaction or vote is taken back only if nothing newer came since
  (`changeGen`, `pollGen`), and a hook that throws counts as not saved; a sign-out elsewhere reaches every page
  (`chrome.storage.onChanged` on `annotated-auth`); a failed list is not kept for tab presses, and Delete all stops and
  says so if it cannot check again; a carried-over reply's photo has a minute and a name of its own; opening Home beside
  the podcast finder does not pause its preview; a phone's address bar is not a resize. The capture pipeline: a podcast
  clip is cut from the episode it was asked of (another chosen meanwhile cancels it; it was published under the new
  episode's name with the old one's sound); Cancel reaches a capture still checking whether it may copy the page's audio;
  the page's own player changing episode ends an audio capture, as it does for video; an earlier capture's checks stop
  once a newer capture begins (`doneGen`); only this video's filmstrip is used; a video's frame is drawn once per plane,
  not once per piece (`frames` in `fold.js`), and copies of media never load; the Annotate button measures the end of the
  last line only when neither margin is free; Show me an example pressed twice runs once; Play selection pressed again
  leaves one waiting listener. From the recording: the In Chrome demo lies on a torn sheet (`.lcSheet.paperSheet`); the
  plane to Yours so far aims only once the page has stopped moving (`settled` in `planes.js`; the tab resets while the
  plane folds, where it reset during the flight and the page below moved up, so the plane unfolded where the card had
  been and the card slid up to it; this was not reproduced in headless Edge, whose test shows no movement either way); the
  heavy sheets below the hero have compositor layers while things ease (`will-change: transform`), and the Features
  example in use sits above its neighbours. Not done: the capture-pipeline races have no test of their own.
- **Eleventh pass of the audit of 2026-09-29** (2.39.0, `tests/audit11.py`, migration 26 applied live). Security: a page's
  canonical address is kept only on its own site (`sameSite` in `article-core.js`), since a page could credit its words
  to another outlet; words a page hides inside a passage (not drawn, or transparent) are left out of the quote
  (`hiddenIn`); a shared poll is read as a question and options only (`cleanPoll`), since a row could carry counts of its
  own making; a post links only to a post on X (`srcUrlOf` through `xPost`); only an annotation's author may date a
  comment in the past (carrying replies over), and a new account named like a reserved handle is shown as Reader
  (migration 26, checked live in a rolled-back block). Performance: `Cloud.list` asks for every reply's author but the
  words of only the first six (`first:comments` with `first.limit=6`, checked against the live API). Bugs: a refused
  reaction goes back alone, even after another was pressed (`gens`, `undoOne` in `emojikit.js`); the emoji suggestion
  list is on the page only while shown and fills in only while the caret is still on its word; a take box reset while
  the microphone or a file check was answering drops what comes (`recGen`), a recording that ends stops its timer, and
  the take box lets go of the page's observer; a file dropped just beside the take box does not replace the panel; a
  handle saved while the menu closed or the account changed does not throw, and every page learns it
  (`Backend.refreshWho`, `annotatedWho`); a database connection the browser closed is opened again (`store.js`); a draft
  and a kept capture belong to their tab. Not done: a same-id annotation deleted and published again is not refused
  (a tombstone), and `sidepanel.html` opened as a tab of its own is not refused, since the tests drive the panel that way.
- **Twelfth pass of the audit of 2026-09-29** (2.39.0, `tests/audit12.py`, migration 27 applied live). Security: a card
  names the host its link goes to when the site name does not belong to it (`siteLabel`, "The New York Times ·
  evil.example"), since a row or a page's own og:site_name could put one outlet's name over another's link; a post's link
  is parsed and only the post's own address on X is kept (`xPost`; a status path followed by ../ reached other x.com
  pages); a display name or handle that holds "annotated", or is a reserved word, look-alike Cyrillic and Greek letters
  read as Latin, is refused (`name_reserved`; accounts are named Reader, handles step past; none existed). Bugs: a late
  rail or profile answer draws the annotation page again only when no plane is arriving and no box is in use, and keeps
  the reader's place (`lateLoad`); the panel's Home forgets the list it keeps for tab presses when annotations, follows
  or the account change; a comment deleted on an annotation kept only here is saved at once; your counts on the website
  are counted (`countBy`), not a capped list's length; a handle change keeps the last good profile if the new read
  fails; the hidden-text check keeps words in `display: contents` wrappers and visible children of `visibility: hidden`
  parents. Performance: the hidden-text walk looks only inside the range and skips hidden subtrees whole; the four new
  textures are exact palette PNGs (scan-l 171 to 72 KB, scan-d 129 to 67 KB); doodles and faces are cached a day. Not
  done: the compositor layers under the home page stay for the visit (needs measuring on a real GPU), the old grain
  files are still shipped, and a podcast's "Listen to the episode" may still name a show over any address.
- **Real paper and CC0 art** (2.39.0, `tests/assets239.py`, `CREDITS.md`; David's pick from a list of CC0 ideas, sounds,
  3D models and Lottie left out; backup before it: tag `backup-2026-09-29-before-assets` on 2.38.8 and
  `E:\claude_code\backups\annotated-backup-2026-09-29-before-assets.zip`). The grain and wrinkles on every sheet are
  scans of paper (ambientCG Paper001 and Paper003) cut to their tooth and folds and matched to the strength of the drawn
  ones (`paper/scan-l.png` and `scan-d.png`, 512 pixels shown at 256 through `image-set`, and `wrinkle2.png`, whose
  first cut read as grey blotches and was halved). The tape on a captured post and on the In Chrome print is a scan too
  (`paper/tape.png`, Paper002's fibres tinted). The foot of the home page rests on a desk of light wood (Wood095) washed
  almost to the page and fading at every edge (`.pdFoot::before`, `desk-l.jpg`, `desk-d.jpg`). The full pages' margins
  sometimes carry a coffee ring or a pencil smudge (`ART.ring`, `ART.smudge` in `paperdeco.js`, drawn from a seed, from
  1180 pixels with a mouse). A list with nothing in it yet shows someone reading from Open Doodles (`PaperDeco.doodle`,
  `doodles/<kind>-ink.svg` and `-hi.svg`, two masks so it takes the page's ink and highlighter; never the one shown last
  in the tab), where "not found" and "did not load" keep the crumpled paper. The made-up example readers under For you,
  and why (Sam, Priya, Leo) have Open Peeps faces (`website/public/peeps/`); the real people whose posts are quoted keep
  their initial, since a drawn face would put words to a likeness. The scripts that made the files live in the session's
  scratchpad (`assets/make.py`, `split.py`, `doodles.js`). The ninth and tenth passes ship in this release.
- **Borrowed from X** (2.40.0, `tests/xfeatures.py` on the website and `tests/xfeatures_ext.py` in the extension, migration 28;
  David's pick on 2026-09-29 from a list of X's features; backup before it: tag `backup-2026-09-29-before-xfeatures` on
  2.39.0 and `E:\claude_code\backups\annotated-backup-2026-09-29-before-xfeatures.zip`; built in the worktree
  `annotated-x` on the branch `xfeatures`). **Pin**: your own annotation's menu has Pin to your profile, one at a time
  (`profiles.pinned_id`, only your own, cleared when it is deleted; `Cloud.pin`, `pinnedOf`); a profile lists it first
  under Newest, marked Pinned (`pinnedId` on `renderFeed` and `renderBrowse`). **Replies to replies**, one level deep:
  `comments.parent_id` (a trigger holds it to the same annotation and one level), Reply under a saved comment, replies
  drawn under it oldest first along a pencil line (`parentOf`, `kidsOf`, `.cReplies`), deleting a comment takes its
  replies (the database cascades). **Annotate this**: your take on an annotation, published as an annotation of your own
  that names it (`annotations.quote_of`, `Cloud.quote`, which copies the source but none of its files), then opened; it
  draws the one it answers as a small card that opens it (`quotedBlock`, `.quoted`, `QUOTED` embed in `get` and `list`),
  or says it was deleted; a feed card shows it in place of a picture (`.cquoted`). **Mute and block** from someone
  else's annotation's menu (`blocks` table, private, `Cloud.blocks`, `setBlock`): both leave that person out of Home and
  the feed (`hideAuthors`) and out of Activity; a block also stops their replies, reactions, votes, quotes and follows
  on your work in the database (`is_blocked` in triggers) and ends follows either way. **The edit window**: a take and
  its tag change for fifteen minutes after publishing (the menu says the minutes left), then show Edited
  (`annotations.edited_at`, enforced in `annotations_times`); before this an author could rewrite a take at any time,
  after people had answered. An annotation kept only here can still be edited any time. **Activity**: a bell in the
  panel's top bar and the website's header with a dot when something came since you last looked (`checkActivity`, every
  two minutes and on any change; `annotatedActivitySeen:<uid>` in the extension's storage, `annotated-activity-seen:<uid>`
  in the website's), opening a list of replies, comments, reactions, follows and annotations of yours, new ones washed
  in highlighter (`AnnotationPage.renderActivity`, the `activity` function, `/?activity` on the website). Icons pin,
  bell, quote, block and mute are in `brand.js`. The privacy policy says what is kept. Checked only against stand-in
  databases; migration 28 was checked live in blocks that roll back. Not done: the panel's published card does not offer
  Pin, the home page's own header has no bell, the edit window counts from when a local copy was captured (so a take
  published long after capture loses Edit early), and nobody is emailed about activity.
- **The UX tour of 2026-09-29** (2.40.1, `tests/uxtour0929.py`; David asked for about a hundred interactions with the site
  and a plan of what to improve). The tour script lives in the session's scratchpad (`tour/tour.py`, 98 steps signed out,
  signed in, dark and phone, a screenshot each); the world it runs against is `tests/_world.py`, a lived-in stand-in
  database (four people, every kind of annotation, replies, reactions, a poll, a quote, a pin, follows and activity) that
  any test may use. Fixed: the try-it's bar hides Mark a sentence for me and Show me an example while words are chosen
  or a take is being written (four lines of links read as clutter); the YouTube tab's screen shows the video's own frame
  as soon as it has sought there (it showed a blurry 96 pixel sprite tile until Play selection) and fills the paper's
  width; the home page's header has the bell and its dot; your card counts all of yours beside someone else's profile
  (it said 0) and on a tag page (it said 1); nobody you muted or blocked is suggested under People worth following
  (`discovery` leaves them out), and the suggestion reads "@priya · 2 annotations"; the menu's edit item says "9 minutes
  left to edit" on a line of its own; a comment's reactions and Reply share one row (`.cActs`); Annotate this, signed
  out, asks you to sign in rather than opening a box that cannot publish (`quoteNeedsSignIn`); the wash on new Activity
  rows is lighter in dark mode. David liked the Open Doodles, so there are more of them (`PaperDeco.doodle(kind)` now
  takes a name): someone meditating when Activity is empty, someone on their phone when it asks you to sign in, someone
  sitting on Not found and did not load, and someone with a very large coffee beside Download in the install steps
  (`.giArt`, the download row as tall as the drawing so it never covers the steps). The coffee rings in the margins are
  gone at David's word ("they look weird"); the pencil smudges stay. Found by the full run: 2.40.0's embed of the annotation a quote
  answers named its constraint (`annotations!annotations_quote_of_fkey`), which PostgREST refuses on a table pointing at
  itself, so every read of annotations failed against the live database while every stand-in passed; it is
  `quoted:quote_of(...)` now, and `tests/livequeries.py` runs the website's read queries against the live database (read
  only), failing on the old query and passing on the new. `_world.site` answers byte ranges, but a video
  still would not seek through Playwright's stand-in; the frame was checked on `scripts/serve_website.py`.
- **The panel tour of 2026-09-29** (2.40.2, `tests/xfeatures_ext.py` part 5; the tour script is `tour/ptour.py` in the
  session's scratchpad, signed in against `tests/_world.py`: the welcome, beside a story, select, capture, take, tag,
  publish, Undo, Home and its tabs, Your profile, Activity, Display settings, the account menu, help, the extension's feed,
  profile and annotation pages, and dark). Fixed: beside one of your own published annotations that is not kept on this
  computer, the panel said "You have no annotations yet"; it now adds your published annotations and the one on screen
  from the database, with a three second limit (`annMode` in `sidepanel.js`). Seen and left: the Published card does not
  offer Pin (pinning is on the annotation's page), and a screenshot refused because the panel's own window was in front
  is a test artifact.
- **2.41.0, real annotations on the home page** (`tests/homereal.py`; backup before it: tag
  `backup-2026-09-29-before-home-real` on 2.40.2 and `E:\claude_code\backups\annotated-backup-2026-09-29-before-home-real.zip`).
  From David's own recording of 2026-09-30 at 02:36, set beside the other entries: every card on the home page was an
  Example, the page looked sparse at a large window, and a clip card flashed black. **Latest on annotated** (`realRow` in
  `landing.js`, `.landReal` in `web.css`) sits under Yours so far and before In Chrome: up to six of Robo Taxi's published
  annotations (`REAL_AUTHOR`, at David's word, the account the demo was made with; handle `testhandle`): the six David
  chose (`FEATURED`, the Roadster post with its GIF and the All-In clip first), and, for any deleted, one per source,
  tagged first, takes of 12 characters or more, three columns, hidden with fewer than three or no database (eight seconds
  at most). They are drawn by the feed's own card, now shared as `AnnotationPage.cardsHtml` and `wireCards` (taken out of
  `renderFeed` unchanged), so clips preview silently and Play with sound works there. The front page is wider (1280, and
  1480 from 1700 pixels) with its small print a step larger (`--t-s/m/l` on `.land`) and a larger headline; the headline
  still holds two lines for every tab word from 1024 pixels up. A clip is shown over its still only once a frame of it has
  been painted (`paintedFrame` in `landing.js`, the same check in `wirePreviews`, `requestVideoFrameCallback` or the time
  moving on), since `playing` can come before the first frame reaches the screen.
  Then, from David's screenshot of the live page: the try-it is as tall as the tab shown (`pick` no longer holds the tallest
  tab's height, `smooth` eases the page below), since Post on X after the YouTube clip sat over about 130 pixels of blank
  paper; and Yours so far has two to four columns (`--cols`, one card is half the row), its body, picture and source
  stretched to the card, where a clip card was a quarter of the row and its picture only as wide as its text.
- **2.41.1, from David's recording of 2026-09-30 at 04:21.** An article's card shows its own screenshot, the page with the
  words marked, before the site's preview image (`cardHtml`), since Anthropic's preview image was only a title on a blank
  sheet; with the screenshot the card does not quote the words again under it, as post cards already did
  (`tests/cardpic.py` art3). The full pages grow a little on big screens (the foot of `ui.css`): from 1,700 pixels a 780
  column, the margin drawings moved out with it. The feed stays one card at a time at every width, as on X; two and
  three to a row were tried in 2.41.1 and taken out in 2.41.2 at David's word (`tests/homereal.py` part 8). Below 1,700
  nothing changed. Not done: the feed still opens on Robo Taxi's weaker takes ("Clever!"), which is David's to tidy.
- **2.42.0, the feed's left column** (`tests/leftcol.py`; David, 2026-09-30: something sticky and useful, not a copy of X,
  on our paper). `renderFeed` puts the feed's own controls in `.lside`, a torn sheet like the rail's cards: a search
  (every word somewhere in the take, the quote, the source or the person; the kind counts follow it; "Nothing matches"
  with Clear the search; kept with the filter and sort in `feedChoice`), For you, Following and Everyone, Newest and
  Most discussed, the kinds with their counts and Folded, your tags (the rail's Your tags card is hidden while the
  column shows), and Annotate something (with the extension, how to open the panel; without, Get the extension to
  annotate, by `data-annotated-installed` in `web.css`). The same classes as before (`feedTabs`, `feedSort`,
  `feedFilter`, `railTag`). From a 1,290 pixel container three columns, the column and the rail both sticky; narrower, a
  bar under the list's heading (the list's parts join the grid with `display: contents`), sticky; on a phone, heading,
  controls, cards, rail. The rail had never stuck: stretched to the list's height; it now keeps its foot reachable when
  taller than the window (`--rh` from `shell`). The margin drawings show beside the three columns only from 1,930
  pixels. Profiles have the column without the three tabs. Considered and left out: recently opened, top sites.
- **Submitted on 2026-09-27** as David Winston, @Davidmakestuff, site https://annotated-app.netlify.app, demo video
  https://youtu.be/VTbDJ9a-2XE (2:44, uploaded to the Robo Taxi YouTube channel). The video was cut from David's own
  screen recordings in real Chrome; the edit script (`edit.py`, `shots.py`, `cards.py`, `sfx.py`, `pensrc.py`) lived in
  the session's scratchpad, not the repository. The form is at https://annotated.lovable.app/enter: your name (required), X
  handle, site link, and a demo video link (required), and submissions are public. By submitting you confirm the
  build follows the spec. The other entries are listed at https://annotated.lovable.app/entries; the closest in
  September were Alan Shiflett's (annotated.bytetalk.ai) and Peter Mumford's (annotated.petermumford.com), both
  with lived-in feeds, which is where annotated is weakest.

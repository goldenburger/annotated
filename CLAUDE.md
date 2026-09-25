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
  faststart) to 19.4 MB, which replaced the blurry 320 by 180 mobile file on 2026-09-24. The clip starts on
  liftoff, 2:57 to 3:19. The audio is Houston We Have
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
  the whole feed, a blank page for a second and for good with the database unreachable. Signed in, "/" is the
  feed, with a slim "Try annotated on this page" line (`slimTry`) to `/?try`. `/?feed` is the feed for anyone.
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

- The panel polls every 400 ms (`setInterval` at the foot of `sidepanel.js`), and on a YouTube or an X tab
  each pass also sends a ping and an info message. Driving it from `chrome.tabs.onUpdated`, `onActivated` and
  `chrome.storage.onChanged` with a slow poll behind it would save nearly all of that. Left alone before the
  deadline because every extension test leans on the current timing.

- Follow, For you and trending were tested signed out only. Following someone needs a second real account, which
  is now possible because sign-in is published. This is the last part of the product with no evidence behind it.
- Sign-in with X is skipped because X's API costs money. Google meets "X or Google".
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

# Annotated (bounty build, v2.5)

Chrome side panel extension for annotated.com. Clips YouTube at 240p (up to 90 seconds) and captures article passages, then publishes an annotation page.

## Install
1. Unzip this folder.
2. Open chrome://extensions and turn on Developer mode.
3. Click "Load unpacked" and pick the folder.
4. Pin the extension and click its icon to open the side panel.

## Accounts
Sign in with Google from the button in the panel's top bar. Accounts, annotations, comments, reactions, poll votes and claims are stored in Supabase (project annotated, us-west-1). The manifest carries a fixed public key so the extension's ID is always cggmedbnmeinbhahhllbphkpdbpjeofm, which Google sign-in needs to return to it. The Supabase client library (MIT) is bundled in vendor/.

## Podcasts from public feeds
On podcast apps whose players can't be recorded (Spotify, Amazon Music, iHeartRadio and others), and from "Clip a podcast by name", annotated searches Apple's free podcast directory for the episode, opens the show's own MP3 and plays it in the panel. Capturing downloads only the bytes for the clip (about 0.5 MB for 20 seconds at 192 kbps) and cuts them on MP3 frame boundaries, with no re-encoding. The waveform is fetched 30 seconds at a time as the trimmer moves. Shows without a public feed, paid episodes, and non-MP3 feeds are not supported this way.

## Website
Shared annotations live at https://annotated-app.netlify.app/@handle/id. The site reads the same database, lets anyone read, and lets people signed in with Google comment, react and vote. Link previews on X come from an edge function that adds the take, source and picture to each annotation page.

## Following and discovery
Profiles and annotations have Follow buttons with real follower and following counts. The rail shows People worth following (active in the last 30 days, not already followed) and Trending this week (sources and tags). Home has For you (ranked: newer and more discussed first, lifted for people you follow and the tags and sources you annotate), Following and Everyone. Invite opens your email app with the invite and link written. The empty panel and the article panel take a pasted link and open it ready to annotate.

## Sharing
Signed in, Publish uploads the clip, audio, screenshot, poster and voice note to the public media bucket under your own folder, then saves the annotation. Anyone with the extension can open it, and comments, reactions and votes from everyone show up. Signed out, annotations stay on this computer. The home feed shows everyone's shared annotations, and a name opens that person's profile.

## Display
The gear in the panel's top bar opens Display. Show annotated as a Side panel (Chrome's own panel, resizable by dragging its edge, and movable to the left in Chrome's Settings under Appearance) or Floating (a card over the page you can drag, resize from a bottom corner, snap to an edge, and shrink to a button that sits bottom-right and can be dragged to any corner; the card fits its content until you resize it). The floating panel remembers where you left it. Display also sets what happens after publishing, compact or comfortable density, light, dark or system theme, and whether the Annotate button appears beside selected text. The welcome asks once which display you prefer. Chrome does not allow extensions on its own pages, so those always use the side panel.

## Using it
- The first time the panel opens, a short welcome explains Capture, Take and Publish. The ? in the panel's top bar shows it again.
- Alt+Shift+K opens the panel. Alt+Shift+S annotates the passage you have selected. Change either at chrome://extensions/shortcuts.
- On a YouTube video, drag the highlight or type a start and end time to pick up to 90 seconds. Play selection plays just that range on the page. Then click Capture clip. Capture runs in real time.
- On an article, select a passage. Click the Annotate button that appears in the margin beside it, right-click and choose "Annotate this passage", or click Capture passage in the panel. Selections expand to whole sentences by default, and "Use my exact selection" turns that off. The panel holds your selection if you click away.
- On a podcast episode page with an audio player, the panel opens in podcast mode: the same trimmer over the episode's waveform, up to 90 seconds, recorded as sound. Audio streamed from another site is recorded through a second player when the server allows it, or else from the tab's own sound (click the toolbar button on that tab first). Encrypted audio, the way Spotify and similar services protect theirs, is detected and never recorded. Any page with audio can switch between clipping the audio and highlighting its text.
- On an X post (x.com or twitter.com status page), choose Screenshot, Embed, or Both, then click Capture post. The screenshot keeps the post even if it is deleted. The embed shows its text and links to the live post.
- Add a take, a voice note, or both, then Publish. Publish stays pinned to the bottom of the panel, and Ctrl or Cmd + Enter in the take box publishes too. The annotation page opens in a new tab. It is stored locally in this build, since there is no backend yet.
- Each tab keeps its own capture and draft, so switching tabs loses nothing.
- Annotation pages and the feed share an annotated.com frame with Home and You in the top bar and a right rail with your stats, your tags, and other annotations on the same source. Home, your profile, and each tag have their own page, with filters for clips, passages, and posts. Following other people needs accounts, which come with the backend.
- Share holds Copy link and Post to X. The ... menu holds Edit and Delete.
- While an annotation page is open, the side panel shows its link, share buttons, and your other annotations.
- After you publish, the next capture or selection starts a fresh annotation. Publishing the same clip or passage twice asks first.
- Emoji work everywhere you type a take or comment. Use the smiley button for a searchable picker with recents and skin tones, or type a colon and a name, such as :fire, for suggestions. Typing a full code like :100: swaps it in directly.
- The poll button adds an optional question and two to four options to a take, starting as Agree and Disagree. The poll shows under the clip, passage, or post. React, next to Share, adds emoji reactions from a quick bar of six or the full picker, and comments have their own reactions. Until there are accounts, the only vote and reactions are yours.
- You can delete your own comments, edit your take and tag on an annotation page, and delete an annotation from its page or from the side panel.
- The build runs in demo mode by default, so testing notes stay hidden for recording. Press Shift+D in the panel or on any page to show the detailed checks, the diagnostics log, and the testing notes.

## Design system
ui.css holds the tokens (color, type, shape) and the shared components: buttons, fields, choice chips, the segmented switch, and the wordmark. brand.js has the wordmark and icons as inline SVG. Open styleguide.html from the extension to see every piece in one place. The fonts are Newsreader and Instrument Sans, bundled in fonts/ under the SIL Open Font License.

## Credits
Emoji names, keywords and shortcodes come from Emojibase (MIT license), trimmed to Emoji 15.0 in emoji-data.js.

## Files
Shared by the extension and the in-Claude preview: capture-engine.js, article-core.js, panel-kit.js, compose.js, videopanel.js, articlepanel.js, annotation-page.js, ui.css.
Extension only: manifest.json, background.js, content.js, article.js, sidepanel.html/js, annotation.html/js, store.js, mic.html/js.

## Please check in real Chrome
- The right-click item and the Annotate button both open the side panel. Chrome only allows this from a user action, which headless tests cannot confirm.
- Recording a voice note in the side panel. If Chrome shows no microphone prompt, use "Allow the microphone," which opens a tab to grant it once.
- Real news sites with paywalls or unusual layouts.

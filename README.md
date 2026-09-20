# annotated

Say what you think about anything on the web.

annotated is a Chrome extension and website. Highlight a passage in an article, clip up to 90 seconds of a YouTube
video or podcast, or save a post from X, then add your take. You get a public page with your take on top and the
source underneath, where other people can comment, react and vote. Every annotation credits and links back to its
source, and every one has a **File a claim** button for the people whose work it quotes.

Built for Jason Calacanis's annotated.com bounty on This Week in Startups.

- Website: https://annotated-app.netlify.app
- Install the extension: https://annotated-app.netlify.app/install

## What it does

- **Articles.** Select a sentence or a few paragraphs and click Annotate. The page keeps a screenshot of the passage
  as it appeared, with the quote under it.
- **YouTube.** Drag a trimmer over a filmstrip of the video and capture up to 90 seconds at 240p.
- **Podcasts.** Clip any episode that publishes a public feed, including ones you find on Spotify, Amazon Music or
  iHeartRadio. annotated finds the show's own audio file and cuts only the part you clip.
- **Posts on X.** Save a post as a screenshot (which survives deletion), an embed, or both, and quote part of it.
- **Your take.** Tag it as a hot take, fact check, steelman, receipts or explainer, and add emoji, a poll or a voice
  note.
- **Social.** Comments, reactions and polls from everyone, Follow, people worth following, trending sources and tags,
  and a For you feed. Sign in with Google.
- **Sharing.** Every annotation has its own address with a link preview for X. Post to X or invite someone by email.

## Repository

| Folder | What it holds |
| --- | --- |
| `extension/` | The Chrome extension (Manifest V3) |
| `website/` | The Netlify website and its link-preview edge function |
| `preview/` | A single-file demo of the extension, built by `scripts/build_preview.py` |
| `supabase/migrations/` | The database schema, access rules and functions |
| `tests/` | Playwright tests |
| `scripts/` | Build, package, sync and test commands |

`CLAUDE.md` explains the architecture and the decisions behind it.

## Development

```
pip install playwright && python -m playwright install chromium
python scripts/run_tests.py
```

Load `extension/` in Chrome with Developer mode and Load unpacked. The backend is Supabase (Postgres, auth and
storage), and the website is hosted on Netlify.

## Credits

Emoji data from Emojibase (MIT). Supabase JavaScript client (MIT). Instrument Sans and Newsreader fonts (SIL Open
Font License, included in `extension/fonts`).

## License

MIT. See [LICENSE](LICENSE).

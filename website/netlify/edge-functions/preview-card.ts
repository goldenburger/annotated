import type { Context, Config } from "@netlify/edge-functions";

// Link previews for annotation pages. X, iMessage and other apps read these tags without running the page's
// scripts, so the take, the source and a picture are added to the page here before it is sent.
export default async (req: Request, context: Context) => {
  const url0 = new URL(req.url);
  const parts0 = url0.pathname.split("/").filter(Boolean);
  let id0 = "";
  try { id0 = parts0.length >= 2 && parts0[0].startsWith("@") ? decodeURIComponent(parts0[1]) : ""; } catch { id0 = ""; }
  const base0 = Netlify.env.get("SUPABASE_URL"), key0 = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  // Asked for alongside the page, not after it, and never waited on for more than a second and a half.
  const rowP = /^[a-z0-9-]{3,120}$/.test(id0) && base0 && key0
    ? fetch(`${base0}/rest/v1/annotations?id=eq.${id0}&select=take_text,kind,source,poster_path,shot_path,author:profiles!annotations_author_id_fkey(display_name,handle)`,
        { headers: { apikey: key0 }, signal: AbortSignal.timeout(1500) }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    : Promise.resolve(null);
  const res = await context.next();
  // Only a whole page can be given tags. A "not modified" answer has no body, and rewriting it as a 200 would
  // send an empty page to a browser that asked whether its copy was still good.
  if (res.status !== 200 || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || !parts[0].startsWith("@")) return res;
  const id = id0;
  if (!/^[a-z0-9-]{3,120}$/.test(id)) return res;
  const base = Netlify.env.get("SUPABASE_URL");
  const key = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!base || !key) return res;
  try {
    const rows = await rowP;
    if (!rows) return res;
    const a = rows && rows[0];
    if (!a) return res;
    const esc = (s: string) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const src = a.source || {};
    const who = (a.author && a.author.display_name) || "Someone";
    const sourceTitle = a.kind === "post" ? `${src.author || "A post"} on X` : a.kind === "article" ? ((src.meta && src.meta.title) || "an article") : (src.title || "a clip");
    const place = a.kind === "article" ? (src.meta && src.meta.site) : a.kind === "audio" ? src.show : a.kind === "video" ? (src.site === "x" ? "X" : "YouTube") : "";
    const take = a.take_text || `${who} annotated ${sourceTitle}`;
    const desc = `${who} on ${sourceTitle}${place ? `, ${place}` : ""}. annotated`;
    const pub = (p: string) => `${base}/storage/v1/object/public/media/${p.split("/").map(encodeURIComponent).join("/")}`;
    const image = a.poster_path ? pub(a.poster_path) : a.shot_path ? pub(a.shot_path) : (/^https:\/\//.test(src.artwork || "") ? src.artwork : `${url.origin}/icon.png`);
    const tags = [
      `<meta property="og:type" content="article">`,
      `<meta property="og:site_name" content="annotated">`,
      `<meta property="og:title" content="${esc(take.slice(0, 200))}">`,
      `<meta property="og:description" content="${esc(desc.slice(0, 300))}">`,
      `<meta property="og:url" content="${esc(url.origin + url.pathname)}">`,
      `<meta property="og:image" content="${esc(image)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${esc(take.slice(0, 200))}">`,
      `<meta name="twitter:description" content="${esc(desc.slice(0, 300))}">`,
      `<meta name="twitter:image" content="${esc(image)}">`,
    ].join("\n  ");
    // A function, not a string, so that "$'" or "$&" in someone's take is only text. As a replacement string
    // those copy parts of the page into the title, which could put the page's own scripts in twice.
    const head = `<title>${esc(take.slice(0, 120))} | annotated</title>\n  ${tags}`;
    // Any title, since the page's own changed on 2026-09-23 and a fixed string stopped matching, which left every
    // shared link on the home page's card. The page's own card tags go, so X reads only this annotation's.
    const html = (await res.text())
      .replace(/^[ \t]*<meta (?:property="og:[^"]*"|name="twitter:[^"]*"|name="description")[^>]*>\r?\n?/gm, "")
      .replace(/<title>[^<]*<\/title>/, () => head);
    const headers = new Headers(res.headers);
    headers.delete("content-length"); headers.delete("etag"); headers.delete("last-modified");
    return new Response(html, { status: 200, headers });
  } catch {
    return res;
  }
};

export const config: Config = { path: "/@*" };

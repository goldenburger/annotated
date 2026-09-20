import type { Context, Config } from "@netlify/edge-functions";

// Link previews for annotation pages. X, iMessage and other apps read these tags without running the page's
// scripts, so the take, the source and a picture are added to the page here before it is sent.
export default async (req: Request, context: Context) => {
  const res = await context.next();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || !parts[0].startsWith("@")) return res;
  const id = decodeURIComponent(parts[1]);
  if (!/^[a-z0-9-]{3,120}$/.test(id)) return res;
  const base = Netlify.env.get("SUPABASE_URL");
  const key = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!base || !key) return res;
  try {
    const q = `${base}/rest/v1/annotations?id=eq.${id}&select=take_text,kind,source,poster_path,shot_path,author:profiles!annotations_author_id_fkey(display_name,handle)`;
    const r = await fetch(q, { headers: { apikey: key } });
    if (!r.ok) return res;
    const rows = await r.json();
    const a = rows && rows[0];
    if (!a) return res;
    const esc = (s: string) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const src = a.source || {};
    const who = (a.author && a.author.display_name) || "Someone";
    const sourceTitle = a.kind === "post" ? `${src.author || "A post"} on X` : a.kind === "article" ? ((src.meta && src.meta.title) || "an article") : (src.title || "a clip");
    const place = a.kind === "article" ? (src.meta && src.meta.site) : a.kind === "audio" ? src.show : a.kind === "video" ? "YouTube" : "";
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
    const html = (await res.text()).replace("<title>annotated</title>", `<title>${esc(take.slice(0, 120))} | annotated</title>\n  ${tags}`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(html, { status: 200, headers });
  } catch {
    return res;
  }
};

export const config: Config = { path: "/@*" };

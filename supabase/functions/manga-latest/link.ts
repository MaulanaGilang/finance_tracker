// Reading the latest chapter from the page in a title's own link ("Where you read it").
// MangaDex and MangaUpdates links go through their APIs; any other site's series page is fetched
// and its chapter links are read. Sites that block automated visitors (Cloudflare checks and the like)
// or build the page with JavaScript give nothing, and the normal search takes over.

export type LinkLatest = { chapter: number; url: string; source: 'mangadex' | 'mangaupdates' | 'link' }

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const MAX_CHAPTER = 5000

export const parseLink = (link: string | null) => {
  if (!link) return null
  try {
    const u = new URL(link.trim())
    return /^https?:$/.test(u.protocol) ? u : null
  } catch {
    return null
  }
}

/** Series ids a MangaDex or MangaUpdates link points at */
export function idsFromLink(link: string | null): { mangadex_id?: string; mu_id?: string } {
  const u = parseLink(link)
  if (!u) return {}
  const host = u.hostname.replace(/^www\./, '')
  if (host === 'mangadex.org') {
    const id = u.pathname.match(/^\/title\/([^/]+)/)?.[1]
    return id && UUID.test(id) ? { mangadex_id: id.toLowerCase() } : {}
  }
  if (host === 'mangaupdates.com') {
    // New style: /series/<id in base 36>/<name>; old style: series.html?id=<number>
    const slug = u.pathname.match(/^\/series\/([0-9a-z]+)/i)?.[1]
    if (slug) return { mu_id: String(parseInt(slug, 36)) }
    const old = u.searchParams.get('id')
    return old && /^\d+$/.test(old) ? { mu_id: old } : {}
  }
  return {}
}

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
}

// Path words that name a kind of page, not the series
const GENERIC = new Set(['manga', 'manhwa', 'manhua', 'comic', 'comics', 'series', 'title', 'titles', 'webtoon', 'webtoons', 'read', 'list', 'book', 'books', 'detail', 'details', 'info', 'chapters'])

/** The part of the link's path that names the series ("tower-of-god", "solo-leveling-a1b2"); chapter links contain it */
function seriesSlug(u: URL) {
  const segs = u.pathname
    .split('/')
    .map((s) => {
      try {
        return decodeURIComponent(s).toLowerCase()
      } catch {
        return s.toLowerCase()
      }
    })
    .filter((s) => s.length >= 3 && /[a-z]/.test(s) && !GENERIC.has(s) && !/^(chapter|chap|ch|episode|ep)[-_]?\d/.test(s) && !/\.(html?|php)$/.test(s))
  return segs.sort((a, b) => b.length - a.length)[0] ?? null
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

// Chapter number in a link address: ?episode_no=640 (Webtoon), /chapter-200, /chapter_12.5, /ch-3, /episode/45
const HREF_EPISODE = /[?&]episode_no=(\d{1,5})(?!\d)/i
const HREF_CHAPTER = /(?<![a-z])(?:chapter|chap|ch|episode|ep)[-_/.]*(\d{1,4}(?:[.-]\d{1,2})?)(?![\d])/i
// ...or in the link's text: "Chapter 200", "Ch. 12.5", "Episode 45", "#640"
const TEXT_CHAPTER = /(?:chapter|chap\.?|ch\.|episode|ep\.|#)\s*(\d{1,4}(?:\.\d{1,2})?)(?![\d])/i

// The whole link text starts as a chapter label: "Chapter 1198", "Ch. 12.5 - Title", "Episode 45", "#640"
const LABEL_ONLY = /^(?:chapter|chap\.?|ch\.|episode|ep\.|#)\s*(\d{1,4}(?:\.\d{1,2})?)(?![\d])/i

const toNumber = (s: string) => Number(s.replace('-', '.'))

/** Highest chapter linked from a series page, or null when the page can't be read or shows none */
export async function scrapeLatest(link: string): Promise<LinkLatest | null> {
  const u = parseLink(link)
  if (!u) return null
  const res = await fetch(u, { headers: BROWSER, redirect: 'follow', signal: AbortSignal.timeout(15000) })
  if (!res.ok) return null
  if (!(res.headers.get('content-type') ?? '').includes('html')) return null
  const html = await res.text()
  // A bot check instead of the page (normal Cloudflare pages also load a challenge script, so only the check page itself counts)
  if (/cf-browser-verification|<title>\s*just a moment/i.test(html)) return null

  const page = new URL(res.url || u.href)
  const slug = seriesSlug(u)
  // Two kinds of evidence. Strict: the chapter link's address names this series (sidebars list other series' chapters too).
  // Loose, only used when there's no strict one: a link on the same site whose text is just a chapter label
  // ("Chapter 1198"), as on sites whose chapter addresses are bare ids; other series show their name first.
  let strict: LinkLatest | null = null
  let loose: LinkLatest | null = null
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href: URL
    try {
      href = new URL(decodeEntities(m[1]), page)
    } catch {
      continue
    }
    if (href.href.split('#')[0] === page.href.split('#')[0]) continue
    let path = href.href.toLowerCase()
    try {
      path = decodeURIComponent(path)
    } catch {
      /* keep as is */
    }
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    const named = !slug || path.includes(slug)
    const raw = named
      ? (href.href.match(HREF_EPISODE)?.[1] ?? text.match(TEXT_CHAPTER)?.[1] ?? href.href.match(HREF_CHAPTER)?.[1])
      : href.hostname === page.hostname
        ? text.match(LABEL_ONLY)?.[1]
        : undefined
    if (!raw) continue
    const n = toNumber(raw)
    if (!Number.isFinite(n) || n <= 0 || n > MAX_CHAPTER) continue
    const hit = { chapter: n, url: href.href, source: 'link' as const }
    if (named) {
      if (!strict || n > strict.chapter) strict = hit
    } else if (!loose || n > loose.chapter) loose = hit
  }
  return strict ?? loose
}

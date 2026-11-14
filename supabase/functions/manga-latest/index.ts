// Latest chapter for each manga you're reading, from two public APIs (no scraping, no accounts):
//   MangaDex     - newest chapter with an English translation
//   MangaUpdates - newest release it tracks (covers series MangaDex doesn't host)
// The higher of the two wins. Runs weekly from pg_cron in batches; the app can also check one title or search.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const MD = 'https://api.mangadex.org'
const MU = 'https://api.mangaupdates.com/v1'
const UA = { 'User-Agent': 'LedgerMangaChecker/1.0 (personal reading list)' }
const BATCH = 25
const RECHECK_DAYS = 5
const MATCH_AT = 0.72
// MangaDex hides adult titles unless asked; the list has some
const RATINGS = ['safe', 'suggestive', 'erotica', 'pornographic'].map((r) => `contentRating[]=${r}`).join('&')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(15000) })
  if (res.status === 429) {
    // Rate limited: wait once and retry
    await sleep(2500)
    return get(url, init)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Title matching: the sheet has loose romaji ("kage no jitsuryokusha"), sources have full titles

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const compact = (s: string) => norm(s).replace(/ /g, '')

function bigrams(s: string) {
  const m = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1)
  return m
}
function dice(a: string, b: string) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const A = bigrams(a)
  const B = bigrams(b)
  let both = 0
  for (const [k, n] of A) both += Math.min(n, B.get(k) ?? 0)
  return (2 * both) / (a.length - 1 + b.length - 1)
}
/** 0..1: how well a candidate name fits what you wrote */
export function similarity(query: string, candidate: string) {
  const q = compact(query)
  const c = compact(candidate)
  if (!q || !c) return 0
  if (q === c) return 1
  // You wrote the start of a long title (or the source shortened it)
  if (Math.min(q.length, c.length) >= 10 && (c.startsWith(q) || q.startsWith(c))) return 0.9
  // ...possibly with a typo: compare against the same-length start of the longer title
  const head = q.length >= 16 && c.length > q.length ? 0.9 * dice(q, c.slice(0, q.length)) : 0
  return Math.max(dice(q, c), head)
}
const best = (query: string, names: (string | undefined)[]) => Math.max(0, ...names.filter(Boolean).map((n) => similarity(query, n!)))

// Side releases share the main title; never prefer them unless that's what you wrote
const SIDE = /doujinshi|oneshot|one-shot|fan[- ]colou?red|official colou?red|full colou?r|\bpilot\b|anthology|spin-?off/i
const isSide = (names: string[], query: string) => !SIDE.test(query) && names.some((n) => SIDE.test(n))

// ---------------------------------------------------------------------------
// MangaDex

type MdManga = {
  id: string
  attributes: {
    title: Record<string, string>
    altTitles: Record<string, string>[]
    status: string
    year: number | null
    links: Record<string, string> | null
  }
}
/** MangaDex links each series to MangaUpdates by its URL slug, which is the series id in base 36 */
const mdToMu = (m: MdManga) => {
  const slug = m.attributes.links?.mu
  return slug && /[a-z]/i.test(slug) ? String(parseInt(slug, 36)) : null
}
const mdNames = (m: MdManga) => [...Object.values(m.attributes.title), ...m.attributes.altTitles.flatMap((t) => Object.values(t))]
const mdTitle = (m: MdManga) => m.attributes.title.en ?? m.attributes.altTitles.find((t) => t.en)?.en ?? Object.values(m.attributes.title)[0] ?? ''

async function mdSearch(q: string, limit = 5) {
  const { data } = await get<{ data: MdManga[] }>(`${MD}/manga?limit=${limit}&title=${encodeURIComponent(q)}&order[relevance]=desc&${RATINGS}`)
  return data
}

async function mdManga(id: string) {
  const { data } = await get<{ data: MdManga }>(`${MD}/manga/${id}`)
  return data
}

/** Highest English chapter number on MangaDex, with a link to it */
async function mdLatestEnglish(id: string): Promise<{ chapter: number; url: string } | null> {
  type Agg = { volumes: Record<string, { chapters: Record<string, { chapter: string; id: string }> }> | [] }
  const { volumes } = await get<Agg>(`${MD}/manga/${id}/aggregate?translatedLanguage[]=en`)
  let top: { chapter: number; url: string } | null = null
  for (const v of Object.values(volumes ?? {})) {
    for (const c of Object.values(v.chapters)) {
      const n = Number(c.chapter)
      if (Number.isFinite(n) && (!top || n > top.chapter)) top = { chapter: n, url: `https://mangadex.org/chapter/${c.id}` }
    }
  }
  return top
}

// ---------------------------------------------------------------------------
// MangaUpdates

type MuHit = { record: { series_id: number; title: string; url: string; year: string }; hit_title: string }
type MuSeries = { series_id: number; title: string; url: string; latest_chapter: number | null; completed: boolean; status: string | null }

async function muSearch(q: string, perpage = 5) {
  const { results } = await get<{ results: MuHit[] }>(`${MU}/series/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ search: q, perpage }),
  })
  return results ?? []
}
const muSeries = (id: string) => get<MuSeries>(`${MU}/series/${id}`)

// ---------------------------------------------------------------------------

type Row = {
  id: string
  title: string
  mangadex_id: string | null
  mu_id: string | null
  matched_title: string | null
  match_locked: boolean
}

/** Find (or reuse) the match for one title and read its latest chapter */
async function checkTitle(row: Row) {
  let { mangadex_id, mu_id, matched_title } = row
  const searched = !row.match_locked && !mangadex_id && !mu_id

  if (searched) {
    const md = await mdSearch(row.title).catch(() => [])
    const mdBest = md
      .filter((m) => !isSide(mdNames(m), row.title))
      .map((m) => ({ m, s: best(row.title, mdNames(m)) }))
      .sort((a, b) => b.s - a.s)[0]
    if (mdBest && mdBest.s >= MATCH_AT) {
      mangadex_id = mdBest.m.id
      matched_title = mdTitle(mdBest.m)
      // Same series on MangaUpdates, straight from MangaDex's own link (no second guess)
      mu_id = mdToMu(mdBest.m)
    }
    if (!mu_id) {
      const mu = await muSearch(row.title).catch(() => [])
      const muBest = mu
        .filter((h) => !isSide([h.hit_title, h.record.title], row.title))
        .map((h) => ({ h, s: best(row.title, [h.hit_title, h.record.title]) }))
        .sort((a, b) => b.s - a.s)[0]
      // With a MangaDex match already, only take a near-certain MangaUpdates one
      if (muBest && muBest.s >= (mangadex_id ? 0.95 : MATCH_AT)) {
        mu_id = String(muBest.h.record.series_id)
        matched_title ??= muBest.h.record.title
      }
    }
  }

  if (!mangadex_id && !mu_id) return { mangadex_id, mu_id, matched_title, check_status: 'not_found' as const }

  const [mdInfo, mdCh] = await Promise.all([
    mangadex_id ? mdManga(mangadex_id).catch(() => null) : null,
    mangadex_id ? mdLatestEnglish(mangadex_id).catch(() => null) : null,
  ])
  // A series picked on MangaDex by hand still gets its MangaUpdates twin
  if (!mu_id && mdInfo) mu_id = mdToMu(mdInfo)
  const muInfo = mu_id ? await muSeries(mu_id).catch(() => null) : null

  const md = mdCh?.chapter ?? null
  // MangaUpdates reports 0 when it has no release data
  const mu = muInfo?.latest_chapter || null
  const fromMd = md !== null && (mu === null || md >= mu)
  const latest = fromMd ? md : mu
  const series_status = mdInfo?.attributes.status ?? (muInfo ? (muInfo.completed ? 'completed' : 'ongoing') : null)

  return {
    mangadex_id,
    mu_id,
    matched_title: matched_title ?? (mdInfo ? mdTitle(mdInfo) : muInfo?.title ?? null),
    latest_chapter: latest,
    latest_source: latest === null ? null : fromMd ? 'mangadex' : 'mangaupdates',
    latest_url: fromMd ? mdCh!.url : muInfo?.url ?? (mangadex_id ? `https://mangadex.org/title/${mangadex_id}` : null),
    series_status,
    check_status: latest === null && !mdInfo && !muInfo ? ('failed' as const) : ('ok' as const),
  }
}

async function checkAndSave(db: SupabaseClient, row: Row) {
  let patch: Record<string, unknown>
  try {
    patch = await checkTitle(row)
  } catch (e) {
    console.error(row.title, e)
    patch = { check_status: 'failed' }
  }
  const { data } = await db
    .from('manga_titles')
    .update({ ...patch, checked_at: new Date().toISOString() })
    .eq('id', row.id)
    .select()
    .single()
  return data
}

const COLS = 'id, title, mangadex_id, mu_id, matched_title, match_locked'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))

  try {
    // Candidates for picking the right series by hand
    if (body?.action === 'search') {
      const q = String(body.query ?? '').trim()
      if (!q) return json({ results: [] })
      const [md, mu] = await Promise.all([mdSearch(q, 6).catch(() => []), muSearch(q, 6).catch(() => [])])
      return json({
        results: [
          ...md.map((m) => ({ source: 'mangadex', id: m.id, title: mdTitle(m), year: m.attributes.year, status: m.attributes.status, url: `https://mangadex.org/title/${m.id}` })),
          ...mu.map((h) => ({ source: 'mangaupdates', id: String(h.record.series_id), title: h.record.title, year: h.record.year || null, status: null, url: h.record.url })),
        ],
      })
    }

    // One title, right now (after adding it or picking its match)
    if (body?.action === 'check_one' && body.id) {
      const { data: row } = await db.from('manga_titles').select(COLS).eq('id', body.id).single()
      if (!row) return json({ error: 'not found' }, 404)
      return json(await checkAndSave(db, row as Row))
    }

    // Weekly batch: titles you're reading that weren't checked in the last few days
    const since = new Date(Date.now() - RECHECK_DAYS * 864e5).toISOString()
    const { data: rows, error } = await db
      .from('manga_titles')
      .select(COLS)
      .eq('status', 'reading')
      .or(`checked_at.is.null,checked_at.lt.${since}`)
      .order('checked_at', { ascending: true, nullsFirst: true })
      .limit(BATCH)
    if (error) throw error

    const tally: Record<string, number> = {}
    for (const row of rows ?? []) {
      const saved = await checkAndSave(db, row as Row)
      const s = saved?.check_status ?? 'failed'
      tally[s] = (tally[s] ?? 0) + 1
      await sleep(400) // stay well under MangaDex's 5 requests/second
    }
    const { count } = await db
      .from('manga_titles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'reading')
      .or(`checked_at.is.null,checked_at.lt.${since}`)
    return json({ checked: rows?.length ?? 0, ...tally, remaining: count ?? 0 })
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})

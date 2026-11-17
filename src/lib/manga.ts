// Manga reading list: types and the small bits of logic the pages share.

export type MangaStatus = 'reading' | 'completed'
export type CheckStatus = 'pending' | 'ok' | 'not_found' | 'failed'
export type MangaSource = 'mangadex' | 'mangaupdates'
/** Where the latest chapter number came from: one of the two sources, or the page in your own link */
export type ChapterSource = MangaSource | 'link'

export interface Manga {
  id: string
  title: string
  status: MangaStatus
  last_read: number | null
  link: string | null
  notes: string | null
  mangadex_id: string | null
  mu_id: string | null
  matched_title: string | null
  match_locked: boolean
  latest_chapter: number | null
  latest_source: ChapterSource | null
  latest_url: string | null
  series_status: string | null
  check_status: CheckStatus
  checked_at: string | null
  /** The checker couldn't confirm this title, so the weekly check skips it */
  skip_check: boolean
  /** Cover thumbnail from MangaDex or MangaUpdates, for the hover preview */
  cover_url: string | null
  cover_checked_at: string | null
  created_at: string
  updated_at: string
}

export interface MangaInput {
  id?: string
  title: string
  status: MangaStatus
  last_read: number | null
  link: string
  notes: string
  // Only sent when you pick a match by hand
  mangadex_id?: string | null
  mu_id?: string | null
  matched_title?: string | null
  match_locked?: boolean
  skip_check?: boolean
}

export interface MangaCandidate {
  source: MangaSource
  id: string
  title: string
  year: number | string | null
  status: string | null
  url: string
}

export const SOURCE_LABEL: Record<MangaSource, string> = { mangadex: 'MangaDex', mangaupdates: 'MangaUpdates' }

/** "https://www.asuracomic.net/series/x" -> "asuracomic.net" */
export const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

/** Name of the place the latest chapter was read from ("MangaDex", or your link's site) */
export const latestFrom = (m: Manga) =>
  !m.latest_source ? null : m.latest_source === 'link' ? (hostOf(m.link) ?? 'your link') : SOURCE_LABEL[m.latest_source]

/** "juujika no rokunin" -> "Juujika No Rokunin": each word's first letter, the rest left as typed ("DEAD Tube" stays) */
export const capitalizeFirst = (s: string) => s.replace(/(^|\s)([^\p{L}\s]*)(\p{Ll})/gu, (_, sp: string, lead: string, ch: string) => sp + lead + ch.toLocaleUpperCase())

/** The publisher's status, grouped for the filter ("Finished" = the series has ended) */
export const SERIES_FILTER = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Finished' },
  { value: 'hiatus', label: 'On hiatus' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'unknown', label: 'Unknown' },
] as const
export type SeriesFilter = 'all' | (typeof SERIES_FILTER)[number]['value']
export const seriesKey = (m: Manga): Exclude<SeriesFilter, 'all'> =>
  m.series_status === 'ongoing' || m.series_status === 'completed' || m.series_status === 'hiatus' || m.series_status === 'cancelled'
    ? m.series_status
    : 'unknown'

/** 61.5 stays 61.5, 12 stays 12, 0.06 stays 0.06 */
export const chapterLabel = (n: number | null) => (n === null ? '-' : String(Number(n.toFixed(3))))

/** Chapters released since the one you last read (0 when caught up or unknown) */
export function unread(m: Manga) {
  // No last-read chapter noted: there's nothing to count from, so no "+N" badge
  // Not tracked: the number found can't be trusted, so it counts nothing as new
  if (m.status !== 'reading' || m.skip_check || m.latest_chapter === null || m.last_read === null) return 0
  return Math.max(0, m.latest_chapter - m.last_read)
}
export const hasNew = (m: Manga) => unread(m) > 0

/** How many whole chapters behind, for the badge ("+3"); a fractional gap still counts as one */
export const unreadLabel = (m: Manga) => {
  const n = unread(m)
  return n <= 0 ? null : `+${n >= 1 ? Math.floor(n) : 1}`
}

export const seriesStatusLabel = (s: string | null) =>
  s ? ({ ongoing: 'Ongoing', completed: 'Finished', hiatus: 'On hiatus', cancelled: 'Cancelled' } as Record<string, string>)[s] ?? s : null

/** Where to read: your own link first, else the source's page for the newest chapter */
export const readUrl = (m: Manga) => m.link ?? m.latest_url ?? (m.mangadex_id ? `https://mangadex.org/title/${m.mangadex_id}` : null)

export function lastChecked(list: Manga[]) {
  const times = list.map((m) => m.checked_at).filter(Boolean) as string[]
  return times.length ? times.sort().at(-1)! : null
}

export function mangaKpis(list: Manga[]) {
  const reading = list.filter((m) => m.status === 'reading')
  return {
    reading: reading.length,
    completed: list.length - reading.length,
    withNew: reading.filter(hasNew).length,
    notTracked: reading.filter((m) => m.skip_check).length,
  }
}

/** Why a title is not tracked, in plain words */
export function notTrackedReason(m: Manga) {
  if (m.check_status === 'not_found') return "Couldn't find this series"
  if (m.latest_chapter === null) return m.link ? 'No chapter numbers on your link, MangaDex or MangaUpdates' : 'No chapter numbers on MangaDex or MangaUpdates'
  if (m.last_read !== null && m.latest_chapter < m.last_read)
    return `Sources only go to ch. ${chapterLabel(m.latest_chapter)}, below where you are`
  return 'Weekly check turned off'
}

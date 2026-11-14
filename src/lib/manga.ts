// Manga reading list: types and the small bits of logic the pages share.

export type MangaStatus = 'reading' | 'completed'
export type CheckStatus = 'pending' | 'ok' | 'not_found' | 'failed'
export type MangaSource = 'mangadex' | 'mangaupdates'

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
  latest_source: MangaSource | null
  latest_url: string | null
  series_status: string | null
  check_status: CheckStatus
  checked_at: string | null
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

/** 61.5 stays 61.5, 12 stays 12, 0.06 stays 0.06 */
export const chapterLabel = (n: number | null) => (n === null ? '-' : String(Number(n.toFixed(3))))

/** Chapters released since the one you last read (0 when caught up or unknown) */
export function unread(m: Manga) {
  if (m.status !== 'reading' || m.latest_chapter === null) return 0
  return Math.max(0, m.latest_chapter - (m.last_read ?? 0))
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
    unmatched: reading.filter((m) => m.check_status === 'not_found').length,
  }
}

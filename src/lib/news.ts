// News tool: types, topic meta and small helpers.

export type NewsTopic = 'ai' | 'robotics' | 'geopolitics' | 'central_banks' | 'energy' | 'trade' | 'semiconductors'

export interface NewsArticle {
  id: number
  url: string
  title: string
  summary: string | null
  source: string
  image_url: string | null
  published_at: string
  topics: NewsTopic[]
  market_score: number
  saved: boolean
  fetched_at: string
  /** 3-5 most informative sentences from the article body (extractive, not AI-written) */
  key_points: string[] | null
  /** A longer read: about a third of the article's best sentences, grouped into paragraphs (also extractive) */
  brief: string[] | null
  word_count: number | null
  details_status: 'pending' | 'ok' | 'failed'
}

export const TOPICS: Record<NewsTopic, { label: string; short: string; color: string }> = {
  ai: { label: 'AI', short: 'AI', color: '#9b8cf0' },
  robotics: { label: 'Robotics', short: 'Robotics', color: '#5cc0d4' },
  geopolitics: { label: 'Geopolitics', short: 'Geopolitics', color: '#f08068' },
  central_banks: { label: 'Central banks & rates', short: 'Rates', color: '#7b93f0' },
  energy: { label: 'Energy & commodities', short: 'Energy', color: '#f5b14c' },
  trade: { label: 'Trade & tariffs', short: 'Trade', color: '#6fcf9c' },
  semiconductors: { label: 'Semiconductors', short: 'Chips', color: '#9aa5c0' },
}
export const TOPIC_ORDER = Object.keys(TOPICS) as NewsTopic[]

/** The Feed and Briefing group the 7 topics into 3 */
export type NewsGroup = 'tech' | 'economy' | 'world'
export const GROUPS: Record<NewsGroup, { label: string; short: string; color: string; topics: NewsTopic[] }> = {
  tech: { label: 'Tech & AI', short: 'Tech', color: '#9b8cf0', topics: ['ai', 'robotics', 'semiconductors'] },
  economy: { label: 'Economy & Markets', short: 'Economy', color: '#f5b14c', topics: ['central_banks', 'energy'] },
  world: { label: 'Geopolitics & Trade', short: 'World', color: '#f08068', topics: ['geopolitics', 'trade'] },
}
export const GROUP_ORDER = Object.keys(GROUPS) as NewsGroup[]
export const inGroup = (a: NewsArticle, g: NewsGroup) => a.topics.some((t) => GROUPS[g].topics.includes(t))

/** About 220 words a minute */
export const readMinutes = (words: number | null) => (words ? Math.max(1, Math.round(words / 220)) : null)

/** Stories that mention several market-moving terms (inflation, tariffs, yields, oil prices...) */
export const HIGH_IMPACT = 3
export const isHighImpact = (a: NewsArticle) => a.market_score >= HIGH_IMPACT

export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

export const within = (iso: string, hours: number, now = Date.now()) => now - new Date(iso).getTime() <= hours * 3600e3

export const SOURCES = [
  'BBC', 'The Guardian', 'CNBC', 'Al Jazeera', 'TechCrunch', 'MIT Technology Review',
  'IEEE Spectrum', 'Federal Reserve', 'ECB', 'OilPrice.com', 'Antara',
]

/** Feed text should already be plain, but never render stray markup like <p> if a source slips some through */
/** Paragraphs for the article page: the brief, or older key points grouped in threes, or the feed summary */
export function storyParagraphs(a: NewsArticle): string[] {
  if (a.brief?.length) return a.brief
  const points = a.key_points ?? []
  if (points.length) {
    const out: string[] = []
    for (let i = 0; i < points.length; i += 3) out.push(points.slice(i, i + 3).join(' '))
    return out
  }
  const s = plainText(a.summary)
  return s ? [s] : []
}

/** Needs (re)summarising: never done, or done before the paragraph brief existed */
export const needsDetails = (a: NewsArticle) => a.details_status === 'pending' || (a.details_status === 'ok' && !a.brief)

export const plainText = (s: string | null | undefined) =>
  (s ?? '').replace(/<[^>]+>/g, ' ').replace(/&lt;\/?[a-z][^&]*&gt;/gi, ' ').replace(/\s+/g, ' ').trim()

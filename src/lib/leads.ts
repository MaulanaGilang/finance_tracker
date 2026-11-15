// Jobs the scout found for you (company job boards + job-alert emails), scored by your rules.

export type LeadTier = 'first' | 'apply' | 'maybe' | 'skip'
export type LeadSource = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters' | 'linkedin' | 'jobstreet' | 'glints'

export interface JobLead {
  id: string
  source: LeadSource
  source_job_id: string
  company: string
  title: string
  location: string | null
  url: string | null
  /** False when only an email card was seen (title, company, location) */
  description_read: boolean
  salary_min: number | null
  salary_max: number | null
  employment_type: string | null
  posted_at: string | null
  tier: LeadTier
  score: number
  note: string | null
  flags: string[]
  reasons: { rule: string; match: string }[]
  status: 'new' | 'applied' | 'skipped'
  first_seen_at: string
}

export interface LeadsInfo {
  companies: number
  last_scan: string | null
  last_email: string | null
}

export const TIER: Record<LeadTier, { label: string; hint: string }> = {
  first: { label: 'Best fit', hint: 'SQL plus data-engineering work: a real step toward data engineering.' },
  apply: { label: 'Good fit', hint: 'Data work with SQL, Python or a BI tool.' },
  maybe: { label: 'Check it', hint: 'Passed your rules, but not much to go on: often only the title was seen.' },
  skip: { label: 'Filtered out', hint: 'Broke one of your rules.' },
}
export const TIER_ORDER: LeadTier[] = ['first', 'apply', 'maybe', 'skip']

export const SOURCE_LABEL: Record<LeadSource, string> = {
  greenhouse: 'Company site',
  lever: 'Company site',
  ashby: 'Company site',
  workable: 'Company site',
  smartrecruiters: 'Company site',
  linkedin: 'LinkedIn',
  jobstreet: 'JobStreet',
  glints: 'Glints',
}

const juta = (n: number) => `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
export const leadPay = (l: JobLead) =>
  l.salary_min && l.salary_max && l.salary_min !== l.salary_max
    ? `Rp ${juta(l.salary_min)} - ${juta(l.salary_max)}`
    : l.salary_max || l.salary_min
      ? `Rp ${juta((l.salary_max || l.salary_min)!)}`
      : null

/** Best first: tier, then how data-heavy the description is, then newest */
export const byFit = (a: JobLead, b: JobLead) =>
  TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.score - a.score || b.first_seen_at.localeCompare(a.first_seen_at)

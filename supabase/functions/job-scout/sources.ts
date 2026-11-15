// Where jobs come from: open company job boards and job-alert emails. No database access here (index.ts saves).
import { isDataTitle, parseSalary, type Job } from './rules.ts'

const UA = { 'User-Agent': 'LedgerJobScout/1.0 (personal job search)' }
export const COMPANIES_PER_RUN = 6
export const RESCAN_HOURS = 20
/** Only jobs from the last day are recommended, and recommendations older than this are deleted */
export const FRESH_HOURS = 24
const ID_LOC =
  /indonesia|jakarta|bandung|surabaya|bali|denpasar|yogyakarta|jogja|medan|semarang|tangerang|bekasi|depok|bogor|batam|makassar|malang|balikpapan|palembang|cikarang|karawang/i

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** HTML (possibly entity-escaped, as Greenhouse sends it) to readable plain text */
export function plain(html: string | null | undefined) {
  if (!html) return ''
  const decode = (s: string) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  return decode(decode(html).replace(/<\/(p|div|li|h\d|br)>|<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type Lead = Job & { source: string; source_job_id: string; url: string | null; posted_at: string | null; description_read: boolean }

// ---------------------------------------------------------------------------
// Company job boards. Each returns Indonesia-located data jobs with their full description.

export type Company = { id: string; name: string; ats: string; slug: string }

async function greenhouse(c: Company): Promise<Lead[]> {
  type J = { id: number; title: string; location?: { name?: string }; absolute_url: string; content?: string; updated_at?: string; first_published?: string }
  const { jobs } = await get<{ jobs: J[] }>(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`)
  return jobs
    .filter((j) => ID_LOC.test(j.location?.name ?? '') && isDataTitle(j.title))
    .map((j) => ({
      source: 'greenhouse', source_job_id: `${c.slug}:${j.id}`, company: c.name, title: j.title, location: j.location?.name ?? null,
      url: j.absolute_url, description: plain(j.content), description_read: true, posted_at: j.first_published ?? j.updated_at ?? null,
    }))
}

async function lever(c: Company): Promise<Lead[]> {
  type J = {
    id: string; text: string; hostedUrl: string; createdAt?: number; descriptionPlain?: string; additionalPlain?: string
    lists?: { text: string; content: string }[]; categories?: { location?: string; allLocations?: string[]; commitment?: string }
    salaryRange?: { min?: number; max?: number; currency?: string } | null
  }
  const jobs = await get<J[]>(`https://api.lever.co/v0/postings/${c.slug}?mode=json`)
  return jobs
    .filter((j) => ID_LOC.test([j.categories?.location, ...(j.categories?.allLocations ?? [])].join(' ')) && isDataTitle(j.text))
    .map((j) => {
      const idr = j.salaryRange?.currency === 'IDR'
      return {
        source: 'lever', source_job_id: `${c.slug}:${j.id}`, company: c.name, title: j.text, location: j.categories?.location ?? null,
        url: j.hostedUrl, posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null, description_read: true,
        description: [j.descriptionPlain, ...(j.lists ?? []).map((l) => `${l.text}\n${plain(l.content)}`), j.additionalPlain].filter(Boolean).join('\n\n'),
        employment_type: j.categories?.commitment ?? null,
        salary_min: idr ? (j.salaryRange?.min ?? null) : null, salary_max: idr ? (j.salaryRange?.max ?? null) : null,
      }
    })
}

async function ashby(c: Company): Promise<Lead[]> {
  type J = {
    id: string; title: string; location?: string; secondaryLocations?: { location: string }[]; jobUrl: string; descriptionPlain?: string
    publishedAt?: string; employmentType?: string; isListed?: boolean; address?: { postalAddress?: { addressCountry?: string } }
  }
  const { jobs } = await get<{ jobs: J[] }>(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}`)
  return jobs
    .filter((j) => j.isListed !== false && isDataTitle(j.title) &&
      ID_LOC.test([j.location, ...(j.secondaryLocations ?? []).map((l) => l.location), j.address?.postalAddress?.addressCountry].join(' ')))
    .map((j) => ({
      source: 'ashby', source_job_id: `${c.slug}:${j.id}`, company: c.name, title: j.title, location: j.location ?? null, url: j.jobUrl,
      description: j.descriptionPlain ?? '', description_read: !!j.descriptionPlain, posted_at: j.publishedAt ?? null, employment_type: j.employmentType ?? null,
    }))
}

async function workable(c: Company): Promise<Lead[]> {
  type J = { title: string; shortcode: string; city?: string; country?: string; url: string; published_on?: string; employment_type?: string; locations?: { city?: string; country?: string }[] }
  const { jobs } = await get<{ jobs: J[] }>(`https://apply.workable.com/api/v1/widget/accounts/${c.slug}`)
  const mine = jobs.filter((j) => isDataTitle(j.title) && ID_LOC.test([j.city, j.country, ...(j.locations ?? []).map((l) => `${l.city} ${l.country}`)].join(' ')))
  const out: Lead[] = []
  for (const j of mine) {
    // The list has no description; the posting itself does
    const d = await get<{ description?: string; requirements?: string; benefits?: string }>(
      `https://apply.workable.com/api/v2/accounts/${c.slug}/jobs/${j.shortcode}`,
    ).catch(() => null)
    out.push({
      source: 'workable', source_job_id: `${c.slug}:${j.shortcode}`, company: c.name, title: j.title, location: [j.city, j.country].filter(Boolean).join(', ') || null,
      url: j.url, posted_at: j.published_on ?? null, employment_type: j.employment_type ?? null,
      description: d ? plain([d.description, d.requirements, d.benefits].filter(Boolean).join('\n')) : '', description_read: !!d,
    })
    await sleep(300)
  }
  return out
}

async function smartrecruiters(c: Company): Promise<Lead[]> {
  type P = { id: string; name: string; releasedDate?: string; location?: { city?: string; region?: string; country?: string }; typeOfEmployment?: { label?: string } }
  const list: P[] = []
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await get<{ content: P[]; totalFound: number }>(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100&offset=${offset}`)
    list.push(...page.content)
    if (list.length >= page.totalFound || !page.content.length) break
    await sleep(300)
  }
  const mine = list.filter((p) => isDataTitle(p.name) && (p.location?.country === 'id' || ID_LOC.test([p.location?.city, p.location?.region].join(' '))))
  const out: Lead[] = []
  for (const p of mine) {
    type D = { postingUrl?: string; applyUrl?: string; jobAd?: { sections?: Record<string, { text?: string }> } }
    const d = await get<D>(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings/${p.id}`).catch(() => null)
    const s = d?.jobAd?.sections ?? {}
    out.push({
      source: 'smartrecruiters', source_job_id: `${c.slug}:${p.id}`, company: c.name, title: p.name,
      location: [p.location?.city, p.location?.region].filter(Boolean).join(', ') || 'Indonesia',
      url: d?.postingUrl ?? `https://jobs.smartrecruiters.com/${c.slug}/${p.id}`, posted_at: p.releasedDate ?? null,
      employment_type: p.typeOfEmployment?.label ?? null, description_read: !!d,
      description: plain([s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].filter(Boolean).join('\n')),
    })
    await sleep(300)
  }
  return out
}

export const BOARDS: Record<string, (c: Company) => Promise<Lead[]>> = { greenhouse, lever, ashby, workable, smartrecruiters }

// ---------------------------------------------------------------------------
// Job-alert emails. Cards give title, company, location (and sometimes pay); the rules run on those.

export type Mail = { id: string; from: string; subject: string; date: string; body: string }

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const isNoise = (s: string) => /^(apply with|view job|\d+ school alumni|\d+ connections?|actively recruiting|be an early applicant|promoted|easy apply|logo|new)\b/i.test(s)
/** Stable id for cards whose link is a tracking redirect */
const cardId = (title: string, company: string) => `${company}|${title}`.toLowerCase().replace(/[^a-z0-9|]+/g, '-')

function linkedin(m: Mail): Lead[] {
  const out: Lead[] = []
  for (const block of m.body.split(/\n-{10,}\n/)) {
    const view = /jobs\/view\/(\d+)/.exec(block)
    if (!view) continue
    // Only what comes before the link: the first card also carries the email's header lines above it
    const before = block.slice(0, view.index).split('\n').map(clean)
    const lines = before.filter((l) => l && !/^View job:|^https?:/.test(l) && !isNoise(l) && !/^your job alert|new jobs? match|^\d+ new jobs?\b/i.test(l))
    const [title, company, location] = lines.length >= 3 ? lines.slice(-3) : lines
    if (!title || !company) continue
    out.push({
      source: 'linkedin', source_job_id: view[1], title, company, location: location ?? null, url: `https://www.linkedin.com/jobs/view/${view[1]}/`,
      description: null, description_read: false, posted_at: m.date,
    })
  }
  return out
}

function jobstreet(m: Mail): Lead[] {
  // Cards: "logo [link]  Title / Company  Location / (Rp pay)  [link]" (job alerts and "similar jobs" lists)
  const out: Lead[] = []
  const re = /logo\s*\n\s*\[(https?:[^\]]+)\]\s*\n\s*\n([^\n[]+)\n([^\n[]+)\n\s*\n([^\n[]+)\n(?:(Rp[^\n]*)\n)?/g
  for (const c of m.body.matchAll(re)) {
    const [title, company, location, pay] = [clean(c[2]), clean(c[3]), clean(c[4]), c[5] ? clean(c[5]) : '']
    if (!title || !company) continue
    const salary = pay ? parseSalary(pay) : { min: null, max: null }
    out.push({
      source: 'jobstreet', source_job_id: cardId(title, company), title, company, location, url: c[1],
      salary_min: salary.min, salary_max: salary.max, description: null, description_read: false, posted_at: m.date,
    })
  }
  return out
}

function glints(m: Mail): Lead[] {
  // No Glints alert seen yet: take any job link with the lines just before it, and refine once a real email arrives
  const out: Lead[] = []
  for (const c of m.body.matchAll(/((?:[^\n]+\n){1,4})[^\n]*(https?:\/\/glints\.com\/[a-z]{2}\/opportunities\/jobs\/[^\s\]]+)/g)) {
    const lines = c[1].split('\n').map(clean).filter((l) => l && !isNoise(l) && !/^https?:/.test(l))
    const [title, company, location] = lines.slice(-3)
    const id = /jobs\/[^/]+\/([0-9a-f-]{36})/.exec(c[2])?.[1] ?? c[2]
    if (title && company) out.push({ source: 'glints', source_job_id: id, title, company, location: location ?? null, url: c[2], description: null, description_read: false, posted_at: m.date })
  }
  return out
}

export function fromEmail(m: Mail): Lead[] {
  const from = m.from.toLowerCase()
  const leads = from.includes('linkedin.com') ? linkedin(m) : from.includes('jobstreet') ? jobstreet(m) : from.includes('glints') ? glints(m) : []
  return leads.filter((l) => isDataTitle(l.title))
}



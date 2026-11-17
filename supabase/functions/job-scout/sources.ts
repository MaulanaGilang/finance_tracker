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

export type Lead = Job & {
  source: string
  source_job_id: string
  url: string | null
  posted_at: string | null
  description_read: boolean
  /** From an alert email: posted_at is only the email's date until the job page confirms the real one */
  date_from_email?: boolean
  /** JobStreet marked the card "Baru diposting" (newly posted) */
  listed_new?: boolean
}

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
      description: null, description_read: false, posted_at: m.date, date_from_email: true,
    })
  }
  return out
}

// "Kandidat yang sangat kuat", "Kamu kandidat kuat": JobStreet's match badge, not the location
const JS_BADGE = /kandidat|candidate/i
const JS_LINK = /^\[(https?:[^\]]+)\]$/

function jobstreet(m: Mail): Lead[] {
  // Each card (job alerts and the "similar jobs" lists in application emails):
  //   logo / [logo link] / Title / Company / (match badge) / Location / (Rp pay) / (perks) / (Baru diposting) / [job link]
  // The first link only opens the company logo; the job is the second one.
  const out: Lead[] = []
  for (const chunk of m.body.split(/\n\s*logo\s*\n/).slice(1)) {
    const lines = chunk.split('\n').map(clean).filter(Boolean)
    const links = lines.map((l, i) => ({ i, url: JS_LINK.exec(l)?.[1] })).filter((x) => x.url)
    if (links.length < 2) continue
    const [logo, job] = links
    const text = lines.slice(logo.i + 1, job.i).filter((l) => !/^https?:/.test(l))
    const [title, company, ...rest] = text
    if (!title || !company) continue
    const details = rest.filter((l) => !JS_BADGE.test(l) && !l.startsWith('* ') && !/^\*/.test(l))
    const location = details.find((l) => !/^Rp\b|baru diposting|gaji profil/i.test(l)) ?? null
    const pay = details.find((l) => /^Rp\b/.test(l))
    const salary = pay ? parseSalary(pay) : { min: null, max: null }
    out.push({
      // Stand-in id until the job page gives the real one (verifyLeads)
      source: 'jobstreet', source_job_id: cardId(title, company), title, company, location, url: job.url!,
      salary_min: salary.min, salary_max: salary.max, description: null, description_read: false,
      posted_at: m.date, date_from_email: true, listed_new: rest.some((l) => /baru diposting/i.test(l)),
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

// ---------------------------------------------------------------------------
// Job pages, read without logging in. An alert email's date says nothing about when the job was posted
// (a "similar jobs" list can carry a month-old job), so each job's own page gives the real date,
// whether it's still open, and its full text for the rules.

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
}
const page = (url: string) => fetch(url, { headers: BROWSER, redirect: 'follow', signal: AbortSignal.timeout(15000) })

type Checked = { lead: Lead; verdict: 'ok' | 'old' | 'closed' | 'unknown' }

/** JobStreet: the email's tracking link leads to the job page, which has the exact listing time */
async function checkJobstreet(l: Lead): Promise<Lead | 'closed' | null> {
  const res = await page(l.url!)
  const id = /jobstreet\.com\/(?:[a-z]{2}\/)?job\/(\d+)/.exec(res.url)?.[1]
  if (!id) {
    await res.body?.cancel()
    return null
  }
  const clean = `https://id.jobstreet.com/id/job/${id}`
  const found = { ...l, source_job_id: id, url: clean }
  if (!res.ok) return found
  const html = await res.text()
  if (/"isExpired":true|"status":"Expired"/.test(html)) return 'closed'
  const listed = /"listedAt":\{[^}]*?"dateTimeUtc":"([^"]+)"/.exec(html)?.[1]
  // The job text block runs until the page's next marked section
  const start = html.indexOf('data-automation="jobAdDetails"')
  const end = start >= 0 ? html.indexOf('data-automation=', start + 40) : -1
  const body = start >= 0 ? html.slice(start, end > start ? end : start + 30000) : ''
  const description = plain(body.replace(/^[^>]*>/, ''))
  return {
    ...found,
    ...(listed && { posted_at: listed, date_from_email: false }),
    ...(description.length > 80 && { description, description_read: true }),
  }
}

/** LinkedIn's public job page: "4 days ago" style posting time */
async function checkLinkedin(l: Lead): Promise<Lead | 'closed' | null> {
  const res = await page(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${l.source_job_id}`)
  if (!res.ok) {
    await res.body?.cancel()
    return null
  }
  const html = await res.text()
  if (/no longer accepting applications/i.test(html)) return 'closed'
  const ago = /posted-time-ago__text[^>]*>\s*([^<]+)/.exec(html)?.[1]?.trim() ?? ''
  const m = /(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/i.exec(ago)
  const unit = { minute: 6e4, hour: 3.6e6, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 }[m?.[2].toLowerCase() as 'day']
  const posted = m && unit ? new Date(Date.now() - Number(m[1]) * unit).toISOString() : /just now|moments? ago/i.test(ago) ? new Date().toISOString() : null
  const description = plain(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1])
  return {
    ...l,
    ...(posted && { posted_at: posted, date_from_email: false }),
    ...(description.length > 80 && { description, description_read: true }),
  }
}

/**
 * Open each emailed job's own page (a few at a time) and sort by posting date:
 * ok = posted since `since`; old; closed; unknown = the page couldn't confirm a date.
 * A JobStreet card marked "Baru diposting" counts as new even if its page can't be read.
 */
export async function verifyLeads(leads: Lead[], since: number): Promise<Checked[]> {
  const out: Checked[] = []
  const queue = [...leads]
  const worker = async () => {
    for (let l = queue.shift(); l; l = queue.shift()) {
      let r: Lead | 'closed' | null = null
      try {
        r = l.source === 'jobstreet' ? await checkJobstreet(l) : l.source === 'linkedin' ? await checkLinkedin(l) : l
      } catch (e) {
        console.error('verify', l.source, l.title, String(e))
      }
      if (r === 'closed') {
        out.push({ lead: l, verdict: 'closed' })
        continue
      }
      const lead = r ?? l
      const confirmed = !lead.date_from_email && lead.posted_at
      const verdict = confirmed
        ? Date.parse(lead.posted_at!) >= since ? 'ok' : 'old'
        : lead.listed_new ? 'ok' : lead.source === 'glints' ? 'ok' : 'unknown'
      out.push({ lead, verdict })
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker))
  return out
}



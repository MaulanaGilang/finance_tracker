import type { Category, Transaction } from './api'
import type { CompanyReview, Job, JobCategory, JobFlexibility, JobInput, JobStatus, JobUpdate } from './jobs'
import { STATUS } from './jobs'
import type { JobLead } from './leads'
import type { Manga, MangaInput } from './manga'
import type { NewsArticle } from './news'
import { addMonths, currentMonth } from './format'

/** Dev-only: http://localhost:5173/?demo renders the app on in-memory sample data, no network. */
export const isDemo = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')

const cat = (id: string, name: string, type: Category['type'], color: string): Category => ({
  id,
  name,
  type,
  color,
  created_at: '2026-01-01T00:00:00Z',
})

export const demoCategories: Category[] = [
  cat('salary', 'Salary', 'income', '#2F7A55'),
  cat('freelance', 'Freelance', 'income', '#4E9470'),
  cat('food', 'Food & Beverages', 'expense', '#D9734E'),
  cat('transport', 'Transport', 'expense', '#3F7FB0'),
  cat('bills', 'Bills', 'expense', '#5B6B8C'),
  cat('shopping', 'Shopping', 'expense', '#B5577A'),
  cat('fun', 'Entertainment', 'expense', '#8A4F9E'),
  cat('health', 'Health', 'expense', '#B5483B'),
]

export function demoTransactions(): Transaction[] {
  const now = currentMonth()
  const rows: [number, Transaction['type'], number, string, string | null][] = [
    // [monthsAgo, type, amount, categoryId, note]
    [5, 'income', 9500000, 'salary', null], [5, 'expense', 4150000, 'food', null], [5, 'expense', 1800000, 'bills', 'Rent share'],
    [4, 'income', 9500000, 'salary', null], [4, 'expense', 4600000, 'food', null], [4, 'expense', 1250000, 'shopping', 'Shoes'], [4, 'expense', 1800000, 'bills', 'Rent share'],
    [3, 'income', 9500000, 'salary', null], [3, 'expense', 5300000, 'food', null], [3, 'expense', 1800000, 'bills', 'Rent share'],
    [2, 'income', 9500000, 'salary', null], [2, 'income', 1750000, 'freelance', 'Logo project'], [2, 'expense', 4450000, 'food', null], [2, 'expense', 900000, 'fun', 'Concert'], [2, 'expense', 1800000, 'bills', 'Rent share'],
    [1, 'income', 9500000, 'salary', null], [1, 'expense', 3900000, 'food', null], [1, 'expense', 6100000, 'bills', 'Rent + utilities'], [1, 'expense', 480000, 'health', 'Dentist'],
    [0, 'income', 2400000, 'freelance', 'Landing page'], [0, 'expense', 1800000, 'bills', 'Rent share'], [0, 'expense', 38000, 'transport', 'Gojek'],
    [0, 'expense', 245000, 'shopping', 'Groceries'], [0, 'expense', 120000, 'fun', 'Movie'], [0, 'expense', 85000, 'food', 'Lunch'],
  ]
  return rows
    .map(([ago, type, amount, category_id, note], i) => {
      const day = ago === 0 ? Math.min(5, 1 + (i % 5)) : 3 + ((i * 7) % 24)
      const date = `${addMonths(now, -ago)}-${String(day).padStart(2, '0')}`
      return { id: `demo-${i}`, type, amount, category_id, date, note, created_at: `${date}T12:00:00Z` }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Fictional applications covering every status, so the Jobs screens can be checked without real data. */
export function demoJobs(): Job[] {
  const day = 864e5
  const rows: [string, string, string, JobCategory, JobFlexibility, JobStatus, string, number | null, number | null, number, number][] = [
    // position, company, location, category, flex, status, platform, salMin, salMax, appliedDaysAgo, statusDaysAgo
    ['Data Engineer', 'Kirana Logistik', 'Jakarta Selatan', 'full_time', 'hybrid', 'user_interview', 'LinkedIn', 9e6, 12e6, 30, 2],
    ['Analytics Engineer', 'Sagara Pay', 'Jakarta Pusat', 'full_time', 'remote', 'offer', 'Glints', 11e6, 14e6, 41, 1],
    ['Junior Data Engineer', 'Lumbung Tani', 'Bandung', 'contract', 'onsite', 'test', 'Glints', 6e6, 8e6, 16, 4],
    ['Data Engineer', 'Arunika Health', 'Jakarta Barat', 'full_time', 'onsite', 'hr_interview', 'Kalibrr', null, null, 12, 3],
    ['BI Engineer', 'Pelita Retail', 'Tangerang', 'contract', 'onsite', 'applied', 'LinkedIn', 7e6, 9e6, 12, 12],
    ['Data Engineer', 'Nusa Mobility', 'Jakarta Selatan', 'full_time', 'hybrid', 'applied', 'Dealls', null, null, 11, 11],
    ['ETL Developer', 'Banyu Energi', 'Bekasi', 'contract', 'onsite', 'applied', 'Glints', 5.5e6, 7e6, 4, 4],
    ['Data Platform Engineer', 'Rimba Cloud', 'Jakarta Pusat', 'full_time', 'remote', 'applied', 'LinkedIn', 12e6, 16e6, 2, 2],
    ['Data Engineer', 'Selaras Insurance', 'Jakarta Pusat', 'full_time', 'onsite', 'rejected', 'LinkedIn', 8e6, 10e6, 25, 9],
    ['Big Data Engineer', 'Cakra Telco', 'Jakarta Timur', 'full_time', 'onsite', 'ghosted', 'Indeed', null, null, 33, 5],
    ['Data Engineer Intern', 'Teras Edu', 'Depok', 'part_time', 'remote', 'medical_checkup', 'Instagram', 4e6, 5e6, 27, 1],
    ['Data Engineer', 'Kenari Media', 'Jakarta Selatan', 'contract', 'onsite', 'other', 'Kalibrr', null, null, 9, 6],
  ]
  const iso = (ago: number) => new Date(Date.now() - ago * day).toISOString()
  return rows.map(([position, company, location, category, flexibility, status, platform, salary_min, salary_max, applied, changed], i) => ({
    id: `demo-job-${i}`,
    position,
    company,
    location,
    category,
    flexibility,
    status,
    platform,
    link: 'https://example.com',
    salary_min,
    salary_max,
    applied_date: iso(applied).slice(0, 10),
    status_changed_at: iso(changed),
    auto_ghosted: status === 'ghosted',
    max_stage: status === 'rejected' ? 1 : (STATUS[status].stage ?? 0),
    notes: null,
    created_at: iso(applied),
    updated_at: iso(changed),
  }))
}

/** Updates from recruiting emails, matching the demo applications above (and one that isn't in the list) */
export function demoJobUpdates(): JobUpdate[] {
  const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString()
  const u = (id: string, h: number, sender: string, subject: string, kind: JobUpdate['kind'], job: number | null, prev: JobStatus | null, guess: [string, string] | null): JobUpdate => {
    const j = job === null ? null : demoJobs()[job]
    return {
      id, received_at: ago(h), sender, subject, kind, evidence: null, job_id: j?.id ?? null, outcome: j ? 'updated' : 'unmatched', prev_status: prev,
      company: j?.company ?? null, position: j?.position ?? null, status: j?.status ?? null,
      guessed_company: guess?.[0] ?? null, guessed_position: guess?.[1] ?? null,
    }
  }
  return [
    u('upd-1', 5, 'Kirana Logistik <talent@kiranalogistik.co.id>', 'Undangan Interview User - Data Engineer', 'user_interview', 0, 'test', null),
    u('upd-2', 30, 'Selaras Insurance <no-reply@hire.lever.co>', 'Thank you for your interest in Selaras Insurance', 'rejected', 8, 'applied', null),
    u('upd-3', 52, 'Admin Rekrutmen <talent.acquisition@megagiga.co.id>', 'Undangan Tahap Asesmen', 'test', null, null, ['Megagiga', 'Data Engineer']),
  ]
}

/** Demo mode only: apply a job save in memory, mirroring save_job's rules (clock reset, max stage). */
export function demoSaveJob(jobs: Job[], input: JobInput): Job {
  const now = new Date().toISOString()
  const prev = jobs.find((j) => j.id === input.id)
  const changed = !prev || prev.status !== input.status
  const stage = STATUS[input.status].stage ?? 0
  return {
    ...(prev ?? { id: `demo-job-${Date.now()}`, created_at: now, auto_ghosted: false, max_stage: 0 }),
    ...input,
    id: prev?.id ?? `demo-job-${Date.now()}`,
    location: input.location || null,
    platform: input.platform || null,
    link: input.link || null,
    notes: input.notes || null,
    status_changed_at: changed ? (prev ? now : new Date(input.applied_date + 'T00:00:00').toISOString()) : prev!.status_changed_at,
    auto_ghosted: changed ? false : prev!.auto_ghosted,
    max_stage: Math.max(prev?.max_stage ?? 0, stage),
    updated_at: now,
  } as Job
}

/** Fictional reviews for demo companies: one rich, one "nothing found" */
export function demoReviews(): CompanyReview[] {
  return [
    {
      company_key: 'kirana logistik', aliases: [], display_name: 'Kirana Logistik', rating: 4.2, rating_source: 'JobStreet', review_count: 87, recommend_pct: 81,
      pros: ['Supportive team leads', 'Good training for new hires', 'Clear overtime pay'], cons: ['Slow promotions', 'Busy peak seasons'],
      notes: 'Fictional demo data.', sources: [{ label: 'Example source', url: 'https://example.com' }], researched_at: '2026-10-12',
    },
    {
      company_key: 'cakra telco', aliases: [], display_name: 'Cakra Telco', rating: null, rating_source: null, review_count: null, recommend_pct: null,
      pros: [], cons: [], notes: 'No reliable reviews found (demo).', sources: [], researched_at: '2026-10-12',
    },
  ]
}

/** Fictional demo headlines across topics (never shown with real data) */
export function demoNews(): NewsArticle[] {
  const h = 3600e3
  const rows: [string, string, NewsArticle['topics'], number, number, string | null][] = [
    ['Central bank holds rates as inflation cools faster than expected', 'Demo Wire', ['central_banks'], 2, 5, 'Policymakers signalled cuts could come next quarter as price growth eased.'],
    ['Chipmaker shares jump on surging AI server demand', 'Demo Markets', ['semiconductors', 'ai'], 3, 4, 'Orders for high-bandwidth memory doubled year on year.'],
    ['US tariffs on Chinese steel spark retaliation threats from Beijing', 'Demo Wire', ['trade', 'geopolitics'], 5, 6, 'Trading partners in the EU and Mexico warned of countermeasures on agricultural exports.'],
    ['Humanoid robot startup raises funding for factory pilots', 'Demo Tech', ['robotics'], 7, 1, 'The company plans pilots with two automotive suppliers.'],
    ['Oil climbs as supply talks stall', 'Demo Energy', ['energy', 'geopolitics'], 9, 4, 'Brent crude rose as producers failed to agree on output.'],
    ['Open-source AI model rivals larger systems on benchmarks', 'Demo Tech', ['ai'], 12, 0, null],
    ['Nickel prices slide on Indonesian output surge', 'Demo Markets', ['energy', 'trade'], 20, 3, 'Higher smelter output added to an already oversupplied market.'],
    ['Japan, the Philippines and Australia meet to ease tensions over shipping lanes', 'Demo Wire', ['geopolitics'], 30, 2, 'Insurers have raised premiums for vessels crossing the strait.'],
    ['UK growth upgraded but energy prices and rates to bite next year', 'Demo Wire', ['energy', 'central_banks'], 34, 4, 'The forecast was raised for this year.'],
    ['Norway and Russia agree Arctic fishing quotas', 'Demo Wire', ['geopolitics'], 40, 1, 'The deal covers cod in the Barents Sea.'],
    ['Chile and Vietnam sign copper supply pact', 'Demo Markets', ['energy', 'trade'], 44, 3, 'The agreement runs for five years.'],
    ['Italy pushes the EU for looser deficit rules', 'Demo Wire', ['central_banks'], 50, 3, 'Rome wants more room for defence spending.'],
    ['Yemen talks resume as Red Sea shipping slowly returns', 'Demo Wire', ['geopolitics', 'trade'], 56, 2, 'Envoys met in Muscat over the weekend.'],
  ]
  return rows.map(([title, source, topics, hoursAgo, market_score, summary], i) => ({
    id: i + 1, url: 'https://example.com/' + i, title, summary, source, image_url: null,
    published_at: new Date(Date.now() - hoursAgo * h).toISOString(), topics, market_score, saved: i === 1, fetched_at: new Date().toISOString(),
    key_points: i === 5 ? null : [
      `${title}.`,
      'Analysts said the move had been widely expected, but the size of the change surprised some investors.',
      'Markets in Asia reacted first, with currencies and bond yields moving within minutes of the announcement.',
      'Officials signalled that further steps would depend on data released over the coming weeks.',
    ],
    // Longer demo read, grouped into paragraphs like the Edge Function's brief
    brief: i === 5 ? null : [
      `${summary ?? title} Analysts said the move had been widely expected, but the size of the change surprised some investors.`,
      'Markets in Asia reacted first, with currencies and bond yields moving within minutes of the announcement. Traders said volumes were well above the monthly average, and several desks reported widening spreads in the first hour.',
      'Officials signalled that further steps would depend on data released over the coming weeks. Economists expect the next set of figures to show whether the shift is lasting or a one-off.',
    ],
    word_count: 640 + i * 90,
    details_status: i === 5 ? 'failed' : 'ok',
  }))
}

// ---------------------------------------------------------------------------
// Job scout: fictional recommendations, one per tier and source

export function demoLeads(): JobLead[] {
  const h = 3600e3
  const row = (id: string, o: Partial<JobLead>): JobLead => ({
    id: `demo-lead-${id}`, source: 'linkedin', source_job_id: id, company: 'Demo Co', title: 'Data Analyst', location: 'Jakarta',
    url: 'https://example.com/', description_read: true, salary_min: null, salary_max: null, employment_type: null, posted_at: null,
    tier: 'apply', score: 2, note: null, flags: [], reasons: [], status: 'new', first_seen_at: new Date(Date.now() - 4 * h).toISOString(), ...o,
  })
  return [
    row('1', { title: 'Junior Data Engineer', company: 'Kirana Logistik', source: 'greenhouse', tier: 'first', score: 10, note: 'Main tools: SQL, Python, Airflow, BigQuery.', flags: ['Stretch: asks 2 years.'] }),
    row('2', { title: 'Data Analyst', company: 'Sinar Retail', source: 'jobstreet', tier: 'apply', score: 3, salary_min: 9e6, salary_max: 12e6, note: 'Main tools: SQL, Power BI.' }),
    row('3', { title: 'Business Intelligence Analyst', company: 'Nusantara Foods', source: 'linkedin', tier: 'maybe', score: 0, description_read: false, note: 'Judged from the title only.', flags: ['Only the title was seen: open it to check the details.'], first_seen_at: new Date(Date.now() - 30 * h).toISOString() }),
    row('4', { title: 'Data Engineer - 6 Months Contract', company: 'Demo Staffing', source: 'jobstreet', tier: 'skip', score: 0, description_read: false, salary_min: 25e6, salary_max: 30e6, flags: ['Outsourcing company.'], note: 'Skipped: Outsourcing company (Demo Staffing).' }),
    row('5', { title: 'Junior Data Analyst', company: 'Demo Multifinance', source: 'jobstreet', tier: 'skip', score: 0, description_read: false, note: 'Skipped: Interest-based business (bank / lending) (Demo Multifinance).', flags: ['Interest-based business (bank / lending).'] }),
  ]
}

// ---------------------------------------------------------------------------
// Manga: a few public series, in each state the pages have to handle

/** A plain placeholder cover, so the hover preview can be tried without any network */
const DEMO_COVER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="364"><rect width="256" height="364" fill="#7f4d12"/><rect x="18" y="18" width="220" height="328" fill="none" stroke="#f3e5d2" stroke-width="3"/><text x="128" y="190" fill="#f3e5d2" font-family="sans-serif" font-size="22" text-anchor="middle">Demo cover</text></svg>',
  )

export function demoManga(): Manga[] {
  const now = Date.now()
  const day = 864e5
  const row = (id: string, title: string, o: Partial<Manga>): Manga => ({
    id: `demo-manga-${id}`,
    title,
    status: 'reading',
    last_read: null,
    link: null,
    notes: null,
    mangadex_id: null,
    mu_id: null,
    matched_title: title,
    match_locked: false,
    latest_chapter: null,
    latest_source: null,
    latest_url: null,
    series_status: 'ongoing',
    check_status: 'ok',
    checked_at: new Date(now - 2 * day).toISOString(),
    skip_check: false,
    cover_url: null,
    cover_checked_at: null,
    created_at: new Date(now - 90 * day).toISOString(),
    updated_at: new Date(now - 3 * day).toISOString(),
    ...o,
  })
  return [
    row('1', 'Kaiju No. 8', { last_read: 100, latest_chapter: 129, series_status: 'completed', latest_source: 'mangaupdates', mu_id: '1', latest_url: 'https://www.mangaupdates.com/', cover_url: DEMO_COVER }),
    row('2', 'Juujika no Rokunin', { last_read: 128, latest_chapter: 232, latest_source: 'mangadex', mangadex_id: 'x', series_status: 'completed', latest_url: 'https://mangadex.org/' }),
    row('3', 'Kaette Kudasai! Akutsu-san', { last_read: 100, latest_chapter: 100, latest_source: 'mangadex', mangadex_id: 'y' }),
    row('4', 'The Beginning After the End', { last_read: 143, latest_chapter: 143.5, latest_source: 'mangadex', mangadex_id: 'z', series_status: 'hiatus' }),
    row('5', 'kuroiwa medaka ni watashi', { matched_title: null, check_status: 'not_found', series_status: null, skip_check: true }),
    row('9', 'Oh, Those Hanazono Twins', { last_read: 51, latest_chapter: 47, latest_source: 'mangaupdates', series_status: 'completed', skip_check: true }),
    row('6', 'Isekai kara Elf-san ga Ochite Kita no desu ga!?', { last_read: 12, check_status: 'pending', checked_at: null, matched_title: null, series_status: null }),
    row('7', 'Solo Leveling', { status: 'completed', series_status: null, check_status: 'pending', checked_at: null, matched_title: null }),
    row('8', 'Paperbag-kun is in Love', { status: 'completed', series_status: null, check_status: 'pending', checked_at: null, matched_title: null }),
  ]
}

/** Demo mode only: apply a manga save in memory */
export function demoSaveManga(list: Manga[], input: MangaInput): Manga {
  const prev = list.find((m) => m.id === input.id)
  return {
    ...(prev ?? demoManga()[5]),
    ...input,
    id: prev?.id ?? `demo-manga-${Date.now()}`,
    link: input.link || null,
    notes: input.notes || null,
    mangadex_id: input.mangadex_id !== undefined ? input.mangadex_id : (prev?.mangadex_id ?? null),
    mu_id: input.mu_id !== undefined ? input.mu_id : (prev?.mu_id ?? null),
    matched_title: input.matched_title !== undefined ? input.matched_title : (prev?.matched_title ?? null),
    match_locked: input.match_locked ?? prev?.match_locked ?? false,
    skip_check: input.mangadex_id !== undefined || input.mu_id !== undefined ? false : (input.skip_check ?? prev?.skip_check ?? false),
    updated_at: new Date().toISOString(),
  } as Manga
}

// Your job rules, carried over from jobfinder/rules.yaml + judge.py so both judge the same way.
// Order: hard rules (any hit -> skip), soft rules (flags, some cap the tier), data-engineering score, tier, note.

export type Job = {
  title: string
  company: string
  location?: string | null
  description?: string | null
  salary_min?: number | null
  salary_max?: number | null
  employment_type?: string | null
  industry?: string | null
}

export type Verdict = {
  tier: 'first' | 'apply' | 'maybe' | 'skip'
  score: number
  note: string
  flags: string[]
  reasons: { rule: string; match: string }[]
}

export const RULES = {
  // Titles worth looking at at all (anything else isn't stored)
  data_titles: ['data', 'analyst', 'analytics', 'analis', 'intelligence', 'bi', 'reporting', 'insight', 'insights', 'etl', 'sql'],
  hard: {
    interest_based: ['bank', 'banking', 'perbankan', 'multifinance', 'multi finance', 'leasing', 'pinjaman', 'pinjol', 'p2p', 'peer-to-peer lending',
      'paylater', 'pay later', 'kredit', 'kartu kredit', 'credit card', 'pembiayaan', 'consumer financing', 'auto financing',
      'lending', 'gadai', 'pegadaian', 'koperasi simpan pinjam', 'fintech lending'],
    lending_team: ['lending operations', 'lending team', 'tim lending', 'loan operations', 'lending product', 'credit operations', 'collection team'],
    max_experience_years: 3,
    min_salary_max: 7_000_000,
    senior_titles: ['senior', 'sr', 'lead', 'manager', 'head', 'principal', 'director', 'vp', 'vice president', 'chief', 'supervisor', 'kepala'],
    not_data_titles: ['erp', 'sap', 'odoo', 'functional consultant', 'system analyst', 'systems analyst', 'it support', 'helpdesk', 'help desk',
      'technical support', 'network', 'hr', 'human resource', 'recruiter', 'recruitment', 'talent acquisition', 'sales',
      'business development', 'account executive', 'account manager', 'legal', 'compliance', 'accounting', 'accountant',
      'tax', 'market research', 'customer service', 'teller', 'collector'],
    rescue_min_score: 3,
    admin_titles: ['admin', 'administrasi', 'data entry', 'entry data', 'input data', 'staff input', 'operator'],
    admin_phrases: ['data entry', 'entry data', 'input data harian', 'rekap data', 'filing dokumen', 'pengarsipan'],
    trading: ['forex', 'foreign exchange', 'trading company', 'perusahaan trading', 'broker', 'client analyst', 'investment firm', 'crypto trading', 'futures'],
    ai_training: ['alignerr', 'ai trainer', 'ai training', 'train ai models', 'training ai', 'data annotation', 'data annotator', 'data labeling',
      'data labelling', 'rlhf', 'outlier ai', 'remotasks', 'dataannotation'],
    languages: ['japanese', 'jepang', 'mandarin', 'chinese', 'cina', 'korean', 'korea', 'thai', 'vietnamese', 'vietnam', 'german', 'jerman', 'french', 'perancis',
      'arabic', 'arab', 'spanish', 'spanyol', 'russian', 'rusia', 'hokkien', 'cantonese', 'jlpt', 'hsk', 'topik'],
    language_cues: ['fluent', 'fasih', 'menguasai', 'mahir', 'native', 'proficient', 'business level', 'required', 'wajib', 'lancar', 'mampu berbahasa'],
    fee: ['biaya pendaftaran', 'registration fee', 'biaya administrasi', 'uang jaminan', 'deposit', 'biaya pelatihan', 'training fee',
      'transfer sejumlah', 'membayar biaya', 'pay a fee', 'biaya seragam', 'uang muka'],
    // Outsourcing and staffing companies: you'd work for their client, not for them (skipped, like banks)
    outsourced_industries: ['staffing', 'recruiting', 'outsourcing', 'human resources services'],
    // In descriptions, only how agencies talk about their clients ("outsourcing" alone can be a real company's vendor work)
    outsourced_phrases: ['klien kami', 'our client', 'client kami', 'untuk klien', 'for our client', 'penempatan di', 'ditempatkan di',
      'on behalf of', 'salah satu klien', 'one of our clients', 'perusahaan klien', 'client company'],
    // By name, for job cards from emails (no description to read): known agencies, and words agencies put in their names
    outsourced_companies: ['adecco', 'randstad', 'manpower', 'manpowergroup', 'kelly services', 'hays', 'robert walters', 'michael page', 'persolkelly', 'persol',
      'gi group', 'experis', 'jac recruitment', 'kerja365', 'outsourcing', 'outsource', 'alih daya', 'alihdaya', 'staffing', 'personnel', 'manpower services',
      'recruitment', 'rekrutmen', 'talent solutions', 'hr solutions', 'human capital solutions', 'tenaga kerja', 'penyalur', 'job agency'],
  },
  soft: {
    stretch_years: 2,
    partner_lending_companies: ['bukuwarung'],
    partner_lending_phrases: ['mitra pinjaman', 'lending partner', 'partner lending', 'mitra pembiayaan', 'referral ke lender', 'refer users to lenders'],
    gender_age: ['pria', 'wanita', 'laki-laki', 'perempuan', 'male', 'female', 'usia maksimal', 'usia maks', 'max age', 'maximum age', 'umur maksimal', 'berusia', 'usia'],
    internship: ['intern', 'internship', 'magang', 'trainee'],
    wide_pay_ratio: 4,
  },
  score: {
    sql: { words: ['sql', 'mysql', 'postgresql', 'postgres', 't-sql', 'pl/sql', 'sql server'], points: 2 },
    python: { words: ['python', 'pandas', 'pyspark'], points: 2 },
    pipelines: { words: ['etl', 'elt', 'data pipeline', 'pipeline', 'pipelines', 'data integration', 'ssis', 'talend', 'informatica', 'pentaho'], points: 3 },
    warehouse: { words: ['data warehouse', 'datawarehouse', 'data modelling', 'data modeling', 'star schema', 'dimensional modeling', 'data lake', 'lakehouse', 'data mart'], points: 3 },
    cloud: { words: ['bigquery', 'snowflake', 'redshift', 'aws', 'gcp', 'google cloud', 'azure', 'databricks', 's3'], points: 2 },
    orchestration: { words: ['dbt', 'airflow', 'spark', 'kafka', 'dagster', 'prefect'], points: 3 },
    bi_tools: { words: ['power bi', 'powerbi', 'tableau', 'looker', 'metabase', 'superset', 'looker studio', 'data studio', 'qlik'], points: 1 },
    excel_only: { words: ['excel'], points: -2, only_if_alone: true },
  } as Record<string, { words: string[]; points: number; only_if_alone?: boolean }>,
  de_groups: ['python', 'pipelines', 'warehouse', 'cloud', 'orchestration'],
  caps_to_maybe: ['partner_lending', 'internship'],
}

// ---------------------------------------------------------------------------

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\? /g, '[\\s-]+')
const cache = new Map<string, RegExp>()
function pattern(words: string[]) {
  const key = words.join('|')
  let re = cache.get(key)
  if (!re) {
    const parts = [...words].sort((a, b) => b.length - a.length).map(esc)
    re = new RegExp(`(?<![\\p{L}\\p{N}_])(${parts.join('|')})(?![\\p{L}\\p{N}_])`, 'iu')
    cache.set(key, re)
  }
  return re
}

/** The first listed word/phrase in text (whole words, any case), with a little context */
export function find(words: string[], text: string | null | undefined): string | null {
  if (!text || !words.length) return null
  const m = pattern(words).exec(text)
  if (!m) return null
  const a = Math.max(0, m.index - 30)
  const b = Math.min(text.length, m.index + m[0].length + 30)
  return text.slice(a, b).replace(/\s+/g, ' ').trim()
}

/** Is this title worth storing at all? */
export const isDataTitle = (title: string) => !!find(RULES.data_titles, title)

// --- experience asked (Indonesian and English), as in jobfinder/normalise.py ------------------------------

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, setahun: 1,
}
const NUM = `(\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER_WORDS).join('|')})`
const UNIT = '(?:tahun|thn|th|years?|yrs?|yoe)'
const EXP_CONTEXT = /pengalaman|berpengalaman|experience|experienced|exp\b|yoe|working|bekerja|kerja/i
const AGE_CONTEXT = /usia|umur|age\b|aged|old\b|berusia|maks(imal)?\s*\d+\s*tahun\s*$/i
const toNum = (s: string) => (s.toLowerCase() in NUMBER_WORDS ? NUMBER_WORDS[s.toLowerCase()] : Number(s.replace(',', '.')))

export function experienceYears(text: string | null | undefined): number | null {
  if (!text) return null
  const t = text.normalize('NFKC').replace(/[–—]/g, '-')
  const found: number[] = []
  const re = new RegExp(
    `(?:minimal|minimum|min\\.?|at\\s+least|sekurang[- ]kurangnya|paling\\s+sedikit|lebih\\s+dari|more\\s+than|over)?\\s*${NUM}\\s*(?:\\(\\s*\\d+\\s*\\))?\\s*(\\+|plus)?\\s*(?:(?:-|to|sampai|s/d|hingga|atau|or)\\s*${NUM}\\s*)?${UNIT}`,
    'gi',
  )
  for (const line of t.split(/[\n\r]+|(?<=[.;])\s+|•|·/)) {
    if (!line.trim()) continue
    if (AGE_CONTEXT.test(line) && !EXP_CONTEXT.test(line)) continue
    for (const m of line.matchAll(re)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      if (!EXP_CONTEXT.test(line.slice(Math.max(0, start - 40), end + 40))) continue
      if (AGE_CONTEXT.test(line.slice(Math.max(0, start - 15), start)) || /^\s*(old|lama usia)/i.test(line.slice(end))) continue
      const n = toNum(m[1])
      if (!Number.isFinite(n) || n > 15) continue
      found.push(n)
    }
  }
  if (!found.length && /fresh\s*grad|lulusan\s+baru|tanpa\s+pengalaman|no\s+experience\s+(required|needed)/i.test(t)) return 0
  return found.length ? Math.min(...found) : null
}

// --- scoring and verdict ---------------------------------------------------------------------------------

function scoreJob(job: Job) {
  const text = [job.title, job.description ?? ''].join(' ')
  let points = 0
  const groups = new Set<string>()
  const tools: string[] = []
  for (const [name, spec] of Object.entries(RULES.score)) {
    if (spec.only_if_alone) continue
    const m = pattern(spec.words).exec(text)
    if (m) {
      points += spec.points
      groups.add(name)
      tools.push(m[1])
    }
  }
  for (const [name, spec] of Object.entries(RULES.score)) {
    const others = [...groups].filter((g) => g !== 'bi_tools')
    if (spec.only_if_alone && !others.length && pattern(spec.words).test(text)) {
      points += spec.points
      groups.add(name)
    }
  }
  return { points, groups, tools }
}

function languageRequirement(desc: string) {
  for (const sentence of desc.split(/(?<=[.!?\n])\s*/)) {
    const lang = find(RULES.hard.languages, sentence)
    if (lang && find(RULES.hard.language_cues, sentence)) return lang
  }
  return null
}

const SKIP_FLAGS: Record<string, string> = {
  interest_based: 'Interest-based business (bank / lending).',
  lending_team: 'Sits on a lending team.',
  too_much_experience: 'Asks 3+ years.',
  too_senior: 'Too senior.',
  low_pay: 'Pay below Rp 7 jt.',
  not_data_work: 'Not data work.',
  admin_work: 'Admin / data entry.',
  trading_firm: 'Trading / investment firm.',
  ai_training_gig: 'AI-training gig.',
  language: 'Needs another language.',
  fee_request: 'Asks you to pay a fee (scam pattern).',
  outsourced: 'Outsourcing company.',
}
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

export function judge(job: Job): Verdict {
  const { hard, soft } = RULES
  const reasons: { rule: string; match: string }[] = []
  const flags: string[] = []
  const fire = (rule: string, match: string | null) => reasons.push({ rule, match: match ?? '' })

  const desc = job.description ?? ''
  const everything = [job.title, job.company, job.industry ?? '', desc].join(' ')
  const { points, groups, tools } = scoreJob(job)
  const exp = experienceYears(desc)
  let m: string | null

  // --- hard rules ---
  const partner = find(soft.partner_lending_companies, job.company) ?? find(soft.partner_lending_phrases, desc)
  if ((m = find(hard.lending_team, [job.title, desc].join(' ')))) fire('lending_team', m)
  else if (!partner && (m = find(hard.interest_based, everything))) fire('interest_based', m)
  if (exp !== null && exp >= hard.max_experience_years) fire('too_much_experience', `asks ${exp} years`)
  if ((m = find(hard.senior_titles, job.title)) && !(m.toLowerCase().startsWith('supervisor') && (exp ?? 0) < 3)) fire('too_senior', job.title)
  if (job.salary_max != null && job.salary_max < hard.min_salary_max) fire('low_pay', `max ${rp(job.salary_max)}`)
  if (find(hard.not_data_titles, job.title) && points < hard.rescue_min_score) fire('not_data_work', job.title)
  const adminTitle = find(hard.admin_titles, job.title)
  const adminPhrase = find(hard.admin_phrases, desc)
  if ((adminTitle && points < hard.rescue_min_score) || (adminPhrase && !groups.has('sql'))) fire('admin_work', adminTitle ?? adminPhrase)
  if ((m = find(hard.trading, everything))) fire('trading_firm', m)
  if ((m = find(hard.ai_training, everything))) fire('ai_training_gig', m)
  if ((m = languageRequirement(desc))) fire('language', m)
  if ((m = find(hard.fee, desc))) fire('fee_request', m)
  if ((m = find(hard.outsourced_industries, job.industry) ?? find(hard.outsourced_companies, job.company) ?? find(hard.outsourced_phrases, desc)))
    fire('outsourced', m)

  if (reasons.length) {
    const note = 'Skipped: ' + reasons.slice(0, 2).map((r) => `${(SKIP_FLAGS[r.rule] ?? r.rule).replace(/\.$/, '')} (${r.match})`).join('; ') + '.'
    return { tier: 'skip', score: points, note, flags: [SKIP_FLAGS[reasons[0].rule] ?? 'Skipped.'], reasons }
  }

  // --- soft rules ---
  const caps = new Set<string>()
  if (exp !== null && exp >= soft.stretch_years) {
    flags.push(`Stretch: asks ${exp} years.`)
    fire('stretch', `asks ${exp} years`)
  }
  if (partner) {
    flags.push('Partner lending: refers users to lenders.')
    fire('partner_lending', partner)
    caps.add('partner_lending')
  }
  if ((m = find(soft.gender_age, desc))) {
    flags.push('Gender or age limit.')
    fire('gender_age', m)
  }
  const intern = find(soft.internship, job.title) ?? (job.employment_type?.toLowerCase().includes('intern') ? 'internship' : null)
  if (intern && !(job.salary_max && job.salary_max >= hard.min_salary_max)) {
    flags.push('Internship: pay likely low.')
    fire('internship', intern)
    caps.add('internship')
  }
  if (job.employment_type?.toLowerCase().includes('contract') || /\bcontract\b|kontrak/i.test(job.title)) flags.push('Contract.')
  if (job.salary_min && job.salary_max && job.salary_max / job.salary_min >= soft.wide_pay_ratio) {
    flags.push('Ask the actual pay.')
    fire('wide_pay', `${rp(job.salary_min)} - ${rp(job.salary_max)}`)
  }
  if (!desc) flags.push('Only the title was seen: open it to check the details.')

  // --- tier ---
  const de = RULES.de_groups.some((g) => groups.has(g))
  let tier: Verdict['tier'] = groups.has('sql') && de ? 'first' : ['sql', 'bi_tools', 'python'].some((g) => groups.has(g)) ? 'apply' : 'maybe'
  if (RULES.caps_to_maybe.some((c) => caps.has(c))) tier = 'maybe'
  fire(`tier_${tier}`, tools.join(', ') || 'no data tools named')

  const seen: string[] = []
  for (const t of tools) if (!seen.some((s) => s.toLowerCase() === t.toLowerCase())) seen.push(t)
  // With no description the "only the title was seen" flag already says it all
  const note = seen.length ? `Main tools: ${seen.slice(0, 5).join(', ')}.` : desc ? 'No specific data tools named.' : ''
  return { tier, score: points, note, flags, reasons }
}

// --- salary text from email cards: "Rp 25.000.000 – Rp 30.000.000 per month" ------------------------------

export function parseSalary(text: string): { min: number | null; max: number | null } {
  const nums = [...text.matchAll(/Rp\s*([\d.,]+)\s*(jt|juta)?/gi)].map((m) => {
    const n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
    return m[2] ? n * 1_000_000 : n
  })
  if (!nums.length) return { min: null, max: null }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

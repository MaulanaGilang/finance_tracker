// Recruiting emails -> application status. Reads the emails the Gmail script sends (action "status"),
// decides what each one says (passed to a stage, or rejected), and finds the application it's about.
// Plain rules, no AI: wording seen in real emails from LinkedIn, JobStreet, Indeed, ATS tools and companies.

import type { Mail } from './sources.ts'

export type Stage = 'hr_interview' | 'test' | 'user_interview' | 'medical_checkup' | 'offer'
export type Kind = Stage | 'rejected'
export type Verdict = { kind: Kind; evidence: string; company: string | null; position: string | null }

export const RANK: Record<string, number> = { applied: 0, other: 0, ghosted: 0, rejected: 0, hr_interview: 1, test: 2, user_interview: 3, medical_checkup: 4, offer: 5, accepted: 6 }

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// ---------------------------------------------------------------------------
// What the email says

// Job alerts, receipts, newsletters: never a status change
const NOT_STATUS_FROM = /jobalert|jobalerts-noreply|newsletters?-noreply|jobs-listings@linkedin|messages-noreply@linkedin|indeedapply@indeed|notifications-noreply@linkedin|editors-noreply/i
const NOT_STATUS_SUBJECT = /peringatan pekerjaan|lowongan (kerja )?baru|rekomendasi|new jobs?\b|jobs? (for|in|near) you|jobs? you may|webinar|newsletter|^indeed application:|your application was sent|lamaran(mu)? (telah )?terkirim|application (received|submitted)|thank you for (applying|your application)$/i

const CONTEXT = /lamaran|melamar|application|applying|applied|posisi|position|\brole\b|seleksi|selection|recruit|rekrutmen|kandidat|candidate|interview|wawancara|psikotes|hiring|talent/i

const REJECTED = [
  /unfortunately/i, /regret to inform/i, /\bwe regret\b/i, /not (?:be )?moving forward/i, /not (?:to )?move forward/i,
  /decided to (?:pursue|proceed with|move forward with|continue with) other/i, /pursue other candidates/i,
  /not been (?:selected|successful|shortlisted)/i, /(?:was|were|have been|has been) not selected/i, /\bnot selected\b/i, /\bunsuccessful\b/i,
  /will not be proceeding/i, /not proceed(?:ing)? (?:further )?with your application/i, /position has (?:now )?been filled/i,
  /no longer (?:under consideration|being considered)/i, /decided not to (?:proceed|move forward|progress)/i,
  /tidak (?:dapat|bisa) (?:melanjutkan|kami lanjutkan|diproses|memproses)/i, /belum (?:dapat|bisa) (?:melanjutkan|kami lanjutkan|memproses)/i,
  /tidak lolos/i, /belum lolos/i, /(?:tidak|belum) berhasil/i, /tidak akan mengalami kemajuan/i, /(?:tidak|belum) terpilih/i,
  /kandidat lain yang lebih/i, /kualifikasi (?:anda |kamu )?(?:belum|tidak) (?:sesuai|memenuhi)/i, /tidak dapat kami proses/i,
]

// Strongest first: an offer email may mention the earlier interview
const STAGES: [Stage, RegExp][] = [
  ['offer', /offering letter|offer letter|job offer|surat penawaran|penawaran kerja|pleased to offer you|offer you the position|would like to offer you|letter of offer/i],
  ['medical_checkup', /medical check|\bmcu\b|pemeriksaan kesehatan|tes kesehatan|cek kesehatan/i],
  ['user_interview', /user interview|interview user|wawancara user|interview (?:dengan|with) (?:the )?(?:user|hiring manager)|hiring manager|final interview|interview akhir|wawancara akhir|technical interview|interview teknis|wawancara teknis|interview tahap (?:2|dua|ii|kedua|lanjut)/i],
  ['test', /psikotes|psiko tes|psychotest|psychological test|online test|tes online|test online|skill test|tes skill|technical test|technical assessment|coding test|coding challenge|test case|case study|studi kasus|take[- ]home|\bassessment\b|\basesmen\b|\bassesment\b|tes tertulis|tes tahap|tahap tes|tes kemampuan|hackerrank|codility|\btes\b|\btest\b/i],
  ['hr_interview', /\binterview\b|wawancara|phone screen|screening call|\bhr call\b|video call|panggilan/i],
]

// A real invitation, not a mention: asks you to do something, or congratulates you
const INVITE = /invit|undang|selamat|congratulat|lolos|passed|\bschedul|jadwal|next (?:stage|step|round)|tahap (?:selanjutnya|berikut)|please (?:join|complete|attend|confirm|find|fill|submit|reply)|silakan|silahkan|mohon (?:untuk )?(?:hadir|mengerjakan|mengisi|konfirmasi|kesediaan)|kerjakan|berikut|deadline|batas waktu|link|tautan|zoom|google meet|teams/i

const firstHit = (res: RegExp[], text: string) => {
  for (const re of res) {
    const m = re.exec(text)
    if (m) return m[0]
  }
  return null
}

/** What this email says about a recruiting process, or null when it isn't a status email */
export function classify(m: Mail): Verdict | null {
  const from = m.from.toLowerCase()
  if (NOT_STATUS_FROM.test(from) || NOT_STATUS_SUBJECT.test(clean(m.subject))) return null

  // LinkedIn: "Your application to <position> at <company>"; the decision is only in its links
  if (from.includes('linkedin.com')) {
    const s = /^your application to (.+) at (.+)$/i.exec(clean(m.subject))
    if (!s) return null
    if (/application_rejected/i.test(m.body)) return { kind: 'rejected', evidence: 'LinkedIn: application rejected', position: s[1], company: s[2] }
    return null
  }

  // JobStreet: "Pembaruan lamaran untuk <position> di <company>" ... "tidak akan mengalami kemajuan lebih jauh"
  if (from.includes('jobstreet')) {
    const s = /^pembaruan lamaran untuk (.+) di (.+)$/i.exec(clean(m.subject))
    if (s && /tidak akan mengalami kemajuan|not (?:be )?progress/i.test(m.body))
      return { kind: 'rejected', evidence: 'JobStreet: lamaran tidak akan mengalami kemajuan', position: s[1], company: s[2] }
    return null
  }

  const text = `${m.subject}\n${m.body.slice(0, 4000)}`
  if (!CONTEXT.test(text)) return null
  const guess = guessJob(m)

  const rejected = firstHit(REJECTED, text)
  if (rejected) return { kind: 'rejected', evidence: rejected, ...guess }

  if (!INVITE.test(text)) return null
  for (const [stage, re] of STAGES) {
    const hit = re.exec(text)
    if (hit) return { kind: stage, evidence: hit[0], ...guess }
  }
  // "Selamat, anda lolos" with no stage named: you've passed to the next round, usually the first interview
  const passed = /selamat[^.\n]{0,40}lolos|congratulations[^.\n]{0,60}(?:passed|next)/i.exec(text)
  return passed ? { kind: 'hr_interview', evidence: passed[0], ...guess } : null
}

// ---------------------------------------------------------------------------
// Which company and position the email names (best effort; matching doesn't rely on it)

const ATS_DOMAINS = /lever|greenhouse|darwinbox|mokahr|gohire|indeed|jobstreet|linkedin|techinasia|workable|smartrecruiters|ashby|kalibrr|glints|recruitee|bamboohr|jobvite|icims|successfactors|myworkday|taleo|breezy|teamtailor|zohorecruit|gmail|yahoo|outlook|hotmail|mailchimp|sendgrid|amazonses/i
const NAME_NOISE = /\b(job|jobs|recruitment|recruiting|recruiter|rekrutmen|talent|acquisition|careers?|karir|hr|hrd|human resources?|team|tim|no-?reply|noreply|do not reply|hiring|people|admin)\b/gi

/** Company named by the sender: display name minus "Recruitment"/"Careers", or the company's own mail domain */
export function senderCompany(from: string) {
  const name = clean((/^\s*"?([^"<]+?)"?\s*</.exec(from)?.[1] ?? '').replace(NAME_NOISE, ' '))
  const domain = /@([a-z0-9.-]+)/i.exec(from)?.[1]?.toLowerCase() ?? ''
  const own = ATS_DOMAINS.test(domain) ? '' : domain.split('.').filter((p) => !/^(co|com|id|net|org|mail|email|hr|careers?|jobs?|www)$/.test(p))[0] ?? ''
  return { name: name.length >= 2 ? name : '', domain: own }
}

/** Sender name, unless it's just initials ("Admin Rekrutmen MGS") and the company's own mail domain says more (megagiga) */
function senderGuess(from: string) {
  const { name, domain } = senderCompany(from)
  if (domain && (!name || name.replace(/[^a-z]/gi, '').length <= 4)) return domain.charAt(0).toUpperCase() + domain.slice(1)
  return name || null
}

function guessJob(m: Mail): { company: string | null; position: string | null } {
  // Plain-text emails wrap lines mid-sentence ("posisi Data\nEngineer"): join them, keep paragraph breaks
  const text = `${m.subject}\n${m.body.slice(0, 2500).replace(/([^\n])\n(?!\n)/g, '$1 ')}`
  const pos =
    /(?:for|to|in) the (.{3,80}?) (?:position|role|vacancy|opening)\b/i.exec(text)?.[1] ??
    /\b(?:posisi|jabatan|lowongan)\s+(?:sebagai\s+)?([^\n.,;:()]{3,70}?)(?=\s+(?:di|pada|yang|kami|cabang|untuk|at)\b|[\n.,;:()])/i.exec(text)?.[1] ??
    /seleksi\s+([^\n.,;:()]{3,70}?)(?=\s+(?:kami|di|cabang|pada)\b|[\n.,;:()])/i.exec(text)?.[1] ??
    /\b(?:skill test|test|tes|interview|wawancara|assessment)\s*[-–:]\s*([^\n|]{3,60})$/im.exec(m.subject)?.[1] ??
    null
  const company =
    /\b(?:position|role|job) (?:at|with) ([A-Z][^\n.,;!?]{1,60}?)(?=[.,;!?\n]| we | and |$)/.exec(text)?.[1] ??
    /\binterest in ([A-Z][^\n.,;!?]{1,60}?)(?=[.,;!?\n])/.exec(text)?.[1] ??
    /^\[([^\]]{2,40})\]/.exec(clean(m.subject))?.[1] ??
    senderGuess(m.from)
  return { company: company ? clean(company) : null, position: pos ? clean(pos) : null }
}

// ---------------------------------------------------------------------------
// Which application it's about

export type JobRow = {
  id: string
  company: string
  position: string
  platform: string | null
  status: string
  applied_date: string
  status_changed_at: string
  max_stage: number
  auto_ghosted: boolean
}

// Words in company names that say nothing about which company it is
const GENERIC = new Set(
  ('pt tbk cv persero perseroda indonesia indonesian group grup global international internasional teknologi technology technologies tech ' +
    'solusi solution solutions digital consulting konsultan services service jasa company inc ltd limited corp corporation co the and dan ' +
    'sdn bhd pte asia data business bisnis sistem system systems nusantara utama sejahtera abadi jaya makmur mandiri sentosa perkasa ' +
    'informasi information industri industries holding holdings media network networks software lab labs ' +
    'analytics analytic analysis engineering consultant consultants partner partners management marketing creative ' +
    'studio studios agency research capital finance financial investment retail foods food trading').split(' '),
)

const LEGAL = new Set(['pt', 'tbk', 'cv', 'persero', 'perseroda', 'inc', 'ltd', 'limited', 'corp', 'co', 'sdn', 'bhd', 'pte'])

/**
 * The ways an application's company can be written, each as the words that must all appear:
 * "PT. SIGMA GLOBAL TEKNOLOGI (SIGMATECH)" -> [sigma] or [sigmatech].
 * A name made only of everyday words ("PT Data Labs Analytics") must appear whole, as a phrase.
 */
function aliases(company: string): { words: string[]; phrase: boolean }[] {
  const inner = [...company.matchAll(/\(([^)]+)\)/g)].map((m) => m[1])
  const outer = company.replace(/\([^)]*\)/g, ' ')
  const out: { words: string[]; phrase: boolean }[] = []
  for (const s of [outer, ...inner]) {
    const all = norm(s).split(' ').filter((t) => t && !LEGAL.has(t))
    const distinct = all.filter((t) => !GENERIC.has(t) && (t.length >= 3 || /^[a-z]{2}$/.test(t)))
    if (distinct.length) out.push({ words: distinct, phrase: false })
    else if (all.length >= 2) out.push({ words: all, phrase: true })
  }
  return out
}

const wordIn = (word: string, text: string) => new RegExp(`(?:^| )${word}(?: |$)`).test(text)

/** How specifically the email names this application's company: 0 = not at all, else more for more distinctive words */
function companyScore(company: string, text: string, compactText: string) {
  let best = 0
  for (const { words, phrase } of aliases(company)) {
    const joined = words.join('')
    const found = phrase
      ? (` ${text} `).includes(` ${words.join(' ')} `)
      : words.every((w) => wordIn(w, text)) ||
        // "Mega Giga" written "MegaGiga" (or as the mail domain): only for names of several words, long enough not to hide inside other words
        (words.length >= 2 && joined.length >= 6 && compactText.includes(joined))
    if (found) best = Math.max(best, words.length + joined.length / 100)
  }
  return best
}

const PLATFORMS: [RegExp, RegExp][] = [
  [/linkedin/i, /linkedin/i], [/jobstreet/i, /jobstreet/i], [/indeed/i, /indeed/i], [/glints/i, /glints/i], [/kalibrr/i, /kalibrr/i], [/techinasia/i, /tech ?in ?asia/i],
]
/** 1 when the email comes from the job site you applied through */
const samePlatform = (from: string, platform: string | null) => (platform && PLATFORMS.some(([f, p]) => f.test(from) && p.test(platform)) ? 1 : 0)

function bigrams(s: string) {
  const out = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1)
  return out
}
export function dice(a: string, b: string) {
  a = norm(a).replace(/ /g, '')
  b = norm(b).replace(/ /g, '')
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const A = bigrams(a)
  const B = bigrams(b)
  let both = 0
  for (const [k, n] of A) both += Math.min(n, B.get(k) ?? 0)
  return (2 * both) / (a.length + b.length - 2)
}

/** Where to look for the company: platform emails only name it in the subject (their bodies list other companies' jobs) */
function searchText(m: Mail) {
  const from = m.from.toLowerCase()
  const s = senderCompany(m.from)
  const head = `${s.name} ${s.domain} ${m.subject}`
  if (from.includes('linkedin') || from.includes('jobstreet')) return m.subject
  if (from.includes('indeed')) return `${head} ${m.body.slice(0, 600)}`
  return `${head} ${m.body.slice(0, 2500)}`
}

/** The application this email is about, or null. Several at the same company: the position decides, then the latest one applied. */
export function matchJob(m: Mail, v: Verdict, jobs: JobRow[]): { job: JobRow; note: string } | null {
  const raw = searchText(m)
  const text = norm(raw)
  const compactText = text.replace(/ /g, '')
  const sent = Date.parse(m.date)
  const scored = jobs
    // A reply can't come before you applied (3 days' slack for dates entered late)
    .filter((j) => Date.parse(j.applied_date) <= sent + 3 * 864e5)
    .map((j) => ({ j, c: companyScore(j.company, text, compactText) }))
    .filter((x) => x.c > 0)
  if (!scored.length) return null
  const top = Math.max(...scored.map((x) => x.c))
  const same = scored.filter((x) => x.c === top)
  if (same.length === 1) return { job: same[0].j, note: `company "${same[0].j.company}"` }

  // Several candidates: the job site you applied through, then the position named, then the latest application
  const named = norm(v.position ?? raw)
  const positionFit = (j: JobRow) => {
    if (v.position) return dice(j.position, v.position)
    const words = norm(j.position).split(' ')
    return words.filter((w) => wordIn(w, named)).length / words.length
  }
  const ranked = same
    .map((x) => ({ ...x, s: samePlatform(m.from, x.j.platform), p: positionFit(x.j) }))
    .sort((a, b) => b.s - a.s || b.p - a.p || Date.parse(b.j.applied_date) - Date.parse(a.j.applied_date))
  const best = ranked[0]
  return { job: best.j, note: `company "${best.j.company}", position "${best.j.position}"` }
}

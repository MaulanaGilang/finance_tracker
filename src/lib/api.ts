import { createClient } from '@supabase/supabase-js'
import type { CompanyReview, Job, JobInput, JobUpdate } from './jobs'
import type { JobLead } from './leads'
import type { Manga, MangaCandidate, MangaInput } from './manga'
import type { NewsArticle } from './news'

export type TxType = 'income' | 'expense'

export interface Category {
  id: string
  name: string
  type: TxType
  color: string
  created_at: string
}

export interface Transaction {
  id: string
  type: TxType
  amount: number
  category_id: string | null
  date: string // YYYY-MM-DD
  note: string | null
  created_at: string
}

export interface TransactionInput {
  id?: string
  type: TxType
  amount: number
  category_id: string | null
  date: string
  note: string
}

export interface CategoryInput {
  id?: string
  name: string
  type: TxType
  color: string
}

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export class ApiError extends Error {}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new ApiError(error.message)
  return data as T
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) throw new ApiError(error.message)
  return data as T
}

// Postgres numeric can arrive as a string; normalise once here.
const toTx = (t: Transaction): Transaction => ({ ...t, amount: Number(t.amount) })

export const api = {
  pinIsSet: () => rpc<boolean>('pin_is_set'),
  setupPin: (pin: string) => rpc<string>('setup_pin', { p_pin: pin }),
  login: (pin: string) => rpc<string | null>('login', { p_pin: pin }),
  logout: (token: string) => rpc<void>('logout', { p_token: token }),
  changePin: (token: string, oldPin: string, newPin: string) =>
    rpc<void>('change_pin', { p_token: token, p_old: oldPin, p_new: newPin }),

  getCategories: (token: string) => rpc<Category[]>('get_categories', { p_token: token }),
  saveCategory: (token: string, c: CategoryInput) =>
    rpc<Category>('save_category', {
      p_token: token,
      p_id: c.id ?? null,
      p_name: c.name,
      p_type: c.type,
      p_color: c.color,
    }),
  deleteCategory: (token: string, id: string) => rpc<void>('delete_category', { p_token: token, p_id: id }),

  getTransactions: async (token: string) =>
    (await rpc<Transaction[]>('get_transactions', { p_token: token })).map(toTx),
  saveTransaction: async (token: string, t: TransactionInput) =>
    toTx(
      await rpc<Transaction>('save_transaction', {
        p_token: token,
        p_id: t.id ?? null,
        p_type: t.type,
        p_amount: t.amount,
        p_category_id: t.category_id,
        p_date: t.date,
        p_note: t.note,
      }),
    ),
  deleteTransaction: (token: string, id: string) => rpc<void>('delete_transaction', { p_token: token, p_id: id }),

  getJobs: async (token: string) => (await rpc<Job[]>('get_jobs', { p_token: token })).map(toJob),
  saveJob: async (token: string, j: JobInput) => toJob(await rpc<Job>('save_job', { p_token: token, p_job: j })),
  deleteJob: (token: string, id: string) => rpc<void>('delete_job', { p_token: token, p_id: id }),
  getCompanyReviews: async (token: string) =>
    (await rpc<CompanyReview[]>('get_company_reviews', { p_token: token })).map((r) => ({ ...r, rating: r.rating == null ? null : Number(r.rating) })),

  getManga: async (token: string) => (await rpc<Manga[]>('get_manga', { p_token: token })).map(toManga),
  saveManga: async (token: string, m: MangaInput) => toManga(await rpc<Manga>('save_manga', { p_token: token, p_manga: m })),
  deleteManga: (token: string, id: string) => rpc<void>('delete_manga', { p_token: token, p_id: id }),
  /** Look up the latest chapter for one title now */
  checkManga: async (id: string) => toManga(await invoke<Manga>('manga-latest', { action: 'check_one', id })),
  /** Run one batch of the weekly check (titles not checked in the last 5 days) */
  checkMangaBatch: () => invoke<{ checked: number; ok?: number; not_found?: number; failed?: number; remaining: number }>('manga-latest', { action: 'check' }),
  searchManga: async (query: string) => (await invoke<{ results: MangaCandidate[] }>('manga-latest', { action: 'search', query })).results,

  getJobLeads: async (token: string) => {
    const r = await rpc<{ leads: JobLead[]; companies: number; last_scan: string | null; last_email: string | null }>('get_job_leads', { p_token: token })
    return { ...r, leads: r.leads.map(toLead) }
  },
  /** Applied: creates the application (status Applied, today) and returns it */
  applyJobLead: async (token: string, id: string) => toJob(await rpc<Job>('apply_job_lead', { p_token: token, p_id: id })),
  setJobLeadStatus: (token: string, id: string, status: 'new' | 'skipped') => rpc<void>('set_job_lead_status', { p_token: token, p_id: id, p_status: status }),
  /** One batch of the company-board scan (each company at most once a day) */
  scanJobs: () => invoke<{ scanned: number; added: Record<string, number | string>; remaining: number }>('job-scout', { action: 'scan' }),

  /** Status changes made from recruiting emails, and emails no application matched (last 7 days) */
  getJobUpdates: (token: string) => rpc<{ updates: JobUpdate[]; last_email: string | null }>('get_job_updates', { p_token: token }),
  /** Put the application back as it was before the email changed it */
  undoJobUpdate: async (token: string, id: string) => toJob(await rpc<Job>('undo_job_update', { p_token: token, p_id: id })),
  dismissJobUpdate: (token: string, id: string, added = false) => rpc<void>('dismiss_job_update', { p_token: token, p_id: id, p_added: added }),

  getNews: (token: string) => rpc<NewsArticle[]>('get_news', { p_token: token, p_days: 7 }),
  setNewsSaved: (token: string, id: number, saved: boolean) => rpc<void>('set_news_saved', { p_token: token, p_id: id, p_saved: saved }),
  /** Ask the fetch-news Edge Function to pull feeds now (it skips if it ran in the last 10 minutes) */
  /** Summarise one story now (when it was opened before the background job reached it) */
  summarizeArticle: async (id: number) => {
    const { data, error } = await supabase.functions.invoke('fetch-news', { body: { article_id: id } })
    if (error) throw new ApiError(error.message)
    return data as { id: number; key_points: string[] | null; brief: string[] | null; word_count: number | null; details_status: 'pending' | 'ok' | 'failed' }
  },
  refreshNews: async () => {
    const { data, error } = await supabase.functions.invoke('fetch-news', { body: {} })
    if (error) throw new ApiError(error.message)
    return data as { upserted?: number; skipped?: string }
  },
}

const toJob = (j: Job): Job => ({
  ...j,
  salary_min: j.salary_min == null ? null : Number(j.salary_min),
  salary_max: j.salary_max == null ? null : Number(j.salary_max),
})

const num = (v: number | string | null) => (v == null ? null : Number(v))
const toLead = (l: JobLead): JobLead => ({ ...l, score: Number(l.score), salary_min: num(l.salary_min), salary_max: num(l.salary_max) })
const toManga = (m: Manga): Manga => ({ ...m, last_read: num(m.last_read), latest_chapter: num(m.latest_chapter) })

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('too_many_attempts')) return 'Too many wrong attempts. Try again in 15 minutes.'
  if (msg.includes('wrong_pin')) return 'Current PIN is incorrect.'
  if (msg.includes('pin_must_be_6_digits')) return 'PIN must be exactly 6 digits.'
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return 'No connection. Check your internet and try again.'
  return 'Something went wrong. Please try again.'
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { demoCategories, demoJobs, demoLeads, demoManga, demoNews, demoReviews, demoSaveJob, demoSaveManga, demoTransactions, isDemo } from './demo'
import { todayISO } from './format'
import type { JobLead, LeadsInfo } from './leads'
import type { Manga, MangaInput } from './manga'
import { needsDetails, type NewsArticle } from './news'
import { api, ApiError, type Category, type CategoryInput, type Transaction, type TransactionInput } from './api'
import { normalizeCompany, reviewIndex, type CompanyReview, type Job, type JobInput } from './jobs'

type Status = 'checking' | 'setup' | 'locked' | 'ready' | 'offline'

interface Store {
  status: Status
  loading: boolean
  loadError: string | null
  categories: Category[]
  transactions: Transaction[]
  jobs: Job[]
  reviews: CompanyReview[]
  news: NewsArticle[]
  newsRefreshing: boolean

  setupPin: (pin: string) => Promise<void>
  unlock: (pin: string) => Promise<boolean>
  lock: () => Promise<void>
  changePin: (oldPin: string, newPin: string) => Promise<void>
  reload: () => Promise<void>

  saveTransaction: (t: TransactionInput) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  saveCategory: (c: CategoryInput) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  saveJob: (j: JobInput) => Promise<Job>
  deleteJob: (id: string) => Promise<void>
  toggleNewsSaved: (a: NewsArticle) => Promise<void>
  refreshNews: () => Promise<string>
  /** Go to the story's page */
  openArticle: (a: NewsArticle) => void
  /** Summarise a story now if the background job hasn't (or did so before paragraph briefs existed) */
  loadArticleDetails: (a: NewsArticle) => void

  composer: { open: boolean; editing: Transaction | null }
  /** id of the transaction just saved, briefly highlighted in lists */
  highlightId: string | null
  openComposer: (editing?: Transaction) => void
  closeComposer: () => void

  jobComposer: { open: boolean; editing: Job | null }
  openJobComposer: (editing?: Job) => void
  closeJobComposer: () => void

  /** Jobs the scout recommends, still to decide on */
  leads: JobLead[]
  leadsInfo: LeadsInfo | null
  /** Applied: creates the application and moves the job to Applications */
  applyLead: (id: string) => Promise<Job>
  /** Hide a recommendation, or bring a hidden one back */
  setLeadSkipped: (id: string, skipped: boolean) => Promise<void>
  /** One batch of the company-board scan; returns a short report */
  scanJobs: () => Promise<string>

  manga: Manga[]
  saveManga: (m: MangaInput) => Promise<Manga>
  deleteManga: (id: string) => Promise<void>
  /** Look up one title's latest chapter now */
  checkManga: (id: string) => Promise<Manga>
  /** One batch of the weekly check; returns a short report */
  checkMangaBatch: () => Promise<string>
  mangaComposer: { open: boolean; editing: Manga | null }
  openMangaComposer: (editing?: Manga) => void
  closeMangaComposer: () => void
}

const sortManga = (list: Manga[]) => [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))

const TOKEN_KEY = 'ledger.session'
const ACTIVE_KEY = 'ledger.lastActive'
/** No taps, clicks, keys or scrolling for this long and the app locks itself */
export const IDLE_LOCK_MS = 60_000
const Ctx = createContext<Store | null>(null)

// The session lives in sessionStorage: it survives a reload of the same tab, but a new visit
// (a new tab, or the app reopened after being closed) always starts at the PIN screen.
const store = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v) sessionStorage.setItem(k, v)
      else sessionStorage.removeItem(k)
    } catch {
      /* storage unavailable: the session lasts until this page is reloaded */
    }
  },
}
const markActive = () => store.set(ACTIVE_KEY, String(Date.now()))
const idleFor = () => Date.now() - Number(store.get(ACTIVE_KEY) ?? 0)

/** The token to resume with, or null when this visit has to unlock first */
const readToken = () => {
  // Sessions used to be kept for good in localStorage: end any left there
  try {
    const old = localStorage.getItem(TOKEN_KEY)
    if (old) {
      localStorage.removeItem(TOKEN_KEY)
      api.logout(old).catch(() => {})
    }
  } catch {
    /* storage unavailable */
  }
  const t = store.get(TOKEN_KEY)
  if (t && idleFor() > IDLE_LOCK_MS) {
    // Reopened after being away too long: this session is over
    store.set(TOKEN_KEY, null)
    api.logout(t).catch(() => {})
    return null
  }
  return t
}
const writeToken = (t: string | null) => {
  store.set(TOKEN_KEY, t)
  if (t) markActive()
}

const isSessionError = (e: unknown) => e instanceof ApiError && e.message.includes('invalid_session')

export function StoreProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken)
  const [status, setStatus] = useState<Status>('checking')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [reviews, setReviews] = useState<CompanyReview[]>([])
  const [news, setNews] = useState<NewsArticle[]>([])
  const [newsRefreshing, setNewsRefreshing] = useState(false)
  const [manga, setManga] = useState<Manga[]>([])
  const [leads, setLeads] = useState<JobLead[]>([])
  const [leadsInfo, setLeadsInfo] = useState<LeadsInfo | null>(null)
  const [mangaComposer, setMangaComposer] = useState<{ open: boolean; editing: Manga | null }>({ open: false, editing: null })
  const navigate = useNavigate()
  const [jobComposer, setJobComposer] = useState<{ open: boolean; editing: Job | null }>({ open: false, editing: null })
  const [composer, setComposer] = useState<{ open: boolean; editing: Transaction | null }>({
    open: false,
    editing: null,
  })
  const [highlightId, setHighlightId] = useState<string | null>(null)
  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 1800)
    return () => clearTimeout(t)
  }, [highlightId])

  const resetToLock = useCallback(async () => {
    writeToken(null)
    setToken(null)
    setCategories([])
    setTransactions([])
    setJobs([])
    setManga([])
    setLeads([])
    setLeadsInfo(null)
    setNews([])
    setReviews([])
    try {
      setStatus((await api.pinIsSet()) ? 'locked' : 'setup')
    } catch {
      setStatus('offline')
    }
  }, [])

  const load = useCallback(
    async (t: string) => {
      setLoading(true)
      setLoadError(null)
      try {
        const [cats, txs, js, rvs, nws, mgs] = await Promise.all([
          api.getCategories(t),
          api.getTransactions(t),
          api.getJobs(t),
          api.getCompanyReviews(t),
          api.getNews(t),
          // The manga list is optional: if it fails, the other tools still load
          api.getManga(t).catch((e) => (isSessionError(e) ? Promise.reject(e) : [])),
        ])
        setManga(mgs)
        // Recommendations load on their own: a problem there never blocks the rest
        api
          .getJobLeads(t)
          .then(({ leads: l, ...info }) => {
            setLeads(l)
            setLeadsInfo(info)
          })
          .catch(() => {})
        setCategories(cats)
        setTransactions(txs)
        setJobs(js)
        setReviews(rvs)
        setNews(nws)
        setStatus('ready')
      } catch (e) {
        if (isSessionError(e)) await resetToLock()
        else {
          setLoadError('Could not load your data. Check your connection.')
          setStatus((s) => (s === 'checking' ? 'offline' : s))
        }
      } finally {
        setLoading(false)
      }
    },
    [resetToLock],
  )

  useEffect(() => {
    if (isDemo) {
      // View-only sample data for local design work; saving is not supported in demo mode.
      setCategories(demoCategories)
      setTransactions(demoTransactions())
      setJobs(demoJobs())
      setReviews(demoReviews())
      setNews(demoNews())
      setManga(demoManga())
      setLeads(demoLeads())
      setLeadsInfo({ companies: 23, last_scan: new Date(Date.now() - 5 * 3600e3).toISOString(), last_email: new Date(Date.now() - 2 * 3600e3).toISOString() })
      setStatus('ready')
      return
    }
    if (token) load(token)
    else resetToLock()
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-lock: any tap, click, key or scroll counts as activity; checked on a timer and whenever
  // the tab comes back to the front (timers barely run while a phone app sits in the background)
  useEffect(() => {
    if (isDemo || status !== 'ready' || !token) return
    let last = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - last < 5000) return
      last = now
      markActive()
    }
    const check = () => {
      if (idleFor() <= IDLE_LOCK_MS) return
      api.logout(token).catch(() => {})
      void resetToLock()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(check, 15_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }))
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [status, token, resetToLock])

  /** Wrap a mutation so an expired session drops back to the PIN screen */
  const guarded = useCallback(
    async <T,>(fn: (t: string) => Promise<T>): Promise<T> => {
      if (!token) throw new ApiError('invalid_session')
      try {
        return await fn(token)
      } catch (e) {
        if (isSessionError(e)) await resetToLock()
        throw e
      }
    },
    [token, resetToLock],
  )

  const startSession = useCallback(
    async (t: string) => {
      writeToken(t)
      setToken(t)
      await load(t)
    },
    [load],
  )

  const value = useMemo<Store>(
    () => ({
      status,
      loading,
      loadError,
      categories,
      transactions,
      jobs,
      reviews,
      news,
      newsRefreshing,

      setupPin: async (pin) => startSession(await api.setupPin(pin)),
      unlock: async (pin) => {
        const t = await api.login(pin)
        if (!t) return false
        await startSession(t)
        return true
      },
      lock: async () => {
        if (token) api.logout(token).catch(() => {})
        await resetToLock()
      },
      changePin: (oldPin, newPin) => guarded((t) => api.changePin(t, oldPin, newPin)),
      reload: async () => {
        if (token) await load(token)
        else await resetToLock()
      },

      saveTransaction: async (input) => {
        const saved = await guarded((t) => api.saveTransaction(t, input))
        setTransactions((prev) =>
          [saved, ...prev.filter((x) => x.id !== saved.id)].sort(
            (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at),
          ),
        )
        setHighlightId(saved.id)
      },
      deleteTransaction: async (id) => {
        await guarded((t) => api.deleteTransaction(t, id))
        setTransactions((prev) => prev.filter((x) => x.id !== id))
      },
      saveCategory: async (input) => {
        const saved = await guarded((t) => api.saveCategory(t, input))
        setCategories((prev) =>
          prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved],
        )
      },
      deleteCategory: async (id) => {
        await guarded((t) => api.deleteCategory(t, id))
        setCategories((prev) => prev.filter((c) => c.id !== id))
        setTransactions((prev) => prev.map((x) => (x.category_id === id ? { ...x, category_id: null } : x)))
      },

      saveJob: async (input) => {
        const saved = isDemo ? demoSaveJob(jobs, input) : await guarded((t) => api.saveJob(t, input))
        setJobs((prev) =>
          [saved, ...prev.filter((x) => x.id !== saved.id)].sort(
            (a, b) => b.applied_date.localeCompare(a.applied_date) || b.created_at.localeCompare(a.created_at),
          ),
        )
        setHighlightId(saved.id)
        return saved
      },
      deleteJob: async (id) => {
        if (!isDemo) await guarded((t) => api.deleteJob(t, id))
        setJobs((prev) => prev.filter((x) => x.id !== id))
      },

      toggleNewsSaved: async (a) => {
        const saved = !a.saved
        setNews((prev) => prev.map((x) => (x.id === a.id ? { ...x, saved } : x)))
        if (isDemo) return
        try {
          await guarded((t) => api.setNewsSaved(t, a.id, saved))
        } catch (e) {
          setNews((prev) => prev.map((x) => (x.id === a.id ? { ...x, saved: !saved } : x)))
          throw e
        }
      },
      refreshNews: async () => {
        if (isDemo || !token) return 'Demo mode: nothing to refresh.'
        setNewsRefreshing(true)
        try {
          const res = await api.refreshNews()
          setNews(await guarded((t) => api.getNews(t)))
          return res.skipped ? 'Already up to date (refreshed in the last 10 minutes).' : `${res.upserted ?? 0} stories checked.`
        } finally {
          setNewsRefreshing(false)
        }
      },

      openArticle: (a) => navigate(`/news/story/${a.id}`),
      loadArticleDetails: (a) => {
        if (!needsDetails(a) || isDemo) return
        api
          .summarizeArticle(a.id)
          .then((d) => setNews((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...d } : x))))
          .catch(() => setNews((prev) => prev.map((x) => (x.id === a.id && x.details_status === 'pending' ? { ...x, details_status: 'failed' } : x))))
      },

      composer,
      highlightId,
      openComposer: (editing) => setComposer({ open: true, editing: editing ?? null }),
      closeComposer: () => setComposer((c) => ({ ...c, open: false })),

      jobComposer,
      openJobComposer: (editing) => setJobComposer({ open: true, editing: editing ?? null }),
      closeJobComposer: () => setJobComposer((c) => ({ ...c, open: false })),

      leads,
      leadsInfo,
      applyLead: async (id) => {
        const lead = leads.find((l) => l.id === id)
        const job = isDemo
          ? demoSaveJob(jobs, {
              position: lead!.title, company: lead!.company, location: lead!.location ?? '', category: 'full_time', flexibility: 'onsite',
              status: 'applied', platform: lead!.source === 'linkedin' ? 'LinkedIn' : lead!.source === 'jobstreet' ? 'JobStreet' : 'Company website',
              link: lead!.url ?? '', salary_min: lead!.salary_min, salary_max: lead!.salary_max, applied_date: todayISO(), notes: '',
            })
          : await guarded((t) => api.applyJobLead(t, id))
        setLeads((prev) => prev.filter((l) => l.id !== id))
        setJobs((prev) =>
          [job, ...prev.filter((x) => x.id !== job.id)].sort(
            (a, b) => b.applied_date.localeCompare(a.applied_date) || b.created_at.localeCompare(a.created_at),
          ),
        )
        setHighlightId(job.id)
        return job
      },
      setLeadSkipped: async (id, skipped) => {
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: skipped ? 'skipped' : 'new' } : l)))
        if (isDemo) return
        try {
          await guarded((t) => api.setJobLeadStatus(t, id, skipped ? 'skipped' : 'new'))
        } catch (e) {
          setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: skipped ? 'new' : 'skipped' } : l)))
          throw e
        }
      },
      scanJobs: async () => {
        if (isDemo || !token) return 'Demo mode: nothing to scan.'
        const r = await api.scanJobs()
        const { leads: l, ...info } = await guarded((t) => api.getJobLeads(t))
        setLeads(l)
        setLeadsInfo(info)
        const added = Object.values(r.added).reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0)
        if (!r.scanned) return 'Every company was checked in the last day.'
        return `Checked ${r.scanned} companies, ${added} new ${added === 1 ? 'job' : 'jobs'}.${r.remaining ? ` ${r.remaining} companies left: run it again to continue.` : ''}`
      },

      manga,
      saveManga: async (input) => {
        const saved = isDemo ? demoSaveManga(manga, input) : await guarded((t) => api.saveManga(t, input))
        setManga((prev) => sortManga([saved, ...prev.filter((x) => x.id !== saved.id)]))
        setHighlightId(saved.id)
        return saved
      },
      deleteManga: async (id) => {
        if (!isDemo) await guarded((t) => api.deleteManga(t, id))
        setManga((prev) => prev.filter((x) => x.id !== id))
      },
      checkManga: async (id) => {
        if (isDemo) return manga.find((m) => m.id === id)!
        const fresh = await api.checkManga(id)
        setManga((prev) => prev.map((x) => (x.id === fresh.id ? fresh : x)))
        return fresh
      },
      checkMangaBatch: async () => {
        if (isDemo || !token) return 'Demo mode: nothing to check.'
        const r = await api.checkMangaBatch()
        setManga(await guarded((t) => api.getManga(t)))
        if (!r.checked) return 'Everything was checked in the last 5 days.'
        return `Checked ${r.checked} titles${r.not_found ? `, ${r.not_found} not found` : ''}.${r.remaining ? ` ${r.remaining} left: run it again to continue.` : ''}`
      },
      mangaComposer,
      openMangaComposer: (editing) => setMangaComposer({ open: true, editing: editing ?? null }),
      closeMangaComposer: () => setMangaComposer((c) => ({ ...c, open: false })),
    }),
    [status, loading, loadError, categories, transactions, jobs, reviews, news, newsRefreshing, leads, leadsInfo, manga, mangaComposer, navigate, composer, jobComposer, highlightId, token, guarded, load, resetToLock, startSession],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

export function useCategoryMap() {
  const { categories } = useStore()
  return useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
}

/** The researched review for a company name, if any */
export function useCompanyReview(company: string) {
  const { reviews } = useStore()
  const index = useMemo(() => reviewIndex(reviews), [reviews])
  return index.get(normalizeCompany(company)) ?? null
}

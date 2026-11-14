import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { AnimatePresence } from 'motion/react'
import { ArrowSquareOut, ArrowsClockwise, MagnifyingGlass } from '@phosphor-icons/react'
import { api, friendlyError } from '../../lib/api'
import { SOURCE_LABEL, capitalizeFirst, chapterLabel, notTrackedReason, seriesStatusLabel, type Manga, type MangaCandidate, type MangaStatus } from '../../lib/manga'
import { isDemo } from '../../lib/demo'
import { timeAgo } from '../../lib/news'
import { useStore } from '../../lib/store'
import { Sheet } from '../Sheet'
import { CoverThumb } from './CoverHover'
import { Button, Field, Segmented, Skeleton, cx, inputClass } from '../ui'

// Only the Add / Save button saves (same rule as the job form)
const noEnterSubmit = (e: KeyboardEvent<HTMLDivElement>) => {
  if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type !== 'search') e.preventDefault()
}
const blockSubmit = (e: FormEvent) => e.preventDefault()

/** "61,5" or "61.5" -> 61.5; empty -> null; anything else -> NaN */
const parseChapter = (s: string) => {
  const t = s.trim().replace(',', '.')
  return t === '' ? null : Number(t)
}

export function MangaComposer() {
  const { mangaComposer, closeMangaComposer } = useStore()
  return (
    <AnimatePresence>
      {mangaComposer.open && <MangaSheet key={mangaComposer.editing?.id ?? 'new'} onClose={closeMangaComposer} />}
    </AnimatePresence>
  )
}

type Pick = { source: MangaCandidate['source']; id: string; title: string }

function MangaSheet({ onClose }: { onClose: () => void }) {
  const { mangaComposer, saveManga, deleteManga, checkManga } = useStore()
  const editing = mangaComposer.editing

  const [title, setTitle] = useState(editing?.title ?? '')
  const [status, setStatus] = useState<MangaStatus>(editing?.status ?? 'reading')
  const [lastRead, setLastRead] = useState(editing?.last_read != null ? chapterLabel(editing.last_read) : '')
  const [link, setLink] = useState(editing?.link ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [pick, setPick] = useState<Pick | null>(null)
  const [track, setTrack] = useState(!editing?.skip_check)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!title.trim()) return setError('Give it a title.')
    const ch = parseChapter(lastRead)
    if (ch !== null && (!Number.isFinite(ch) || ch < 0)) return setError('Last read should be a chapter number, like 12 or 61.5.')
    setBusy(true)
    setError(null)
    try {
      const saved = await saveManga({
        id: editing?.id,
        title: capitalizeFirst(title.trim()),
        status,
        last_read: ch,
        link: link.trim(),
        notes,
        ...(editing && { skip_check: !track }),
        ...(pick && {
          mangadex_id: pick.source === 'mangadex' ? pick.id : null,
          mu_id: pick.source === 'mangaupdates' ? pick.id : null,
          matched_title: pick.title,
          match_locked: true,
        }),
      })
      onClose()
      // New titles, renamed ones and new matches get their latest chapter straight away
      const needsCheck = !editing || pick || capitalizeFirst(title.trim()) !== editing.title || (track && editing.skip_check)
      if (needsCheck && saved.status === 'reading') checkManga(saved.id).catch(() => {})
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing || !confirm(`Remove ${editing.title} from your list?`)) return
    setBusy(true)
    try {
      await deleteManga(editing.id)
      onClose()
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <Sheet title={editing ? 'Edit title' : 'New title'} onClose={onClose} onSubmit={blockSubmit} maxWidth="sm:max-w-[560px]">
      <div className="flex flex-col gap-5" onKeyDown={noEnterSubmit}>
        <Field label="Title" htmlFor="m-title" hint="Romaji or English both work for finding the latest chapter.">
          <input id="m-title" autoFocus={!editing} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Juujika no Rokunin" className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-[480] text-muted">Status</span>
            <Segmented
              label="Status"
              value={status}
              onChange={setStatus}
              className="w-full"
              options={[
                { value: 'reading', label: 'Reading' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </div>
          <Field label="Last read chapter" htmlFor="m-last">
            <div className="flex gap-2">
              <input id="m-last" inputMode="decimal" value={lastRead} onChange={(e) => setLastRead(e.target.value)} placeholder="12" className={cx(inputClass, 'tabular-nums')} />
              {/* Only when the latest is ahead of you, and trusted (never moves you backwards) */}
              {editing?.latest_chapter != null && !editing.skip_check && (parseChapter(lastRead) ?? -1) < editing.latest_chapter && (
                <Button type="button" variant="ghost" className="h-12 shrink-0 px-4 text-[14px]" onClick={() => setLastRead(chapterLabel(editing.latest_chapter))}>
                  Caught up
                </Button>
              )}
            </div>
          </Field>
        </div>

        <Field label="Where you read it (optional)" htmlFor="m-link">
          <input id="m-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className={inputClass} />
        </Field>
        <Field label="Notes (optional)" htmlFor="m-notes">
          <input id="m-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>

        <MatchPanel manga={editing} title={title} pick={pick} onPick={setPick} />

        {editing && status === 'reading' && !pick && (
          <label className="-mt-2 flex cursor-pointer items-start gap-3 px-1 text-[14px] leading-[1.5]">
            <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} className="mt-1 size-4 accent-[var(--color-accent)]" />
            <span>
              Check this title every week
              <span className="block text-[13px] text-muted">
                {editing.skip_check ? `Turned off: ${notTrackedReason(editing).toLowerCase()}.` : 'Turn off to keep track of it yourself.'}
              </span>
            </span>
          </label>
        )}

        <p className={cx('min-h-5 text-[14px] text-expense', !error && 'invisible')} role="alert">
          {error ?? ' '}
        </p>

        <div className="flex gap-3">
          {editing && (
            <Button type="button" variant="danger" onClick={remove} disabled={busy}>
              Delete
            </Button>
          )}
          <Button type="button" variant="primary" className="flex-1" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add title'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/** Which series the weekly check follows, and a way to pick the right one when it guessed wrong */
function MatchPanel({ manga, title, pick, onPick }: { manga: Manga | null; title: string; pick: Pick | null; onPick: (p: Pick | null) => void }) {
  const { checkManga } = useStore()
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MangaCandidate[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const search = async (q: string) => {
    if (!q.trim()) return
    setBusy(true)
    setMsg(null)
    setResults(null)
    try {
      setResults(isDemo ? [] : await api.searchManga(q.trim()))
    } catch (e) {
      setMsg(friendlyError(e))
      setResults([])
    } finally {
      setBusy(false)
    }
  }
  const open = () => {
    const q = title.trim() || manga?.title || ''
    setQuery(q)
    setSearching(true)
    void search(q)
  }
  const checkNow = async () => {
    if (!manga) return
    setBusy(true)
    setMsg(null)
    try {
      const m = await checkManga(manga.id)
      setMsg(m.check_status === 'ok' ? `Latest is chapter ${chapterLabel(m.latest_chapter)}.` : m.check_status === 'not_found' ? 'Still not found. Try picking the series.' : 'The sources did not answer. Try again later.')
    } catch (e) {
      setMsg(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const status = seriesStatusLabel(manga?.series_status ?? null)
  return (
    <section className="flex flex-col gap-3 rounded-card bg-raised/80 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        {manga && !pick && <CoverThumb src={manga.cover_url} title={manga.title} />}
        <div className="min-w-0 flex-1 text-[14px] leading-[1.5]">
          <p className="text-[13px] font-[480] text-muted">Latest chapter lookup</p>
          {pick ? (
            <p>
              Will follow <span className="font-[480]">{pick.title}</span> on {SOURCE_LABEL[pick.source]}.{' '}
              <button type="button" className="text-accent hover:underline" onClick={() => onPick(null)}>
                Undo
              </button>
            </p>
          ) : !manga ? (
            <p className="text-muted">Found automatically after you add it.</p>
          ) : manga.check_status === 'pending' ? (
            <p className="text-muted">Not checked yet.</p>
          ) : manga.check_status === 'not_found' ? (
            <p className="text-expense">Couldn't find this series. Pick it below.</p>
          ) : manga.skip_check && manga.status === 'reading' ? (
            <p>
              <span className="font-[480]">Not tracked.</span> <span className="text-muted">{notTrackedReason(manga)}. Pick the right series below to check it again.</span>
            </p>
          ) : (
            <p>
              <span className="font-[480]">{manga.matched_title ?? manga.title}</span>
              <span className="text-muted">
                {manga.latest_chapter != null && ` · ch. ${chapterLabel(manga.latest_chapter)}`}
                {manga.latest_source && ` on ${SOURCE_LABEL[manga.latest_source]}`}
                {status && ` · ${status}`}
                {manga.checked_at && ` · checked ${timeAgo(manga.checked_at)}`}
                {manga.check_status === 'failed' && ' · last check failed'}
              </span>
            </p>
          )}
        </div>
        {manga && !pick && (
          <button type="button" onClick={() => void checkNow()} disabled={busy} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-card hover:text-accent disabled:opacity-40" aria-label="Check now" title="Check now">
            <ArrowsClockwise size={17} className={busy && !searching ? 'animate-spin' : undefined} />
          </button>
        )}
      </div>

      {!searching ? (
        <button type="button" onClick={open} className="self-start text-[14px] text-accent hover:underline">
          {manga?.check_status === 'not_found' ? 'Find the series' : 'Wrong series? Pick another'}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <label className="sr-only" htmlFor="m-search">
              Search MangaDex and MangaUpdates
            </label>
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="m-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void search(query))}
              placeholder="Search by title"
              className={cx(inputClass, 'h-11 pl-10 text-[15px]')}
            />
          </div>
          {busy && !results ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : results && results.length === 0 ? (
            <p className="text-[14px] text-muted">{isDemo ? 'Search is off in demo mode.' : 'No results. Try the English or Japanese title.'}</p>
          ) : (
            <ul className="flex max-h-64 flex-col overflow-y-auto">
              {results?.map((r) => (
                <li key={`${r.source}-${r.id}`} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ source: r.source, id: r.id, title: r.title })
                      setSearching(false)
                    }}
                    className="min-w-0 flex-1 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-card"
                  >
                    <span className="block truncate text-[14px]">{r.title}</span>
                    <span className="block text-[12px] text-muted">
                      {SOURCE_LABEL[r.source]}
                      {r.year && ` · ${r.year}`}
                      {seriesStatusLabel(r.status) && ` · ${seriesStatusLabel(r.status)}`}
                    </span>
                  </button>
                  <a href={r.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.title} on ${SOURCE_LABEL[r.source]}`} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-card hover:text-accent">
                    <ArrowSquareOut size={16} />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setSearching(false)} className="self-start text-[14px] text-muted hover:text-ink">
            Cancel
          </button>
        </div>
      )}
      {msg && (
        <p className="text-[13px] text-muted" role="status">
          {msg}
        </p>
      )}
    </section>
  )
}

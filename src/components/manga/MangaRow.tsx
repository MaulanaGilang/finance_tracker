import { motion } from 'motion/react'
import { ArrowSquareOut, Check, EyeSlash } from '@phosphor-icons/react'
import { SOURCE_LABEL, chapterLabel, notTrackedReason, readUrl, seriesStatusLabel, unreadLabel, type Manga } from '../../lib/manga'
import { EASE_OUT } from '../../lib/motion'
import { timeAgo } from '../../lib/news'
import { useStore } from '../../lib/store'
import { cx } from '../ui'
import { CoverHover } from './CoverHover'

/** Desktop column template, shared by the heading row and every row */
export const MANGA_COLS = 'lg:grid-cols-[minmax(0,2.4fr)_6rem_9rem_minmax(0,1fr)_4.75rem]'

export function MangaHeadings() {
  return (
    <div className={cx('hidden gap-4 px-3 pb-2 text-[12px] font-[480] text-muted lg:grid', MANGA_COLS)}>
      <span>Title</span>
      <span className="text-right">Last read</span>
      <span className="text-right">Latest chapter</span>
      <span>Series</span>
      <span />
    </div>
  )
}

/** Bump "last read" to the newest chapter in one tap */
export function CaughtUpButton({ manga, className }: { manga: Manga; className?: string }) {
  const { saveManga } = useStore()
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        void saveManga({ id: manga.id, title: manga.title, status: manga.status, last_read: manga.latest_chapter, link: manga.link ?? '', notes: manga.notes ?? '' }).catch(() => {})
      }}
      aria-label={`Mark ${manga.title} read up to chapter ${chapterLabel(manga.latest_chapter)}`}
      title="Caught up"
      className={cx('flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-card hover:text-accent', className)}
    >
      <Check size={17} />
    </button>
  )
}

export function OpenLink({ manga }: { manga: Manga }) {
  const url = readUrl(manga)
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={`Open ${manga.title}`}
      className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-card hover:text-accent"
    >
      <ArrowSquareOut size={17} />
    </a>
  )
}

/** Flag for a title the weekly check skips; hover or tap-and-hold shows why */
export function NotTracked({ manga }: { manga: Manga }) {
  return (
    <span
      title={`${notTrackedReason(manga)}. Skipped in the weekly check.`}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-pill bg-raised px-2 py-0.5 text-[12px] font-[480] text-muted ring-1 ring-line"
    >
      <EyeSlash size={13} />
      Not tracked
    </span>
  )
}

/** The latest-chapter cell: number with a "+N" badge, or why there isn't one */
export function Latest({ manga }: { manga: Manga }) {
  const badge = unreadLabel(manga)
  if (manga.status === 'completed') return <span className="text-muted">-</span>
  if (manga.skip_check) return <NotTracked manga={manga} />
  if (manga.check_status === 'pending') return <span className="text-[13px] text-muted">Not checked yet</span>
  if (manga.check_status === 'not_found') return <span className="text-[13px] text-expense">Not found</span>
  if (manga.latest_chapter === null) return <span className="text-[13px] text-muted">{manga.check_status === 'failed' ? 'Check failed' : 'No chapters'}</span>
  // Lower than where you are: likely the wrong series, or the source is behind
  if (manga.last_read !== null && manga.latest_chapter < manga.last_read)
    return (
      <span className="tabular-nums text-muted" title="Lower than your last read chapter: the matched series may be wrong, or the source is behind">
        {chapterLabel(manga.latest_chapter)}?
      </span>
    )
  return (
    <span className="inline-flex items-center gap-2" title={manga.latest_source ? `From ${SOURCE_LABEL[manga.latest_source]}` : undefined}>
      {badge && <span className="rounded-pill bg-accent px-2 py-0.5 text-[12px] font-[480] text-white">{badge}</span>}
      <span className="tabular-nums">{chapterLabel(manga.latest_chapter)}</span>
    </span>
  )
}

export function MangaRow({ manga, index }: { manga: Manga; index: number }) {
  const { openMangaComposer, highlightId } = useStore()
  const badge = unreadLabel(manga)
  const series = seriesStatusLabel(manga.series_status)
  const sub = manga.matched_title && manga.matched_title.toLowerCase() !== manga.title.toLowerCase() ? manga.matched_title : null

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT, delay: Math.min(index, 8) * 0.02 } }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
      className="overflow-hidden"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => openMangaComposer(manga)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openMangaComposer(manga))}
        className={cx(
          'grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[10px] px-2 py-3 transition-colors hover:bg-raised sm:px-3',
          MANGA_COLS,
          highlightId === manga.id && 'bg-accent-soft',
        )}
      >
        <div className="min-w-0">
          <p className="flex min-w-0">
            <CoverHover src={manga.cover_url} title={manga.title}>
              <span className="block truncate text-[15px] font-[440]">{manga.title}</span>
            </CoverHover>
          </p>
          {sub && <p className="truncate text-[13px] text-muted">{sub}</p>}
        </div>

        {/* Mobile: chapter progress on the right, meta underneath */}
        <div className="flex items-center gap-1 text-[14px] lg:hidden">
          <Latest manga={manga} />
          {badge && <CaughtUpButton manga={manga} />}
        </div>
        <p className="col-span-2 truncate text-[12px] text-muted lg:hidden">
          {manga.last_read !== null ? `Read to ch. ${chapterLabel(manga.last_read)}` : 'No chapter noted'}
          {series && ` · ${series}`}
          {manga.skip_check && manga.status === 'reading'
            ? ` · ${notTrackedReason(manga)}`
            : manga.checked_at && manga.status === 'reading' && ` · checked ${timeAgo(manga.checked_at)}`}
        </p>

        <span className="hidden text-right text-[14px] tabular-nums lg:block">{chapterLabel(manga.last_read)}</span>
        <span className="hidden text-right text-[14px] lg:block">
          <Latest manga={manga} />
        </span>
        <span className="hidden truncate text-[14px] text-muted lg:block">{series ?? '-'}</span>
        <span className="hidden items-center justify-end lg:flex">
          {badge && <CaughtUpButton manga={manga} />}
          <OpenLink manga={manga} />
        </span>
      </div>
    </motion.li>
  )
}

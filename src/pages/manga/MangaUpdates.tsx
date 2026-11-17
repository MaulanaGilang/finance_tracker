import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight } from '@phosphor-icons/react'
import { CoverHover } from '../../components/manga/CoverHover'
import { CaughtUpButton, OpenLink } from '../../components/manga/MangaRow'
import { Button, Card, CardTitle, Empty, PageHeader, Skeleton } from '../../components/ui'
import { chapterLabel, latestFrom, hasNew, lastChecked, mangaKpis, notTrackedReason, unread, unreadLabel, type Manga } from '../../lib/manga'
import { itemVariants, listVariants } from '../../lib/motion'
import { timeAgo } from '../../lib/news'
import { useStore } from '../../lib/store'

/** What came out since you last read, at a glance */
export function MangaUpdates() {
  const { manga, loading, openMangaComposer } = useStore()
  const k = mangaKpis(manga)
  const reading = manga.filter((m) => m.status === 'reading')
  const fresh = reading.filter(hasNew).sort((a, b) => unread(b) - unread(a) || a.title.localeCompare(b.title))
  const missing = reading.filter((m) => m.skip_check)
  const pending = reading.filter((m) => m.check_status === 'pending').length
  const checked = lastChecked(reading)

  if (loading && manga.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-28" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <motion.div className="flex flex-col gap-6 sm:gap-8" variants={listVariants} initial="initial" animate="animate">
      <PageHeader title="Updates">
        <p className="text-[14px] text-muted">{checked ? `Last checked ${timeAgo(checked)} · every Monday` : 'Checked every Monday morning'}</p>
      </PageHeader>

      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Reading" value={k.reading} to="/manga/reading" />
        <Kpi label="With new chapters" value={k.withNew} to="/manga/reading" accent />
        <Kpi label="Not tracked" value={k.notTracked} to="/manga/reading" />
        <Kpi label="Completed" value={k.completed} to="/manga/completed" />
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardTitle>New chapters</CardTitle>
          {fresh.length === 0 ? (
            <Empty
              title={reading.length ? "You're caught up" : 'No titles yet'}
              body={
                reading.length
                  ? pending
                    ? `${pending} titles haven't been checked yet. They'll be looked up on Monday, or run a check from Settings.`
                    : 'Nothing new since the chapters you noted.'
                  : 'Add what you are reading and the latest chapter is looked up every week.'
              }
              action={!reading.length && <Button variant="primary" onClick={() => openMangaComposer()}>Add title</Button>}
            />
          ) : (
            <ul className="-mx-2 flex flex-col">
              {fresh.map((m) => (
                <FreshRow key={m.id} manga={m} />
              ))}
            </ul>
          )}
        </Card>
      </motion.div>

      {missing.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardTitle>Not tracked</CardTitle>
            <p className="mb-4 max-w-[62ch] text-[14px] leading-[1.6] text-muted">
              The weekly check couldn't confirm these, so it skips them. Keep track of them yourself, or open one and pick its series to start
              checking it again.
            </p>
            <ul className="-mx-2 flex flex-col">
              {missing.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => openMangaComposer(m)}
                    className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left transition-colors hover:bg-raised"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{m.title}</span>
                      <span className="block truncate text-[13px] text-muted">{notTrackedReason(m)}</span>
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-muted">
                      {m.last_read !== null ? `Read to ch. ${chapterLabel(m.last_read)}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}

function Kpi({ label, value, to, accent }: { label: string; value: number; to: string; accent?: boolean }) {
  return (
    <Link to={to} className="frost group rounded-card p-5 transition-colors hover:bg-card/80">
      <p className="mb-2 text-[13px] text-muted">{label}</p>
      <p className="flex items-center justify-between font-display text-[30px] leading-none tabular-nums">
        <span className={accent && value ? 'text-accent' : undefined}>{value}</span>
        <ArrowRight size={16} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
    </Link>
  )
}

function FreshRow({ manga }: { manga: Manga }) {
  const { openMangaComposer } = useStore()
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => openMangaComposer(manga)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openMangaComposer(manga))}
        className="flex cursor-pointer items-center gap-3 rounded-[10px] px-2 py-3 transition-colors hover:bg-raised"
      >
        <span className="w-12 shrink-0 text-center">
          <span className="inline-block rounded-pill bg-accent px-2 py-0.5 text-[12px] font-[480] tabular-nums text-canvas">{unreadLabel(manga)}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0">
            <CoverHover src={manga.cover_url} title={manga.title}>
              <span className="block truncate text-[15px] font-[440]">{manga.title}</span>
            </CoverHover>
          </p>
          <p className="truncate text-[13px] tabular-nums text-muted">
            Ch. {chapterLabel(manga.last_read ?? 0)} → {chapterLabel(manga.latest_chapter)}
            {manga.latest_source && ` · ${latestFrom(manga)}`}
          </p>
        </div>
        <CaughtUpButton manga={manga} />
        <OpenLink manga={manga} />
      </div>
    </li>
  )
}

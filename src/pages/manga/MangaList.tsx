import { useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { MangaHeadings, MangaRow } from '../../components/manga/MangaRow'
import { Button, Card, Empty, PageHeader, Segmented, Skeleton, cx, inputClass, selectClass } from '../../components/ui'
import { hasNew, unread, type Manga, type MangaStatus } from '../../lib/manga'
import { useStore } from '../../lib/store'

type Show = 'all' | 'new' | 'missing'
type Sort = 'title' | 'behind' | 'read'

/** Your reading list (or finished list) as a table, with the latest chapter next to where you are */
export function MangaList({ status }: { status: MangaStatus }) {
  const { manga, loading, openMangaComposer } = useStore()
  const reading = status === 'reading'
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [sort, setSort] = useState<Sort>(reading ? 'behind' : 'title')

  const mine = useMemo(() => manga.filter((m) => m.status === status), [manga, status])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = mine.filter(
      (m) =>
        (show === 'all' || (show === 'new' ? hasNew(m) : m.check_status === 'not_found')) &&
        (!q || [m.title, m.matched_title, m.notes].some((s) => s?.toLowerCase().includes(q))),
    )
    const byTitle = (a: Manga, b: Manga) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    const by: Record<Sort, (a: Manga, b: Manga) => number> = {
      title: byTitle,
      behind: (a, b) => unread(b) - unread(a) || byTitle(a, b),
      read: (a, b) => (b.last_read ?? -1) - (a.last_read ?? -1) || byTitle(a, b),
    }
    return list.sort(by[sort])
  }, [mine, query, show, sort])

  const counts = { new: mine.filter(hasNew).length, missing: mine.filter((m) => m.check_status === 'not_found').length }
  const filtered = query !== '' || show !== 'all'

  return (
    <div>
      <PageHeader title={reading ? 'Reading' : 'Completed'}>
        {reading && (
          <Segmented
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: 'All' },
              { value: 'new', label: `New chapters${counts.new ? ` ${counts.new}` : ''}` },
              { value: 'missing', label: `Not found${counts.missing ? ` ${counts.missing}` : ''}` },
            ]}
          />
        )}
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label className="sr-only" htmlFor="manga-search">
            Search titles
          </label>
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input id="manga-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles" className={cx(inputClass, 'h-11 pl-10')} />
        </div>
        <label className="flex items-center gap-2 text-[14px] text-muted">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={cx(selectClass, 'h-11 w-auto px-4 pr-9 text-[14px]')}>
            {reading && <option value="behind">Most chapters behind</option>}
            <option value="title">Title A-Z</option>
            <option value="read">Last read chapter</option>
          </select>
        </label>
      </div>

      <p className="mb-4 px-1 text-[14px] text-muted">
        {rows.length} of {mine.length} titles
        {filtered && (
          <button
            onClick={() => {
              setQuery('')
              setShow('all')
            }}
            className="ml-3 text-accent hover:underline"
          >
            Clear filters
          </button>
        )}
      </p>

      <Card className="px-2 py-3 sm:px-3 sm:py-4">
        {loading && manga.length === 0 ? (
          <div className="flex flex-col gap-3 p-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          filtered ? (
            <Empty title="No matches" body="Nothing matches this search." />
          ) : (
            <Empty
              title={reading ? 'Nothing on the go' : 'Nothing finished yet'}
              body={reading ? 'Add a title and the latest chapter is looked up every week.' : 'Titles you mark completed show up here.'}
              action={
                reading && (
                  <Button variant="primary" onClick={() => openMangaComposer()}>
                    Add title
                  </Button>
                )
              }
            />
          )
        ) : (
          <>
            <MangaHeadings />
            <ul>
              <AnimatePresence initial={false}>
                {rows.map((m, i) => (
                  <MangaRow key={m.id} manga={m} index={i} />
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}

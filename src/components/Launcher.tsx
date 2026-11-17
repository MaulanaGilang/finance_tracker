import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowsClockwise, CaretRight, LockSimple, MagnifyingGlass, Plus, SquaresFour, type IconProps } from '@phosphor-icons/react'
import { NAV, TOOLS, type Tool } from './AppShell'
import { useStore } from '../lib/store'
import { cx } from './ui'

type Item = {
  id: string
  label: string
  hint: string
  group: 'Tools' | 'Pages' | 'Actions'
  icon: ComponentType<IconProps>
  keywords: string
  run: () => void
}

const TOOL_IDS = Object.keys(TOOLS) as Tool[]

/**
 * Raycast-style quick launcher: Ctrl / ⌘ + K (or the Search button) from anywhere.
 * Type to filter, arrow keys to move, Enter to run, Escape to close.
 */
export function Launcher() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()
  const { openComposer, openJobComposer, openMangaComposer, refreshNews, lock } = useStore()
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('ledger:launcher', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('ledger:launcher', onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to)
    // Actions open their form after moving into the tool, so the form matches the space around it
    const inTool = (to: string, fn: () => void) => () => {
      navigate(to)
      setTimeout(fn, 60)
    }
    return [
      ...TOOL_IDS.map((t) => ({
        id: `tool-${t}`, label: TOOLS[t].name, hint: 'Open', group: 'Tools' as const, icon: TOOLS[t].icon, keywords: `${t} ${TOOLS[t].name}`, run: go(TOOLS[t].home),
      })),
      { id: 'tool-home', label: 'All tools', hint: 'Open', group: 'Tools', icon: SquaresFour, keywords: 'home chooser lobby', run: go('/') },
      { id: 'add-tx', label: 'Add transaction', hint: 'Budget', group: 'Actions', icon: Plus, keywords: 'budget expense income money spend', run: inTool('/budget', () => openComposer()) },
      { id: 'add-job', label: 'Add job application', hint: 'Jobs', group: 'Actions', icon: Plus, keywords: 'jobs apply application', run: inTool('/jobs', () => openJobComposer()) },
      { id: 'add-manga', label: 'Add manga title', hint: 'Manga', group: 'Actions', icon: Plus, keywords: 'manga manhwa webtoon comic title', run: inTool('/manga', () => openMangaComposer()) },
      { id: 'refresh-news', label: 'Refresh news', hint: 'News', group: 'Actions', icon: ArrowsClockwise, keywords: 'news headlines update', run: inTool('/news', () => void refreshNews().catch(() => {})) },
      { id: 'lock', label: 'Lock Ledger', hint: 'Security', group: 'Actions', icon: LockSimple, keywords: 'lock pin sign out logout', run: () => void lock() },
      ...TOOL_IDS.flatMap((t) =>
        NAV[t]
          .filter((n) => n.to !== TOOLS[t].home)
          .map((n) => ({
            id: `page-${n.to}`, label: n.label, hint: TOOLS[t].name, group: 'Pages' as const, icon: n.icon, keywords: `${t} ${TOOLS[t].name} ${n.mobile}`, run: go(n.to),
          })),
      ),
    ]
  }, [navigate, openComposer, openJobComposer, openMangaComposer, refreshNews, lock])

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return items
    return items
      .map((it) => {
        const hay = `${it.label} ${it.hint} ${it.keywords}`.toLowerCase()
        if (!words.every((w) => hay.includes(w))) return null
        // Labels that start with what you typed come first
        const rank = it.label.toLowerCase().startsWith(words[0]) ? 0 : it.label.toLowerCase().includes(words[0]) ? 1 : 2
        return { it, rank }
      })
      .filter((x): x is { it: Item; rank: number } => !!x)
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.it)
  }, [items, query])

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const run = (it: Item | undefined) => {
    if (!it) return
    setOpen(false)
    it.run()
  }

  // Group headings in result order
  const grouped: { group: Item['group']; items: { it: Item; i: number }[] }[] = []
  results.forEach((it, i) => {
    const last = grouped[grouped.length - 1]
    if (last && last.group === it.group) last.items.push({ it, i })
    else grouped.push({ group: it.group, items: [{ it, i }] })
  })

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Quick launcher">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[4px]"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 520, damping: 36 } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            className="relative w-full max-w-[640px] overflow-hidden elevated rounded-[16px] bg-[#07080a]/95 backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <MagnifyingGlass size={18} className="shrink-0 text-faint" />
              <label htmlFor="launcher-input" className="sr-only">
                Search tools, pages and actions
              </label>
              <input
                id="launcher-input"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') (e.preventDefault(), setIndex((i) => Math.min(results.length - 1, i + 1)))
                  else if (e.key === 'ArrowUp') (e.preventDefault(), setIndex((i) => Math.max(0, i - 1)))
                  else if (e.key === 'Enter') (e.preventDefault(), run(results[index]))
                  else if (e.key === 'Escape') (e.preventDefault(), setOpen(false))
                }}
                placeholder="Search tools, pages and actions…"
                autoComplete="off"
                className="h-14 w-full bg-transparent text-[16px] text-ink placeholder:text-faint focus:outline-none"
              />
              <span className="hidden sm:inline-flex">
                <span className="kbd">esc</span>
              </span>
            </div>
            <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
              {results.length === 0 ? (
                <li className="px-3 py-8 text-center text-[14px] text-muted">Nothing matches "{query}".</li>
              ) : (
                grouped.map((g) => (
                  <li key={g.group + g.items[0].i} role="presentation">
                    <p className="eyebrow px-3 pb-1.5 pt-3">{g.group}</p>
                    <ul role="presentation">
                      {g.items.map(({ it, i }) => {
                        const Icon = it.icon
                        const active = i === index
                        return (
                          <li key={it.id} role="option" aria-selected={active} data-index={i}>
                            <button
                              onMouseMove={() => setIndex(i)}
                              onClick={() => run(it)}
                              className={cx(
                                'flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors',
                                active ? 'bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]' : 'hover:bg-raised/60',
                              )}
                            >
                              <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#1b1c1e]', active ? 'text-ink' : 'text-muted')}>
                                <Icon size={15} weight={it.group === 'Tools' ? 'fill' : 'regular'} />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{it.label}</span>
                              <span className="shrink-0 text-[12px] text-faint">{it.hint}</span>
                              {active && <CaretRight size={13} className="shrink-0 text-faint" />}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))
              )}
            </ul>
            <div className="hidden items-center justify-between border-t border-line px-4 py-2.5 font-mono text-[11px] text-faint sm:flex">
              <span>Ledger</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="kbd">↑↓</span> move
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="kbd">↵</span> open
                </span>
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

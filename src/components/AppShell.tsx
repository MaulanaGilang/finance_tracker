import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  BookmarkSimple,
  BookOpenText,
  CheckCircle,
  Newspaper,
  Rows,
  Briefcase,
  ChartBar,
  GearSix,
  Kanban,
  ListBullets,
  MagnifyingGlass,
  Plus,
  Sparkle,
  SquaresFour,
  Table,
  Wallet,
} from '@phosphor-icons/react'
import { pillSpring } from '../lib/motion'
import { useStore } from '../lib/store'
import { cx } from './ui'

export type Tool = 'budget' | 'jobs' | 'news' | 'manga'

export const TOOLS = {
  budget: { name: 'Budget', icon: Wallet, home: '/budget' },
  jobs: { name: 'Job Applications', icon: Briefcase, home: '/jobs' },
  news: { name: 'News', icon: Newspaper, home: '/news' },
  manga: { name: 'Manga', icon: BookOpenText, home: '/manga' },
} as const

export const NAV = {
  budget: [
    { to: '/budget', label: 'Dashboard', mobile: 'Dashboard', icon: SquaresFour },
    { to: '/budget/transactions', label: 'Transactions', mobile: 'History', icon: ListBullets },
    { to: '/budget/reports', label: 'Reports', mobile: 'Reports', icon: ChartBar },
    { to: '/budget/settings', label: 'Settings', mobile: 'Settings', icon: GearSix },
  ],
  jobs: [
    { to: '/jobs', label: 'Dashboard', mobile: 'Dashboard', icon: SquaresFour },
    { to: '/jobs/recommended', label: 'Recommended', mobile: 'For you', icon: Sparkle },
    { to: '/jobs/applications', label: 'Applications', mobile: 'List', icon: Table },
    // Phones have room for four tabs: Board is reached from the Table / Board switch on Applications
    { to: '/jobs/board', label: 'Board', mobile: 'Board', icon: Kanban, desktopOnly: true },
    { to: '/jobs/settings', label: 'Settings', mobile: 'Settings', icon: GearSix },
  ],
  news: [
    { to: '/news', label: 'Briefing', mobile: 'Briefing', icon: SquaresFour },
    { to: '/news/feed', label: 'Feed', mobile: 'Feed', icon: Rows },
    { to: '/news/saved', label: 'Saved', mobile: 'Saved', icon: BookmarkSimple },
    { to: '/news/settings', label: 'Settings', mobile: 'Settings', icon: GearSix },
  ],
  manga: [
    { to: '/manga', label: 'Updates', mobile: 'Updates', icon: SquaresFour },
    { to: '/manga/reading', label: 'Reading', mobile: 'Reading', icon: BookOpenText },
    { to: '/manga/completed', label: 'Completed', mobile: 'Done', icon: CheckCircle },
    { to: '/manga/settings', label: 'Settings', mobile: 'Settings', icon: GearSix },
  ],
} as const

type NavItem = (typeof NAV)[Tool][number]

/** Re-tints the whole app for the active tool (Arc-style spaces). */
export function useToolTheme(tool: Tool | null) {
  useEffect(() => {
    if (tool) document.documentElement.dataset.tool = tool
    else delete document.documentElement.dataset.tool
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#040506')
  }, [tool])
}

/** Two concentric rings in Ledger's coral, the one brand mark (it doesn't change with the tool) */
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-[8px] bg-coral text-canvas shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
        <svg width="16" height="16" viewBox="0 0 44 44" aria-hidden>
          <circle cx="22" cy="22" r="17" fill="none" stroke="currentColor" strokeWidth="3.6" />
          <circle cx="22" cy="22" r="8.5" fill="none" stroke="currentColor" strokeWidth="3.6" />
        </svg>
      </span>
      <span className="text-[14px] font-medium tracking-[0.01em]">Ledger</span>
    </span>
  )
}

/** Opens the quick launcher (Ctrl / ⌘ + K) */
export const openLauncher = () => window.dispatchEvent(new Event('ledger:launcher'))
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const launcherKey = isMac ? '⌘K' : 'Ctrl K'

function LauncherButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      onClick={openLauncher}
      aria-label="Search tools and actions"
      className={cx(
        'inline-flex items-center gap-2 rounded-[8px] text-[13px] text-muted transition-colors hover:bg-raised hover:text-ink',
        compact ? 'size-9 justify-center' : 'h-8 pl-2.5 pr-1.5',
      )}
    >
      <MagnifyingGlass size={compact ? 18 : 15} />
      {!compact && (
        <>
          <span>Search</span>
          <span className="kbd">{launcherKey}</span>
        </>
      )}
    </button>
  )
}

/** Shows the current tool; tapping returns to the tool chooser */
function ToolSwitch({ tool }: { tool: Tool }) {
  const { name, icon: Icon } = TOOLS[tool]
  return (
    <Link
      to="/"
      title="Switch tool"
      className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-raised pl-2 pr-2.5 text-[13px] font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_0_0_1px_rgb(255_255_255/0.06)] transition-colors hover:bg-[#18191b]"
    >
      <Icon size={15} weight="fill" className="text-accent" />
      <span className="max-w-[9rem] truncate">{name}</span>
      <ArrowsLeftRight size={13} className="text-faint" />
    </Link>
  )
}

export function AppShell({ tool, children }: { tool: Tool; children: ReactNode }) {
  const { openComposer, openJobComposer, openMangaComposer, refreshNews, newsRefreshing } = useStore()
  useToolTheme(tool)
  const nav = NAV[tool]
  const mobileNav = nav.filter((i) => !('desktopOnly' in i && i.desktopOnly))
  // The primary action per tool: add a transaction, an application or a title, or pull fresh news
  const add = () =>
    tool === 'jobs' ? openJobComposer() : tool === 'manga' ? openMangaComposer() : tool === 'news' ? void refreshNews().catch(() => {}) : openComposer()
  const addLabel = { budget: 'Add transaction', jobs: 'Add application', manga: 'Add title', news: 'Refresh news' }[tool]
  const isNews = tool === 'news'

  return (
    <div className="min-h-[100dvh]">
      {/* Desktop / tablet: Raycast's floating glass bar */}
      <header className="sticky top-3 z-20 hidden px-8 md:block">
        <div className="glass-bar mx-auto flex h-12 max-w-[1200px] items-center justify-between gap-4 rounded-[8px] pl-4 pr-2">
          <div className="flex items-center gap-3">
            <Link to="/" aria-label="All tools">
              <Logo />
            </Link>
            <span className="h-4 w-px bg-line-strong" aria-hidden />
            <ToolSwitch tool={tool} />
          </div>
          <nav aria-label="Main" className="flex items-center gap-0.5">
            {nav.map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === TOOLS[tool].home} className="relative rounded-[8px] px-3 py-1.5 text-[13px] font-medium">
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        transition={pillSpring}
                        className="absolute inset-0 rounded-[8px] bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.07),0_0_0_1px_rgb(255_255_255/0.06)]"
                      />
                    )}
                    <span className={cx('relative transition-colors', isActive ? 'text-ink' : 'text-muted hover:text-ink')}>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <LauncherButton />
            <motion.button
              onClick={add}
              whileTap={{ scale: 0.97 }}
              className="glow-button inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium"
            >
              {isNews ? <ArrowsClockwise size={14} weight="bold" className={newsRefreshing ? 'animate-spin' : undefined} /> : <Plus size={14} weight="bold" />}
              {isNews ? (newsRefreshing ? 'Refreshing' : 'Refresh') : 'Add'}
            </motion.button>
          </div>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="flex h-14 items-center justify-between gap-2 px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <Link to="/" aria-label="All tools">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <LauncherButton compact />
          <ToolSwitch tool={tool} />
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 pb-32 pt-4 md:px-8 md:pb-16 md:pt-10">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line-strong/70 bg-canvas/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          {mobileNav.slice(0, 2).map((item) => (
            <TabLink key={item.to} item={item} end={item.to === TOOLS[tool].home} />
          ))}
          <div className="flex justify-center">
            <AddFab onClick={add} label={addLabel} icon={isNews ? <ArrowsClockwise size={22} weight="bold" className={newsRefreshing ? 'animate-spin' : undefined} /> : undefined} />
          </div>
          {mobileNav.slice(2).map((item) => (
            <TabLink key={item.to} item={item} end={item.to === TOOLS[tool].home} />
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Centre + button: presses in, and a soft ring ripples out on each tap */
function AddFab({ onClick, label, icon }: { onClick: () => void; label: string; icon?: ReactNode }) {
  const [pulse, setPulse] = useState(0)
  return (
    <motion.button
      onClick={() => {
        setPulse((p) => p + 1)
        onClick()
      }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      aria-label={label}
      className="glow-button relative flex size-12 items-center justify-center rounded-full"
    >
      <AnimatePresence>
        {pulse > 0 && (
          <motion.span
            key={pulse}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.7, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
      {icon ?? <Plus size={22} weight="bold" />}
    </motion.button>
  )
}

function TabLink({ item: { to, mobile, icon: Icon }, end }: { item: NavItem; end: boolean }) {
  return (
    <NavLink to={to} end={end} className="relative flex flex-col items-center gap-1 py-1 text-[11px]">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId="tab-pill" transition={pillSpring} className="absolute -top-0.5 h-8 w-12 rounded-[8px] bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.07)]" />
          )}
          <Icon size={22} weight={isActive ? 'fill' : 'regular'} className={cx('relative mt-0.5', isActive ? 'text-accent' : 'text-faint')} />
          <span className={cx('relative', isActive ? 'font-medium text-ink' : 'text-faint')}>{mobile}</span>
        </>
      )}
    </NavLink>
  )
}

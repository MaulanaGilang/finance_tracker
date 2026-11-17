import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight, BookOpenText, Briefcase, LockSimple, MagnifyingGlass, Newspaper, Wallet } from '@phosphor-icons/react'
import { mangaKpis } from '../lib/manga'
import { Logo, launcherKey, openLauncher, useToolTheme } from '../components/AppShell'
import { dayLabel } from '../lib/format'
import { goingQuiet, jobKpis } from '../lib/jobs'
import { isHighImpact, within } from '../lib/news'
import { EASE_OUT, itemVariants, listVariants } from '../lib/motion'
import { useStore } from '../lib/store'

const greeting = () => {
  const h = new Date().getHours()
  return h < 11 ? 'Good morning' : h < 15 ? 'Good afternoon' : h < 19 ? 'Good evening' : 'Good night'
}

/** After the PIN: pick a tool. Each card glows in its own tool color (Arc-style spaces). */
export function ToolChooser() {
  const { transactions, jobs, news, manga, lock } = useStore()
  useToolTheme(null)

  // Budget shows when you last logged something rather than any amount
  const lastEntry = transactions[0]?.date
  const day = lastEntry ? dayLabel(lastEntry) : ''
  const lastLabel = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
  const k = jobKpis(jobs)
  const quiet = goingQuiet(jobs).length
  const today = news.filter((a) => within(a.published_at, 24))
  const movers = today.filter(isHighImpact).length
  const mk = mangaKpis(manga)

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[1200px] flex-col px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
      <header className="flex h-16 items-center justify-between">
        <Logo />
        <button onClick={() => lock()} className="inline-flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-muted transition-colors hover:bg-raised hover:text-ink">
          <LockSimple size={15} /> Lock
        </button>
      </header>

      <motion.main className="flex flex-1 flex-col justify-center gap-10 py-8" variants={listVariants} initial="initial" animate="animate">
        <motion.div variants={itemVariants} className="flex flex-col items-center text-center">
          <p className="eyebrow mb-4">{greeting()}</p>
          <h1 className="text-balance text-[32px] font-normal leading-[1.12] tracking-[0.004em] sm:text-[56px]">What are we tracking?</h1>
          {/* Raycast's front door: one bar to reach everything */}
          <button
            onClick={openLauncher}
            className="mt-8 flex h-12 w-full max-w-[520px] items-center gap-3 rounded-[8px] bg-white/[0.05] px-3 text-left text-[16px] text-muted transition-colors hover:bg-white/[0.07]"
          >
            <MagnifyingGlass size={18} />
            <span className="flex-1 truncate">
              Search<span className="hidden sm:inline"> tools, pages and actions</span>…
            </span>
            <span className="hidden sm:inline-flex">
              <span className="kbd">{launcherKey}</span>
            </span>
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-4">
          <ToolCard
            to="/budget"
            icon={<Wallet size={22} />}
            title="Budget"
            body="Income, spending and reports."
            stat={lastEntry ? `Last entry ${lastLabel}` : 'No entries yet'}
            accent="#59d499"
          />
          <ToolCard
            to="/jobs"
            icon={<Briefcase size={22} />}
            title="Job Applications"
            body="Pipeline, follow-ups and responses."
            stat={`${k.active} active${quiet ? ` · ${quiet} going quiet` : ''}`}
            accent="#63a1ff"
          />
          <ToolCard
            to="/news"
            icon={<Newspaper size={22} />}
            title="News"
            body="AI, robotics, geopolitics and the markets."
            stat={`${today.length} today${movers ? ` · ${movers} market movers` : ''}`}
            accent="#ff7a93"
          />
          <ToolCard
            to="/manga"
            icon={<BookOpenText size={22} />}
            title="Manga"
            body="What you're reading and what came out."
            stat={`${mk.reading} reading${mk.withNew ? ` · ${mk.withNew} with new chapters` : ''}`}
            accent="#f5b14c"
          />
        </motion.div>
      </motion.main>
    </div>
  )
}

/** One tool, like an extension in Raycast's store: a black key-cap card with the tool's hue leaking in */
function ToolCard({ to, icon, title, body, stat, accent }: { to: string; icon: ReactNode; title: string; body: string; stat: string; accent: string }) {
  return (
    // h-full on the wrapper and the link: cards in a row share one height even when a title wraps
    <motion.div className="h-full" whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
      <Link
        to={to}
        style={{ '--panel-accent': accent } as CSSProperties}
        className="glow-panel group flex h-full min-h-[200px] flex-col justify-between rounded-[20px] p-6 outline-offset-4 sm:min-h-[240px]"
      >
        {/* The tool's light, brighter on hover */}
        <span className="light transition-opacity duration-500 group-hover:opacity-40" style={{ width: 280, height: 280, right: '-18%', top: '-45%', background: accent, opacity: 0.22 }} />

        <span
          className="flex size-11 items-center justify-center rounded-full bg-[#1b1c1e] text-mist shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_0_0_1px_rgb(255_255_255/0.06)]"
        >
          {icon}
        </span>
        <div>
          <h2 className="mb-1 text-[22px] font-medium leading-[1.2] tracking-[0.004em]">{title}</h2>
          <p className="mb-5 text-[14px] leading-[1.45] text-muted">{body}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 rounded-[6px] bg-[#1b1c1e] px-2 py-1 font-mono text-[12px] leading-[1.5] tabular-nums text-muted">{stat}</span>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-faint transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-ink">
              <ArrowRight size={16} />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

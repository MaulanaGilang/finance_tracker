import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowCounterClockwise, ArrowSquareOut, ArrowsClockwise, Check, Info, X } from '@phosphor-icons/react'
import { Button, Card, Empty, IconButton, PageHeader, Segmented, cx } from '../../components/ui'
import { friendlyError } from '../../lib/api'
import { SOURCE_LABEL, TIER, TIER_ORDER, byFit, leadPay, type JobLead, type LeadTier } from '../../lib/leads'
import { EASE_OUT } from '../../lib/motion'
import { timeAgo } from '../../lib/news'
import { useStore } from '../../lib/store'

type View = 'todo' | 'filtered' | 'hidden'

/** Jobs found for you, best fit first. Applied moves a job to Applications; Skip hides it. */
export function Recommended() {
  const { leads, leadsInfo, scanJobs } = useStore()
  const [view, setView] = useState<View>('todo')
  const [msg, setMsg] = useState<{ text: string; applied?: boolean } | null>(null)
  const [scanning, setScanning] = useState(false)

  const groups = useMemo(() => {
    const open = leads.filter((l) => l.status === 'new')
    return {
      todo: open.filter((l) => l.tier !== 'skip').sort(byFit),
      filtered: open.filter((l) => l.tier === 'skip').sort(byFit),
      hidden: leads.filter((l) => l.status === 'skipped').sort(byFit),
    }
  }, [leads])
  const list = groups[view]

  const scan = async () => {
    setScanning(true)
    try {
      setMsg({ text: await scanJobs() })
    } catch (e) {
      setMsg({ text: friendlyError(e) })
    } finally {
      setScanning(false)
    }
  }

  const sources = [
    leadsInfo?.companies ? `${leadsInfo.companies} company job boards${leadsInfo.last_scan ? `, checked ${timeAgo(leadsInfo.last_scan)}` : ''}` : null,
    leadsInfo?.last_email ? `alert emails, last ${timeAgo(leadsInfo.last_email)}` : 'alert emails not connected yet',
  ].filter(Boolean)

  return (
    <div>
      <PageHeader title="Recommended">
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'todo', label: `To decide${groups.todo.length ? ` ${groups.todo.length}` : ''}` },
            { value: 'filtered', label: `Filtered out${groups.filtered.length ? ` ${groups.filtered.length}` : ''}` },
            { value: 'hidden', label: `Skipped${groups.hidden.length ? ` ${groups.hidden.length}` : ''}` },
          ]}
        />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-[14px] text-muted">Jobs from the last 24 hours, from {sources.join(' and ')}. Scored by your rules.</p>
        <Button variant="ghost" className="h-9 px-4 text-[14px]" disabled={scanning} onClick={() => void scan()}>
          <ArrowsClockwise size={15} className={scanning ? 'animate-spin' : undefined} />
          {scanning ? 'Checking…' : 'Check company boards'}
        </Button>
      </div>

      <AnimatePresence>
        {msg && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="mb-4 flex items-center justify-between gap-3 rounded-card bg-accent-soft px-4 py-3 text-[14px]"
          >
            <span>
              {msg.text}
              {msg.applied && (
                <Link to="/jobs/applications" className="ml-2 font-[480] text-accent hover:underline">
                  Open Applications
                </Link>
              )}
            </span>
            <IconButton label="Dismiss" className="size-8" onClick={() => setMsg(null)}>
              <X size={15} />
            </IconButton>
          </motion.p>
        )}
      </AnimatePresence>

      {view === 'filtered' && list.length > 0 && (
        <p className="mb-4 flex gap-2 px-1 text-[13px] leading-[1.5] text-muted">
          <Info size={16} className="mt-px shrink-0" />
          These broke one of your rules (bank or lending, outsourcing company, 3+ years, too senior, pay under Rp 7 jt and so on). They're here so you can check the rules
          got it right.
        </p>
      )}

      {list.length === 0 ? (
        <Card>
          <Empty
            title={view === 'todo' ? 'Nothing new to decide on' : view === 'filtered' ? 'Nothing filtered out' : 'Nothing skipped'}
            body={
              view === 'todo'
                ? 'Jobs from the last 24 hours show up here: company boards are checked every morning and alert emails come in through the day. Each morning, anything older you have not acted on is cleared.'
                : view === 'filtered'
                  ? 'Jobs that break your rules would show up here.'
                  : "Jobs you skip stay here until the next morning's check, in case you change your mind."
            }
          />
        </Card>
      ) : view === 'todo' ? (
        <div className="flex flex-col gap-6">
          {TIER_ORDER.filter((t) => t !== 'skip' && list.some((l) => l.tier === t)).map((tier) => (
            <TierCard key={tier} tier={tier} leads={list.filter((l) => l.tier === tier)} onMessage={setMsg} />
          ))}
        </div>
      ) : (
        <Card className="px-2 py-3 sm:px-3 sm:py-4">
          <ul>
            <AnimatePresence initial={false}>
              {list.map((l) => (
                <LeadRow key={l.id} lead={l} onMessage={setMsg} />
              ))}
            </AnimatePresence>
          </ul>
        </Card>
      )}
    </div>
  )
}

function TierCard({ tier, leads, onMessage }: { tier: LeadTier; leads: JobLead[]; onMessage: (m: { text: string; applied?: boolean }) => void }) {
  return (
    <Card className="px-2 py-3 sm:px-3 sm:py-4">
      <div className="mb-1 flex items-baseline justify-between gap-3 px-2 sm:px-3">
        <h2 className="text-[15px] font-[480]">
          {TIER[tier].label} <span className="font-normal text-muted">{leads.length}</span>
        </h2>
        <p className="hidden text-[13px] text-muted sm:block">{TIER[tier].hint}</p>
      </div>
      <ul>
        <AnimatePresence initial={false}>
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} onMessage={onMessage} />
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  )
}

function LeadRow({ lead, onMessage }: { lead: JobLead; onMessage: (m: { text: string; applied?: boolean }) => void }) {
  const { applyLead, setLeadSkipped } = useStore()
  const [busy, setBusy] = useState(false)
  const pay = leadPay(lead)
  const hidden = lead.status === 'skipped'

  const apply = async () => {
    setBusy(true)
    try {
      await applyLead(lead.id)
      onMessage({ text: `${lead.title} at ${lead.company} moved to Applications.`, applied: true })
    } catch (e) {
      onMessage({ text: friendlyError(e) })
      setBusy(false)
    }
  }
  const skip = async () => {
    setBusy(true)
    try {
      await setLeadSkipped(lead.id, !hidden)
    } catch (e) {
      onMessage({ text: friendlyError(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.22, ease: EASE_OUT } }}
      className="overflow-hidden"
    >
      <div className="flex flex-col gap-3 rounded-[10px] px-2 py-3 transition-colors hover:bg-raised sm:flex-row sm:items-start sm:px-3">
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2">
            {lead.url ? (
              <a href={lead.url} target="_blank" rel="noreferrer" className="truncate text-[15px] font-[440] hover:text-accent hover:underline">
                {lead.title}
              </a>
            ) : (
              <span className="truncate text-[15px] font-[440]">{lead.title}</span>
            )}
            {lead.url && <ArrowSquareOut size={14} className="shrink-0 text-muted" aria-hidden />}
          </p>
          <p className="truncate text-[13px] text-muted">
            {[lead.company, lead.location, SOURCE_LABEL[lead.source], pay, `seen ${timeAgo(lead.first_seen_at)}`].filter(Boolean).join(' · ')}
          </p>
          {(lead.note || lead.flags.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {lead.flags.map((f) => (
                <span
                  key={f}
                  className={cx(
                    'rounded-pill px-2 py-0.5 text-[12px]',
                    lead.tier === 'skip' ? 'bg-expense/10 text-expense' : 'bg-[#f6e7c8] text-[#6b4a10]',
                  )}
                >
                  {f.replace(/\.$/, '')}
                </span>
              ))}
              {lead.note && lead.tier !== 'skip' && <span className="text-[12px] text-muted">{lead.note}</span>}
              {lead.tier === 'skip' && lead.note && <span className="text-[12px] text-muted">{lead.note.replace(/^Skipped: /, '')}</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!hidden && (
            <Button variant="primary" className="h-9 px-4 text-[14px]" disabled={busy} onClick={() => void apply()}>
              <Check size={15} weight="bold" /> Applied
            </Button>
          )}
          <Button variant="ghost" className="h-9 px-4 text-[14px]" disabled={busy} onClick={() => void skip()}>
            {hidden ? (
              <>
                <ArrowCounterClockwise size={15} /> Bring back
              </>
            ) : (
              'Skip'
            )}
          </Button>
        </div>
      </div>
    </motion.li>
  )
}

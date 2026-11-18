// Job scout: finds data jobs in Indonesia and scores them with your rules (rules.ts).
//   action "scan"   - company job boards with an open feed (Greenhouse, Lever, Ashby, Workable, SmartRecruiters),
//                     a few companies per run, each at most once a day. Run by pg_cron and by "Scan now" in the app.
//   action "ingest" - job-alert emails (LinkedIn, JobStreet, Glints) pushed by the Google Apps Script in your Gmail.
//                     Needs the ingest key from job_scout_settings.
//   action "status" - recruiting emails (interview invites, tests, offers, rejections) from the same script:
//                     moves your applications' statuses (status.ts). Same key.
// No logins, no scraping of sites that block it: public feeds, your own emails, and each emailed job's public page
// (to read its real posting date: only jobs posted in the last day are recommended).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { judge } from './rules.ts'
import { BOARDS, COMPANIES_PER_RUN, FRESH_HOURS, RESCAN_HOURS, cors, fromEmail, json, verifyLeads, type Company, type Lead, type Mail } from './sources.ts'
import { RANK, classify, matchJob, type JobRow } from './status.ts'

/**
 * Recruiting emails -> application status, oldest first (so "skill test" then "rejected" ends rejected).
 * Status only moves forward; a rejection closes it; anything you set by hand after the email is left alone.
 * Every email that says something is logged with the previous values, so the dashboard can undo it.
 */
async function applyStatusEmails(db: SupabaseClient, mails: Mail[]) {
  const sorted = [...mails].filter((m) => m.id && m.date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const { data: seen } = await db.from('job_status_events').select('message_id').in('message_id', sorted.map((m) => m.id))
  const done = new Set((seen ?? []).map((r) => r.message_id))
  const { data: jobs, error } = await db
    .from('job_applications')
    .select('id, company, position, platform, status, applied_date, status_changed_at, max_stage, auto_ghosted')
  if (error) throw error
  const list = (jobs ?? []) as JobRow[]
  const tally: Record<string, number> = { emails: sorted.length, new: 0 }

  for (const m of sorted) {
    if (done.has(m.id)) continue
    tally.new++
    const v = classify(m)
    if (!v) continue
    const match = matchJob(m, v, list)
    const row: Record<string, unknown> = {
      message_id: m.id, received_at: m.date, sender: m.from.slice(0, 200), subject: m.subject.slice(0, 300), kind: v.kind,
      evidence: v.evidence.slice(0, 200), guessed_company: v.company?.slice(0, 120) ?? null, guessed_position: v.position?.slice(0, 120) ?? null,
    }
    let outcome = 'unmatched'
    if (match) {
      const j = match.job
      const sent = Date.parse(m.date)
      // You set this status yourself after the email arrived: yours wins (the ghost rule's change doesn't count)
      const handSetLater = sent < Date.parse(j.status_changed_at) && !j.auto_ghosted && j.status !== 'applied'
      if (j.status === 'accepted' || handSetLater) outcome = 'skipped'
      else if (v.kind === 'rejected') outcome = j.status === 'rejected' ? 'already' : 'updated'
      else if (j.status === 'rejected') outcome = 'skipped'
      else outcome = RANK[v.kind] > (RANK[j.status] ?? 0) ? 'updated' : 'already'

      Object.assign(row, { job_id: j.id, match_note: match.note })
      if (outcome === 'updated') {
        Object.assign(row, { prev_status: j.status, prev_status_changed_at: j.status_changed_at, prev_max_stage: j.max_stage, prev_auto_ghosted: j.auto_ghosted })
        const next = {
          status: v.kind,
          status_changed_at: new Date(sent).toISOString(),
          max_stage: Math.max(j.max_stage, RANK[v.kind] ?? 0),
          auto_ghosted: false,
          updated_at: new Date().toISOString(),
        }
        const { error: e } = await db.from('job_applications').update(next).eq('id', j.id)
        if (e) throw e
        Object.assign(j, next)
      }
    }
    row.outcome = outcome
    const { error: e } = await db.from('job_status_events').insert(row)
    if (e && e.code !== '23505') throw e
    tally[outcome] = (tally[outcome] ?? 0) + 1
  }
  return tally
}

/** Recommendations you haven't acted on are removed at the first morning check after this many hours */
const KEEP_HOURS = 20

/** Score and store new leads (a job already seen is left as it is, including what you decided about it) */
async function save(db: SupabaseClient, leads: Lead[]) {
  if (!leads.length) return 0
  const rows = leads.map((l) => {
    const v = judge(l)
    return {
      source: l.source, source_job_id: l.source_job_id, company: l.company, title: l.title, location: l.location ?? null, url: l.url,
      description: l.description ? l.description.slice(0, 20000) : null, description_read: l.description_read,
      salary_min: l.salary_min ?? null, salary_max: l.salary_max ?? null, employment_type: l.employment_type ?? null, posted_at: l.posted_at,
      tier: v.tier, score: v.score, note: v.note, flags: v.flags, reasons: v.reasons,
    }
  })
  const { data, error } = await db.from('job_leads').upsert(rows, { onConflict: 'source,source_job_id', ignoreDuplicates: true }).select('id')
  if (error) throw error
  return data?.length ?? 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))

  try {
    const cutoff = Date.now() - FRESH_HOURS * 3600e3

    // Recruiting emails from the Gmail script: move application statuses
    if (body?.action === 'status') {
      const { data: s } = await db.from('job_scout_settings').select('ingest_key').single()
      if (!s || body.key !== s.ingest_key) return json({ error: 'bad key' }, 401)
      const mails = (Array.isArray(body.messages) ? body.messages : []) as Mail[]
      return json(await applyStatusEmails(db, mails))
    }

    if (body?.action === 'ingest') {
      const { data: s } = await db.from('job_scout_settings').select('ingest_key').single()
      if (!s || body.key !== s.ingest_key) return json({ error: 'bad key' }, 401)
      // Only alerts from the last day. The Gmail script runs once a day at a slightly different minute each time,
      // so allow 2 hours of overlap; the script's label stops an email being sent twice.
      const since = cutoff - 2 * 3600e3
      const mails = ((Array.isArray(body.messages) ? body.messages : []) as Mail[]).filter((m) => Date.parse(m.date) >= since)
      // The same job can come in several emails: keep one
      const dedupe = (list: Lead[]) => [...new Map(list.map((l) => [`${l.source}:${l.source_job_id}`, l])).values()]
      const found = dedupe(mails.flatMap((m) => fromEmail(m)))
      // Each job's own page: real posting date (the email's date isn't it), still open, full text for the rules
      const checked = await verifyLeads(found, since)
      const count = (v: string) => checked.filter((c) => c.verdict === v).length
      const fresh = dedupe(checked.filter((c) => c.verdict === 'ok').map((c) => c.lead))
      return json({
        emails: mails.length,
        jobs: found.length,
        posted_last_day: fresh.length,
        older: count('old'),
        closed: count('closed'),
        date_unknown: count('unknown'),
        added: await save(db, fresh),
      })
    }

    // Yesterday's recommendations you didn't act on go first (Applied ones are already in Applications).
    // 20 hours, not 24: the morning check (07:00) must also clear what the Gmail script added at 08:00 the day before.
    const { count: removed } = await db
      .from('job_leads')
      .delete({ count: 'exact' })
      .in('status', ['new', 'skipped'])
      .lt('first_seen_at', new Date(Date.now() - KEEP_HOURS * 3600e3).toISOString())

    // Company boards: the ones not scanned in the last day, a few per run
    const since = new Date(Date.now() - RESCAN_HOURS * 3600e3).toISOString()
    const { data: companies, error } = await db
      .from('job_companies')
      .select('id, name, ats, slug')
      .eq('enabled', true)
      .or(`last_scanned_at.is.null,last_scanned_at.lt.${since}`)
      .order('last_scanned_at', { ascending: true, nullsFirst: true })
      .limit(COMPANIES_PER_RUN)
    if (error) throw error
    const report: Record<string, number | string> = {}
    for (const c of (companies ?? []) as Company[]) {
      try {
        // Only jobs posted in the last 24 hours (a job with no date counts as new when first seen)
        const leads = (await BOARDS[c.ats](c)).filter((l) => !l.posted_at || Date.parse(l.posted_at) >= cutoff)
        const added = await save(db, leads)
        await db.from('job_companies').update({ last_scanned_at: new Date().toISOString(), last_error: null, last_found: leads.length }).eq('id', c.id)
        report[c.name] = added
      } catch (e) {
        await db.from('job_companies').update({ last_scanned_at: new Date().toISOString(), last_error: String(e).slice(0, 300) }).eq('id', c.id)
        report[c.name] = `error: ${String(e).slice(0, 80)}`
      }
    }
    const { count } = await db.from('job_companies').select('id', { count: 'exact', head: true }).eq('enabled', true).or(`last_scanned_at.is.null,last_scanned_at.lt.${since}`)
    return json({ scanned: companies?.length ?? 0, added: report, remaining: count ?? 0, removed: removed ?? 0 })
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})

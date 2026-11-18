/**
 * Sends two kinds of email from your Gmail to Ledger's job scout, once a day (08:00-09:00, after JobStreet's morning alert):
 *  - job alerts (LinkedIn, JobStreet, Glints): Ledger opens each job's page and recommends the ones posted in the last 24 hours
 *  - recruiting emails (interview invites, tests, offers, rejections): Ledger moves your applications' statuses
 * Runs in your own Google account (script.google.com). It only reads; it never sends, deletes or changes any email
 * (job alerts get the label "Ledger/Sent" so each is sent once; Ledger itself skips recruiting emails it has seen).
 *
 * Setup:
 *  1. script.google.com > New project, paste this file, fill in the three values in CONFIG.
 *  2. Run "setUp" once and approve the permissions Google asks for.
 *  3. Run "backfillStatusEmails" once: sends the last 60 days of recruiting emails, so your applications catch up.
 */
const CONFIG = {
  url: 'https://jjflnjfterzpgmhocqxc.supabase.co/functions/v1/job-scout',
  anonKey: 'PASTE_PUBLIC_ANON_KEY',
  ingestKey: 'PASTE_INGEST_KEY',
  label: 'Ledger/Sent',
}

const QUERY =
  'from:(jobalerts-noreply@linkedin.com OR jobs-noreply@linkedin.com OR jobs-listings@linkedin.com OR e.jobstreet.com OR jobstreet.com OR glints.com OR glints.id) ' +
  'newer_than:2d -label:Ledger-Sent'

// Anything that might be about a recruiting process: from a hiring tool or job site, recruiting words in the subject,
// or a recruiting phrase anywhere in the email. Ledger decides what each one actually says, and ignores the rest.
const STATUS_QUERY = (days) =>
  `newer_than:${days}d -from:me -in:spam -in:trash ` +
  '-from:(jobalerts-noreply@linkedin.com OR jobalert.indeed.com OR newsletters-noreply@linkedin.com OR jobs-listings@linkedin.com) ' +
  '{subject:(lamaran OR lamaranmu OR application OR interview OR wawancara OR undangan OR invitation OR invited OR invite OR ' +
  'psikotes OR test OR tes OR asesmen OR assessment OR screening OR shortlisted OR seleksi OR selection OR offer OR offering OR ' +
  '"medical check" OR MCU OR recruitment OR rekrutmen OR recruiting OR hiring OR kandidat OR candidate OR pembaruan OR ' +
  '"your interest" OR "next step" OR "next stage" OR panggilan OR jadwal) ' +
  'from:(lever.co OR greenhouse.io OR darwinbox OR mokahr OR gohire OR indeed.com OR jobstreet OR jobs-noreply@linkedin.com OR ' +
  'glints OR kalibrr OR techinasia OR workable OR smartrecruiters OR ashbyhq OR recruiting OR recruitment OR careers OR talent) ' +
  '"screening process" OR "proses seleksi" OR "tahap seleksi" OR "regret to inform" OR "move forward with other" OR ' +
  '"not moving forward" OR "tahap selanjutnya" OR "next stage of"}'

function post(action, messages) {
  for (let i = 0; i < messages.length; i += 20) {
    const res = UrlFetchApp.fetch(CONFIG.url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + CONFIG.anonKey, apikey: CONFIG.anonKey },
      payload: JSON.stringify({ action: action, key: CONFIG.ingestKey, messages: messages.slice(i, i + 20) }),
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() !== 200) throw new Error('Ledger answered ' + res.getResponseCode() + ': ' + res.getContentText())
    console.log(action + ': ' + res.getContentText())
  }
}

const asMessage = (m, max) => ({ id: m.getId(), from: m.getFrom(), subject: m.getSubject(), date: m.getDate().toISOString(), body: m.getPlainBody().slice(0, max) })

function sendJobAlerts() {
  const label = GmailApp.getUserLabelByName(CONFIG.label) || GmailApp.createLabel(CONFIG.label)
  const threads = GmailApp.search(QUERY, 0, 50)
  if (!threads.length) return
  const messages = []
  threads.forEach((t) => t.getMessages().forEach((m) => messages.push(asMessage(m, 100000))))
  post('ingest', messages)
  // Only after Ledger has them, so a failed run is simply tried again next time
  threads.forEach((t) => t.addLabel(label))
}

/** Recruiting emails from the last few days (Ledger skips any it has already seen) */
function sendStatusEmails(days) {
  const me = Session.getActiveUser().getEmail().toLowerCase()
  const since = Date.now() - (days || 2) * 864e5
  const messages = []
  for (let start = 0; start < 500; start += 100) {
    const threads = GmailApp.search(STATUS_QUERY(days || 2), start, 100)
    threads.forEach((t) =>
      t.getMessages().forEach((m) => {
        // Only messages to you in that window, not your own replies in the thread
        if (m.getDate().getTime() >= since && m.getFrom().toLowerCase().indexOf(me) === -1) messages.push(asMessage(m, 12000))
      }),
    )
    if (threads.length < 100) break
  }
  if (messages.length) post('status', messages)
}

/** Run once after setup: the last 60 days, so applications you're tracking catch up with what companies already told you */
function backfillStatusEmails() {
  sendStatusEmails(60)
}

/** The daily run: new job alerts, then any recruiting emails */
function daily() {
  sendJobAlerts()
  sendStatusEmails(2)
}

function setUp() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t))
  // Once a day between 08:00 and 09:00 (your Google account's time zone): after JobStreet's daily alert (about 07:00),
  // so its jobs are still under a day old when Ledger checks their posting dates
  ScriptApp.newTrigger('daily').timeBased().everyDays(1).atHour(8).create()
}

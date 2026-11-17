/**
 * Sends your job-alert emails (LinkedIn, JobStreet, Glints) to Ledger's job scout, once a day (08:00-09:00, after JobStreet's morning alert).
 * Ledger opens each job's own page and only recommends jobs posted in the last 24 hours.
 * Runs in your own Google account (script.google.com). It only reads emails from those senders,
 * sends their text to Ledger, and adds the label "Ledger/Sent" so each email is sent once.
 * It never sends, deletes or changes any email.
 *
 * Setup:
 *  1. script.google.com > New project, paste this file, fill in the three values in CONFIG.
 *  2. Run "setUp" once and approve the permissions Google asks for.
 *  3. Run "sendJobAlerts" once to send the last day of alerts right away.
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

function sendJobAlerts() {
  const label = GmailApp.getUserLabelByName(CONFIG.label) || GmailApp.createLabel(CONFIG.label)
  const threads = GmailApp.search(QUERY, 0, 50)
  if (!threads.length) return

  const messages = []
  threads.forEach((t) =>
    t.getMessages().forEach((m) =>
      messages.push({ id: m.getId(), from: m.getFrom(), subject: m.getSubject(), date: m.getDate().toISOString(), body: m.getPlainBody() }),
    ),
  )

  for (let i = 0; i < messages.length; i += 10) {
    const res = UrlFetchApp.fetch(CONFIG.url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + CONFIG.anonKey, apikey: CONFIG.anonKey },
      payload: JSON.stringify({ action: 'ingest', key: CONFIG.ingestKey, messages: messages.slice(i, i + 10) }),
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() !== 200) throw new Error('Ledger answered ' + res.getResponseCode() + ': ' + res.getContentText())
    console.log(res.getContentText())
  }
  // Only after Ledger has them, so a failed run is simply tried again next time
  threads.forEach((t) => t.addLabel(label))
}

function setUp() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t))
  // Once a day between 08:00 and 09:00 (your Google account's time zone): after JobStreet's daily alert (about 07:00),
  // so its jobs are still under a day old when Ledger checks their posting dates
  ScriptApp.newTrigger('sendJobAlerts').timeBased().everyDays(1).atHour(8).create()
}

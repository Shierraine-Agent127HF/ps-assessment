// ═══════════════════════════════════════════════════════════════
//  PS Apprentice Assessment — Google Apps Script
//  Paste this into Extensions > Apps Script in your Google Sheet
//  Deploy as Web App: Execute as Me, Access: Anyone
// ═══════════════════════════════════════════════════════════════

// Total time allowed for the assessment. The clock is server-anchored and now
// starts when the candidate clicks "start" (action=start) — NOT when they enter
// their code — so time spent reading the instructions doesn't count against them.
// MUST match DURATION_MIN in src/App.jsx.
const DURATION_MIN = 90

// Admin review code. Anyone entering this (instead of an applicant code) gets the
// read-only dashboard listing every submission and their full answers. Set a
// PRIVATE value in Project Settings → Script Properties → key "ADMIN_CODE"; the
// literal below is only a fallback. Keep it secret — it exposes all applicant data.
function getAdminCode() {
  return String(PropertiesService.getScriptProperties().getProperty("ADMIN_CODE") || "ADMIN-VIEW-2026").trim().toUpperCase()
}

function doGet(e) {
  const action = e.parameter.action
  const code   = (e.parameter.code || "").trim().toUpperCase()
  const ss     = SpreadsheetApp.getActiveSpreadsheet()
  const durationMs = DURATION_MIN * 60 * 1000

  if (action === "validate") {
    // Admin review code → skip the test; the frontend shows the read-only dashboard.
    if (code === getAdminCode()) return respond({ valid: true, admin: true, name: "Administrator" })

    const sheet = ss.getSheetByName("Codes")
    if (!sheet) return respond({ valid: false, reason: "Codes sheet not found. Please set up the spreadsheet correctly." })

    const rows = sheet.getDataRange().getValues()
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === code) {
        const status = String(rows[i][2]).trim()
        if (status === "Used") {
          return respond({ valid: false, reason: "This code has already been used. Each code can only be submitted once. If you believe this is an error, please contact your administrator." })
        }
        // Do NOT start the clock here. If it was already started (e.g. the
        // candidate reloaded mid-assessment), return the remaining time so the
        // timer resumes; otherwise remainingMs is null and no timer runs yet.
        const startedAt = String(rows[i][6] || "").trim()
        const remainingMs = startedAt ? Math.max(0, durationMs - (Date.now() - new Date(startedAt).getTime())) : null
        return respond({ valid: true, name: String(rows[i][1]).trim() || code, durationMin: DURATION_MIN, started: !!startedAt, remainingMs: remainingMs })
      }
    }
    return respond({ valid: false, reason: "Code not found. Please check your code and try again, or contact your administrator." })
  }

  if (action === "start") {
    // Start (or resume) the server-anchored clock — called when the candidate
    // clicks "Enable recording & start assessment". Stamps column G once; every
    // later call returns the same remaining time, so the deadline follows the
    // code and can't be reset by reloading or switching devices.
    const sheet = ss.getSheetByName("Codes")
    if (!sheet) return respond({ started: false, reason: "Codes sheet not found" })
    const rows = sheet.getDataRange().getValues()
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === code) {
        let startedAt = String(rows[i][6] || "").trim()
        if (!startedAt) {
          startedAt = new Date().toISOString()
          sheet.getRange(i + 1, 7).setValue(startedAt)
        }
        const remainingMs = Math.max(0, durationMs - (Date.now() - new Date(startedAt).getTime()))
        return respond({ started: true, durationMin: DURATION_MIN, remainingMs: remainingMs })
      }
    }
    return respond({ started: false, reason: "Code not found" })
  }

  if (action === "diag") {
    // Open <WebAppURL>?action=diag in a browser to check the LIVE web app:
    //  • {"error":"Unknown action"}  → this URL is serving OLD code. The deployment
    //    behind the URL in Vercel isn't the one you updated — see notes below.
    //  • {"ok":true,...}             → Drive access works; the problem is elsewhere.
    //  • {"ok":false,"error":"...permission..."} → the account under "runningAs"
    //    can't reach the folder — add it as an Editor of RECORDINGS_ROOT_ID.
    const out = { ok: false, rootId: RECORDINGS_ROOT_ID }
    try { out.runningAs = Session.getEffectiveUser().getEmail() } catch (e) { out.runningAs = "(unknown)" }
    try {
      const folder = DriveApp.getFolderById(RECORDINGS_ROOT_ID)
      out.folderName = folder.getName()
      const probe = folder.createFolder("__diag_probe__")   // prove we can write
      probe.setTrashed(true)
      out.canWrite = true
      out.ok = true
    } catch (e) {
      out.error = String(e)
    }
    return respond(out)
  }

  if (action === "lastupload") {
    // Open <WebAppURL>?action=lastupload after a test run to see the result of the
    // most recent recording upload — without digging through the Executions log.
    //  • {"ok":true,"savedBytes":123456,...}  → a clip was saved successfully.
    //  • {"ok":false,"error":"...","b64len":N} → the clip arrived but failed to save.
    //  • {"note":"No upload recorded yet."}    → no uploadChunk has reached the server.
    const p = PropertiesService.getScriptProperties().getProperty("lastUpload")
    return respond(p ? JSON.parse(p) : { note: "No upload recorded yet." })
  }

  if (action === "lastslack") {
    // Open <WebAppURL>?action=lastslack to see why the last Slack notification did
    // or didn't post. {"ok":true,...} = posted. {"ok":false,"error":"..."} = the
    // exact Slack API reason (not_in_channel, invalid_auth, missing_scope, ...).
    const p = PropertiesService.getScriptProperties().getProperty("lastSlack")
    return respond(p ? JSON.parse(p) : { note: "No Slack notification attempted yet." })
  }

  if (action === "adminList") {
    // Admin-only: list every row in "Assessment Result" (newest first) for the
    // dashboard. Any non-admin code is rejected before any data is read.
    if (code !== getAdminCode()) return respond({ error: "Unauthorized" })
    const sheet = ss.getSheetByName("Assessment Result")
    if (!sheet || sheet.getLastRow() < 2) return respond({ applicants: [] })
    const rows = sheet.getDataRange().getValues()
    const header = rows[0]
    const pick = (r, name) => { const i = header.indexOf(name); return i >= 0 ? r[i] : "" }
    const applicants = []
    for (let i = 1; i < rows.length; i++) {
      applicants.push({
        row: i + 1,
        timestamp: String(pick(rows[i], "Timestamp")),
        code: String(pick(rows[i], "Code")),
        name: String(pick(rows[i], "Candidate Email")),
        objectivePercent: String(pick(rows[i], "Objective %")),
        essayPercent: String(pick(rows[i], "Essay %")),
        overallScore: String(pick(rows[i], "Overall Score"))
      })
    }
    applicants.reverse()   // newest first
    return respond({ applicants: applicants })
  }

  if (action === "adminGet") {
    // Admin-only: return every column of one submission as {label,value} pairs so
    // the frontend can group them into summary / objective answers / essays.
    if (code !== getAdminCode()) return respond({ error: "Unauthorized" })
    const sheet = ss.getSheetByName("Assessment Result")
    const rowNum = parseInt(e.parameter.row, 10)
    if (!sheet || !rowNum || rowNum < 2 || rowNum > sheet.getLastRow()) return respond({ error: "Row not found" })
    const width = sheet.getLastColumn()
    const header = sheet.getRange(1, 1, 1, width).getValues()[0]
    const values = sheet.getRange(rowNum, 1, 1, width).getValues()[0]
    const fields = header.map((h, i) => ({ label: String(h), value: String(values[i] == null ? "" : values[i]) }))
    return respond({ fields: fields })
  }

  return respond({ error: "Unknown action" })
}

// Remember the outcome of the most recent uploadChunk so it can be read back via
// ?action=lastupload (browser-friendly debugging).
function recordLastUpload(obj) {
  try { PropertiesService.getScriptProperties().setProperty("lastUpload", JSON.stringify(obj)) } catch (e) {}
}

// Remember the outcome of the most recent Slack notification so it can be read
// back via ?action=lastslack (browser-friendly debugging — the actual Slack API
// error string, e.g. "not_in_channel", shows up here).
function recordLastSlack(obj) {
  try { PropertiesService.getScriptProperties().setProperty("lastSlack", JSON.stringify(obj)) } catch (e) {}
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents)
  const ss   = SpreadsheetApp.getActiveSpreadsheet()
  const code = (data.code || "").trim().toUpperCase()

  // 0. Recording segment upload (screen + webcam). Each POST is one short .webm
  //    clip; we file it into a per-applicant Drive folder named from the email in
  //    the Codes sheet, with the one-time code referenced.
  if (data.action === "uploadChunk") {
    return handleUploadChunk(ss, code, data)
  }

  // 1. Mark code as Used + record summary in Codes sheet
  const codeSheet = ss.getSheetByName("Codes")
  let driveLink = ""                                   // recording folder (Codes col H) for the Slack thread
  if (codeSheet) {
    const rows = codeSheet.getDataRange().getValues()
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === code) {
        codeSheet.getRange(i + 1, 3).setValue("Used")
        codeSheet.getRange(i + 1, 4).setValue(new Date().toLocaleString())
        codeSheet.getRange(i + 1, 5).setValue(data.objectiveScore)
        codeSheet.getRange(i + 1, 6).setValue(data.objectivePercent)
        driveLink = String(rows[i][7] || "").trim()    // column H — cached recording folder link
        break
      }
    }
  }

  // 2. Write full results to the "Assessment Result" sheet
  let sub = ss.getSheetByName("Assessment Result")
  if (!sub) sub = ss.insertSheet("Assessment Result")

  ensureAssessmentHeaders(sub, data)

  sub.appendRow([
    data.timestamp,
    code,
    data.candidateName,
    data.objectiveScore,
    data.objectivePercent,
    data.essayScore,
    data.essayPercent,
    data.overallScore,
    ...data.objectiveResults.map(r => r.answer),
    ...data.objectiveResults.map(r => r.correct),
    ...data.essayResults.map(r => r.aiScore),
    ...data.essayResults.map(r => r.aiFeedback),
    // Store the full essay so reviewers can read the raw input. Capped just under
    // Google Sheets' 50,000-char-per-cell limit so an oversized answer can't make
    // the whole row-write fail (previously this was clipped to 500 chars).
    ...data.essayResults.map(r => (r.response || "").slice(0, 45000))
  ])

  // 3. Notify Slack that the applicant finished. Best-effort only — wrapped so a
  //    Slack outage or misconfiguration never blocks the candidate's submission.
  notifySlack(data, code, driveLink)

  return respond({ success: true })
}

// Make sure the "Assessment Result" sheet has the current header layout, and
// SELF-REPAIR older sheets. Three cases:
//   (a) brand-new empty sheet          → write the full header row.
//   (b) sheet from an OLD version that  → insert the 3 missing summary columns
//       lacks Essay Score / Essay % /     ("Essay Score", "Essay %", "Overall
//       Overall Score                      Score") right after "Objective %", so
//                                          existing rows shift and every new row
//                                          lines up (old rows get blank cells in
//                                          those 3 columns, which is correct).
//   (c) already up to date              → do nothing.
function ensureAssessmentHeaders(sub, data) {
  const headers = [
    "Timestamp", "Code", "Candidate Email", "Objective Score", "Objective %",
    "Essay Score", "Essay %", "Overall Score",
    ...data.objectiveResults.map((_, i) => `Q${i + 1} Answer`),
    ...data.objectiveResults.map((_, i) => `Q${i + 1} Correct?`),
    ...data.essayResults.map((_, i) => `Essay ${i + 1} Score`),
    ...data.essayResults.map((_, i) => `Essay ${i + 1} Feedback`),
    ...data.essayResults.map((_, i) => `Essay ${i + 1} Response`)
  ]

  // (a) empty sheet — write the whole header row.
  if (sub.getLastRow() === 0) {
    sub.appendRow(headers)
    sub.getRange(1, 1, 1, headers.length).setFontWeight("bold")
    sub.setFrozenRows(1)
    return
  }

  // (b) existing sheet — in the current layout column F (6th) is "Essay Score".
  // If it isn't, this tab predates the summary columns; insert them once.
  const width = sub.getLastColumn()
  const firstRow = sub.getRange(1, 1, 1, width).getValues()[0]
  if (width >= 5 && String(firstRow[5] || "").trim() !== "Essay Score") {
    sub.insertColumnsAfter(5, 3)                       // push old columns F+ right by 3
    sub.getRange(1, 6, 1, 3).setValues([["Essay Score", "Essay %", "Overall Score"]])
    sub.getRange(1, 6, 1, 3).setFontWeight("bold")
  }
  // (c) otherwise headers already current — nothing to do.
}

// Drive folder that holds every applicant's recording (the one you shared).
// Each applicant gets a subfolder inside it. To point at a different folder,
// paste its id (the part after /folders/ in the URL) here.
const RECORDINGS_ROOT_ID = "1wz0iV5CTBquCRj8AlT6Yu4DQLa5fpfwv"

// ── Recording: save one .webm clip into the applicant's Drive folder ──
// A per-applicant subfolder named "<email> — <CODE>" is created inside
// RECORDINGS_ROOT_ID (email pulled from Codes column B). The folder's shareable
// LINK is written to Codes column H after the first clip, so you can click
// straight to each applicant's recordings — and later clips reuse it instead of
// re-searching Drive.
// NOTE: this uses DriveApp — after adding it you MUST re-deploy the Web App and
// accept the new Drive authorization prompt.
function handleUploadChunk(ss, code, data) {
  try {
    Logger.log("uploadChunk in: code=" + code + " seg=" + data.segIndex + " b64len=" + ((data.dataBase64 || "").length))
    const codeSheet = ss.getSheetByName("Codes")
    if (!codeSheet) { Logger.log("uploadChunk: Codes sheet not found"); return respond({ success: false, error: "Codes sheet not found" }) }

    const rows = codeSheet.getDataRange().getValues()
    let rowIndex = -1, email = "", folderLink = ""
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === code) {
        rowIndex = i
        email = String(rows[i][1] || "").trim()          // column B
        folderLink = String(rows[i][7] || "").trim()     // column H (cached folder link)
        break
      }
    }
    if (rowIndex === -1) { Logger.log("uploadChunk: code not found: " + code); return respond({ success: false, error: "Code not found" }) }

    const folder = getRecordingFolder(email, code, folderLink)
    // Write the folder link into column H on the first clip (and repair it if the
    // cached link points somewhere else). Compare by id so we don't rewrite it
    // every request just because of a "?usp=..." query on the stored URL.
    if (folderIdFromUrl(folderLink) !== folder.getId()) {
      codeSheet.getRange(rowIndex + 1, 8).setValue(folder.getUrl())
    }

    // Strip any ";codecs=..." parameters — the stored .webm only needs the base type.
    const mime = String(data.mime || "video/webm").split(";")[0].trim() || "video/webm"
    const seg = String((data.segIndex != null ? data.segIndex : 0) + 1).padStart(3, "0")
    const session = String(data.sessionId || "0")
    const name = code + "_" + session + "_seg" + seg + ".webm"
    const bytes = Utilities.base64Decode(data.dataBase64 || "")
    const blob = Utilities.newBlob(bytes, mime, name)
    const file = folder.createFile(blob)

    Logger.log("uploadChunk saved: " + name + " (" + file.getSize() + " bytes) in folder " + folder.getName())
    recordLastUpload({ ok: true, at: new Date().toISOString(), code: code, seg: data.segIndex, b64len: (data.dataBase64 || "").length, savedBytes: file.getSize(), file: name, folder: folder.getName() })
    return respond({ success: true, folderUrl: folder.getUrl() })
  } catch (err) {
    Logger.log("uploadChunk ERROR: " + err + (err && err.stack ? " | " + err.stack : ""))
    recordLastUpload({ ok: false, at: new Date().toISOString(), code: code, seg: (data && data.segIndex), b64len: (data && data.dataBase64 || "").length, error: String(err) })
    return respond({ success: false, error: String(err) })
  }
}

function getRecordingFolder(email, code, cachedLink) {
  // Reuse the applicant's existing subfolder if column H already links to it.
  const cachedId = folderIdFromUrl(cachedLink)
  if (cachedId) {
    try { return DriveApp.getFolderById(cachedId) } catch (e) { /* stale link → recreate below */ }
  }
  const root = DriveApp.getFolderById(RECORDINGS_ROOT_ID)
  const subName = (email ? email : code) + " — " + code
  const subs = root.getFoldersByName(subName)
  return subs.hasNext() ? subs.next() : root.createFolder(subName)
}

// SETUP CHECK — run this once from the editor (select testDriveAccess, click Run ▶)
// after deploying. It forces the Drive authorization prompt and confirms THIS
// account can reach the recordings folder. Success logs the folder name; failure
// throws a clear permission error (View → Logs / Executions to read it). If this
// throws, the account you're signed in as can't access RECORDINGS_ROOT_ID — make
// sure the Web App is deployed by an account that owns or has Editor access to it.
function testDriveAccess() {
  const folder = DriveApp.getFolderById(RECORDINGS_ROOT_ID)
  const child = folder.createFolder("__access_test__")
  child.setTrashed(true)   // clean up the probe folder
  Logger.log("OK — can read AND write to: " + folder.getName())
}

// Pull the Drive id out of a folder link like
// "https://drive.google.com/drive/folders/<id>?usp=drive_link".
function folderIdFromUrl(url) {
  const s = String(url || "")
  const m = s.match(/\/folders\/([-\w]+)/) || s.match(/[-\w]{25,}/)
  return m ? (m[1] || m[0]) : ""
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}

// ═══════════════════════════════════════════════════════════════
//  Slack notification — posts "<name> completed the assessment" with
//  scores + pass/review/fail flags, then replies in-thread with the
//  applicant's Drive recording link.
//
//  SETUP (one time):
//   1. Create a Slack app  →  https://api.slack.com/apps  ("From scratch").
//   2. OAuth & Permissions → Bot Token Scopes → add:  chat:write
//      (add chat:write.public too if you'd rather not invite the bot to
//      the channel; otherwise, in Slack run:  /invite @YourBotName )
//   3. Install to Workspace → copy the "Bot User OAuth Token" (starts xoxb-).
//   4. In this project: Project Settings (⚙) → Script Properties → add:
//        SLACK_BOT_TOKEN   = xoxb-...your token...
//        SLACK_CHANNEL_ID  = C07532VA22X
//   5. Re-deploy the Web App and accept the new "connect to an external
//      service" (UrlFetchApp) authorization prompt.
//  Test anytime by running  testSlack  from the editor.
// ═══════════════════════════════════════════════════════════════

function notifySlack(data, code, driveLink) {
  try {
    const props   = PropertiesService.getScriptProperties()
    const token   = props.getProperty("SLACK_BOT_TOKEN")
    const channel = props.getProperty("SLACK_CHANNEL_ID")
    if (!token || !channel) {
      const r = { ok: false, at: new Date().toISOString(), error: "SLACK_BOT_TOKEN or SLACK_CHANNEL_ID missing in Script Properties", hasToken: !!token, hasChannel: !!channel }
      Logger.log("notifySlack: " + r.error); recordLastSlack(r); return r
    }

    const name         = data.candidateName || code
    const essayPct     = percentValue(data.essayPercent)          // "72%" → 72
    const overallPct   = fractionPercent(data.overallScore)       // "28/37" → 75.6…
    const overallFlag  = passFlag(overallPct, 70, 50)             // 🟢 Pass / 🟡 Review / 🔴 Fail
    const essayFlag    = essayQualityFlag(essayPct)               // 🟢 Excellent / 🟡 Good / 🔴 Needs work
    const overallPctStr = overallPct == null ? "—" : Math.round(overallPct) + "%"

    const text =
      overallFlag.emoji + "  *" + name + " — completed the assessment*\n\n" +
      "*Objective Score:*  " + data.objectiveScore + "  (" + data.objectivePercent + ")\n" +
      "*Essay Score:*  " + data.essayScore + "  (" + data.essayPercent + ")  →  " + essayFlag.emoji + " " + essayFlag.label + "\n" +
      "*Overall Score:*  " + data.overallScore + "  (" + overallPctStr + ")  →  " + overallFlag.emoji + " " + overallFlag.label

    const parent = slackPost(token, { channel: channel, text: text, unfurl_links: false })
    if (!parent || !parent.ok) {
      const r = { ok: false, at: new Date().toISOString(), stage: "parent", error: (parent && parent.error) || "no response from Slack", channel: channel }
      Logger.log("notifySlack: parent post failed — " + r.error); recordLastSlack(r); return r
    }

    const reply = driveLink
      ? "📹 Recording folder: " + driveLink
      : "📹 Recording folder not available yet (no clips were uploaded)."
    const child = slackPost(token, { channel: channel, thread_ts: parent.ts, text: reply, unfurl_links: false })
    const r = { ok: true, at: new Date().toISOString(), channel: channel, ts: parent.ts, threadOk: !!(child && child.ok), threadError: (child && !child.ok) ? child.error : undefined }
    recordLastSlack(r); return r
  } catch (err) {
    const r = { ok: false, at: new Date().toISOString(), error: String(err) }
    Logger.log("notifySlack ERROR: " + err); recordLastSlack(r); return r
  }
}

function slackPost(token, payload) {
  const res = UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", {
    method: "post",
    contentType: "application/json; charset=utf-8",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  })
  try { return JSON.parse(res.getContentText()) } catch (e) { return { ok: false, error: "bad response" } }
}

// "72%" (or "72") → 72 ; anything unparseable → null
function percentValue(s) {
  const m = String(s == null ? "" : s).match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

// "28/37" → 75.67… (percent) ; unparseable / zero denominator → null
function fractionPercent(s) {
  const m = String(s == null ? "" : s).match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const den = parseFloat(m[2])
  return den ? (parseFloat(m[1]) / den) * 100 : null
}

// Overall flag: 🟢 Pass ≥ passAt, 🟡 Review ≥ reviewAt, else 🔴 Fail
function passFlag(pct, passAt, reviewAt) {
  if (pct == null) return { emoji: "⚪", label: "N/A" }
  if (pct >= passAt)   return { emoji: "🟢", label: "Pass" }
  if (pct >= reviewAt) return { emoji: "🟡", label: "Review" }
  return { emoji: "🔴", label: "Fail" }
}

// Essay quality flag: 🟢 Excellent ≥ 80, 🟡 Good ≥ 60, else 🔴 Needs work
function essayQualityFlag(pct) {
  if (pct == null) return { emoji: "⚪", label: "N/A" }
  if (pct >= 80) return { emoji: "🟢", label: "Excellent" }
  if (pct >= 60) return { emoji: "🟡", label: "Good" }
  return { emoji: "🔴", label: "Needs work" }
}

// Run this from the editor (select testSlack, click Run ▶) to send a fake
// notification and confirm the token, channel, scopes and threading all work.
function testSlack() {
  const result = notifySlack({
    candidateName: "Juan Dela Cruz (TEST)",
    objectiveScore: "10/12", objectivePercent: "83%",
    essayScore: "18/25", essayPercent: "72%",
    overallScore: "28/37"
  }, "TESTCODE", "https://drive.google.com/drive/folders/example")
  // The outcome is printed here AND saved for ?action=lastslack.
  Logger.log("testSlack result: " + JSON.stringify(result))
  return result
}

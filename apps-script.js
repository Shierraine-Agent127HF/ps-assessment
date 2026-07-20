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

function doGet(e) {
  const action = e.parameter.action
  const code   = (e.parameter.code || "").trim().toUpperCase()
  const ss     = SpreadsheetApp.getActiveSpreadsheet()
  const durationMs = DURATION_MIN * 60 * 1000

  if (action === "validate") {
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

  return respond({ error: "Unknown action" })
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
  if (codeSheet) {
    const rows = codeSheet.getDataRange().getValues()
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === code) {
        codeSheet.getRange(i + 1, 3).setValue("Used")
        codeSheet.getRange(i + 1, 4).setValue(new Date().toLocaleString())
        codeSheet.getRange(i + 1, 5).setValue(data.objectiveScore)
        codeSheet.getRange(i + 1, 6).setValue(data.objectivePercent)
        break
      }
    }
  }

  // 2. Write full results to the "Assessment Result" sheet
  let sub = ss.getSheetByName("Assessment Result")
  if (!sub) sub = ss.insertSheet("Assessment Result")

  if (sub.getLastRow() === 0) {
    const headers = [
      "Timestamp", "Code", "Candidate Email", "Objective Score", "Objective %",
      ...data.objectiveResults.map((_, i) => `Q${i + 1} Answer`),
      ...data.objectiveResults.map((_, i) => `Q${i + 1} Correct?`),
      ...data.essayResults.map((_, i) => `Essay ${i + 1} Score`),
      ...data.essayResults.map((_, i) => `Essay ${i + 1} Feedback`),
      ...data.essayResults.map((_, i) => `Essay ${i + 1} Response`)
    ]
    sub.appendRow(headers)
    sub.getRange(1, 1, 1, headers.length).setFontWeight("bold")
    sub.setFrozenRows(1)
  }

  sub.appendRow([
    data.timestamp,
    code,
    data.candidateName,
    data.objectiveScore,
    data.objectivePercent,
    ...data.objectiveResults.map(r => r.answer),
    ...data.objectiveResults.map(r => r.correct),
    ...data.essayResults.map(r => r.aiScore),
    ...data.essayResults.map(r => r.aiFeedback),
    ...data.essayResults.map(r => (r.response || "").slice(0, 500))
  ])

  return respond({ success: true })
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
    const codeSheet = ss.getSheetByName("Codes")
    if (!codeSheet) return respond({ success: false, error: "Codes sheet not found" })

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
    if (rowIndex === -1) return respond({ success: false, error: "Code not found" })

    const folder = getRecordingFolder(email, code, folderLink)
    // Write the folder link into column H on the first clip (and repair it if the
    // cached link points somewhere else). Compare by id so we don't rewrite it
    // every request just because of a "?usp=..." query on the stored URL.
    if (folderIdFromUrl(folderLink) !== folder.getId()) {
      codeSheet.getRange(rowIndex + 1, 8).setValue(folder.getUrl())
    }

    const mime = data.mime || "video/webm"
    const seg = String((data.segIndex != null ? data.segIndex : 0) + 1).padStart(3, "0")
    const session = String(data.sessionId || "0")
    const name = code + "_" + session + "_seg" + seg + ".webm"
    const bytes = Utilities.base64Decode(data.dataBase64 || "")
    const blob = Utilities.newBlob(bytes, mime, name)
    folder.createFile(blob)

    return respond({ success: true, folderUrl: folder.getUrl() })
  } catch (err) {
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

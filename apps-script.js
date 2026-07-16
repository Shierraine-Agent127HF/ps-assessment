// ═══════════════════════════════════════════════════════════════
//  PS Apprentice Assessment — Google Apps Script
//  Paste this into Extensions > Apps Script in your Google Sheet
//  Deploy as Web App: Execute as Me, Access: Anyone
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  const action = e.parameter.action
  const code   = (e.parameter.code || "").trim().toUpperCase()
  const ss     = SpreadsheetApp.getActiveSpreadsheet()

  if (action === "validate") {
    const sheet = ss.getSheetByName("Codes")
    if (!sheet) return respond({ valid: false, reason: "Codes sheet not found. Please set up the spreadsheet correctly." })

    const rows = sheet.getDataRange().getValues()
    for (let i = 1; i < rows.length; i++) {
      const rowCode = String(rows[i][0]).trim().toUpperCase()
      if (rowCode === code) {
        const status = String(rows[i][2]).trim()
        if (status === "Used") {
          return respond({ valid: false, reason: "This code has already been used. Each code can only be submitted once. If you believe this is an error, please contact your administrator." })
        }
        return respond({ valid: true, name: String(rows[i][1]).trim() || code })
      }
    }
    return respond({ valid: false, reason: "Code not found. Please check your code and try again, or contact your administrator." })
  }

  return respond({ error: "Unknown action" })
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents)
  const ss   = SpreadsheetApp.getActiveSpreadsheet()
  const code = (data.code || "").trim().toUpperCase()

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

  // 2. Write full results to Submissions sheet
  let sub = ss.getSheetByName("Submissions")
  if (!sub) sub = ss.insertSheet("Submissions")

  if (sub.getLastRow() === 0) {
    const headers = [
      "Timestamp", "Code", "Candidate Name", "Objective Score", "Objective %",
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

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}

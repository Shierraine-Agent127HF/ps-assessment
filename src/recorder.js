// ═══════════════════════════════════════════════════════════════
//  AssessmentRecorder — Loom-style screen + webcam recording
//
//  Captures the candidate's screen with a webcam "bubble" composited
//  into the corner, records it in short segments, and uploads each
//  segment to the Google Apps Script Web App (which files them into a
//  per-applicant Google Drive folder). Framework-agnostic on purpose —
//  App.jsx just constructs it, calls start()/stop(), and reads camStream
//  for the on-screen self-view.
// ═══════════════════════════════════════════════════════════════

// ── Tunables (single source of truth) ──
const SEGMENT_MS = 120000   // length of each uploaded clip. ↑ = fewer files, more lost if the tab dies mid-segment
const VIDEO_BPS  = 600000   // ~600 kbps video. ~90 min ≈ 450 MB/candidate. Drop to 400000 to roughly halve storage
const AUDIO_BPS  = 64000    // microphone
const FPS        = 12       // plenty for proctoring; keeps files small
const CANVAS_W   = 1280
const CANVAS_H   = 720
const BUBBLE_W   = 220      // webcam bubble width, bottom-right

// getDisplayMedia is desktop-only and absent on every mobile browser.
export function isRecordingSupported() {
  const md = navigator.mediaDevices
  return !!(md && md.getDisplayMedia && md.getUserMedia && window.MediaRecorder)
}

function pickMime() {
  const cands = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
  for (const m of cands) { try { if (window.MediaRecorder.isTypeSupported(m)) return m } catch {} }
  return "video/webm"
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// contain-fit: scale (sw×sh) to sit fully inside (dw×dh), centered (letterboxed)
function containFit(sw, sh, dw, dh) {
  const scale = Math.min(dw / sw, dh / sh)
  const w = sw * scale, h = sh * scale
  return { w, h, x: (dw - w) / 2, y: (dh - h) / 2 }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(r.error || new Error("read failed"))
    r.onload = () => resolve(String(r.result).split(",")[1] || "")
    r.readAsDataURL(blob)
  })
}

export class AssessmentRecorder {
  constructor({ uploadUrl, code, onScreenEnded, onStatus } = {}) {
    this.uploadUrl = uploadUrl
    this.code = code
    this.onScreenEnded = onScreenEnded
    this.onStatus = onStatus
    this.sessionId = String(Date.now())   // unique per recording start → segments never overwrite across reloads

    this.running = false
    this.segIndex = 0
    this.mime = pickMime()

    this.screenStream = null
    this.camStream = null
    this.outStream = null
    this.currentRec = null
    this.cycleTimer = null
    this.drawTimer = null
    this._finalResolve = null

    this.uploadQueue = []
    this.draining = false

    this.screenVideo = null
    this.camVideo = null
    this.canvas = null
    this.ctx = null
  }

  _status(msg) { try { this.onStatus && this.onStatus(msg) } catch {} }

  // Acquire screen + camera, build the composite, and start segment recording.
  // Throws (NotAllowedError, etc.) if the candidate denies or cancels — caller blocks the exam.
  async start() {
    if (!isRecordingSupported()) throw new Error("unsupported")
    // getDisplayMedia needs the click gesture — request it first.
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: FPS }, audio: false
    })
    try {
      this.camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
        audio: true
      })
    } catch (err) {
      // Camera/mic denied → tear down the screen grab we already have, then rethrow.
      try { this.screenStream.getTracks().forEach(t => t.stop()) } catch {}
      throw err
    }

    this.screenVideo = this._makeVideoEl(this.screenStream)
    this.camVideo = this._makeVideoEl(this.camStream)
    await Promise.all([this.screenVideo.play().catch(() => {}), this.camVideo.play().catch(() => {})])

    this.canvas = document.createElement("canvas")
    this.canvas.width = CANVAS_W
    this.canvas.height = CANVAS_H
    this.ctx = this.canvas.getContext("2d")

    this.drawTimer = setInterval(() => this._drawFrame(), Math.round(1000 / FPS))

    this.outStream = this.canvas.captureStream(FPS)
    const micTrack = this.camStream.getAudioTracks()[0]
    if (micTrack) this.outStream.addTrack(micTrack)

    this._watchScreenEnd()

    this.running = true
    this._startSegment()
    this.cycleTimer = setInterval(() => {
      if (this.running && this.currentRec && this.currentRec.state === "recording") {
        try { this.currentRec.stop() } catch {}   // onstop enqueues this clip and starts the next
      }
    }, SEGMENT_MS)

    this._status("Recording")
  }

  // Re-acquire the screen after the candidate hit "Stop sharing". The canvas /
  // MediaRecorder keep running throughout, so this just swaps the screen source
  // back in — no segment interruption. Camera + mic were never lost.
  async resume() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: FPS }, audio: false })
    try { this.screenStream && this.screenStream.getTracks().forEach(t => t.stop()) } catch {}
    this.screenStream = stream
    this.screenVideo.srcObject = stream
    await this.screenVideo.play().catch(() => {})
    this._watchScreenEnd()
    this._status("Recording")
  }

  _makeVideoEl(stream) {
    const v = document.createElement("video")
    v.srcObject = stream
    v.muted = true
    v.playsInline = true
    return v
  }

  _watchScreenEnd() {
    const track = this.screenStream.getVideoTracks()[0]
    if (!track) return
    track.onended = () => { if (this.running) { this._status("Screen sharing stopped"); this.onScreenEnded && this.onScreenEnded() } }
  }

  _drawFrame() {
    const ctx = this.ctx
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    const sv = this.screenVideo
    if (sv && sv.videoWidth) {
      const f = containFit(sv.videoWidth, sv.videoHeight, CANVAS_W, CANVAS_H)
      ctx.drawImage(sv, f.x, f.y, f.w, f.h)
    }

    const cv = this.camVideo
    if (cv && cv.videoWidth) {
      const bw = BUBBLE_W
      const bh = Math.round(bw * cv.videoHeight / cv.videoWidth)
      const m = 20
      const bx = CANVAS_W - bw - m
      const by = CANVAS_H - bh - m
      ctx.save()
      roundRectPath(ctx, bx, by, bw, bh, 12)
      ctx.clip()
      // cover-fit the webcam into the bubble so it isn't distorted
      const cf = this._coverFit(cv.videoWidth, cv.videoHeight, bw, bh)
      ctx.drawImage(cv, bx + cf.x, by + cf.y, cf.w, cf.h)
      ctx.restore()
      ctx.strokeStyle = "rgba(255,255,255,0.85)"
      ctx.lineWidth = 2
      roundRectPath(ctx, bx, by, bw, bh, 12)
      ctx.stroke()
    }
  }

  _coverFit(sw, sh, dw, dh) {
    const scale = Math.max(dw / sw, dh / sh)
    const w = sw * scale, h = sh * scale
    return { w, h, x: (dw - w) / 2, y: (dh - h) / 2 }
  }

  _startSegment() {
    const idx = this.segIndex++
    const chunks = []
    let rec
    try {
      rec = new window.MediaRecorder(this.outStream, {
        mimeType: this.mime, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS
      })
    } catch {
      rec = new window.MediaRecorder(this.outStream)
    }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
    rec.onstop = () => this._onSegmentStop(idx, chunks)
    rec.start()   // no timeslice → a single dataavailable fires on stop, so each blob is a complete, playable webm
    this.currentRec = rec
  }

  _onSegmentStop(idx, chunks) {
    if (chunks.length) this._enqueue(new Blob(chunks, { type: this.mime }), idx)
    if (this.running) {
      this._startSegment()
    } else if (this._finalResolve) {
      const r = this._finalResolve; this._finalResolve = null; r()
    }
  }

  _enqueue(blob, idx) {
    this.uploadQueue.push({ blob, idx })
    this._drain()
  }

  async _drain() {
    if (this.draining) return
    this.draining = true
    while (this.uploadQueue.length) {
      const { blob, idx } = this.uploadQueue.shift()
      await this._uploadSegment(blob, idx)
    }
    this.draining = false
  }

  async _uploadSegment(blob, idx) {
    if (!this.uploadUrl) return false
    let dataBase64
    try { dataBase64 = await blobToBase64(blob) } catch { return false }
    const payload = {
      action: "uploadChunk",
      code: this.code,
      sessionId: this.sessionId,
      segIndex: idx,
      mime: this.mime,
      dataBase64
    }
    // Fire-and-forget with no-cors — the same way results are posted (Apps Script
    // doesn't return a readable cross-origin response for these POSTs). The request
    // still reaches the server and the file is written; we just can't read the reply.
    // Retry only on a real network error, never on an unreadable response — that
    // would double-send and create duplicate files in Drive.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fetch(this.uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },   // simple request → no CORS preflight
          body: JSON.stringify(payload),
          mode: "no-cors"
        })
        this._status(`Uploaded clip ${idx + 1}`)
        return true
      } catch {
        await sleep(1000 * (attempt + 1))
      }
    }
    this._status(`Clip ${idx + 1} failed to upload`)
    return false
  }

  // Stop recording, flush the final clip, wait for all uploads to drain, tear down.
  async stop() {
    if (!this.running && !this.currentRec) return
    this.running = false
    if (this.cycleTimer) { clearInterval(this.cycleTimer); this.cycleTimer = null }
    if (this.drawTimer) { clearInterval(this.drawTimer); this.drawTimer = null }

    await new Promise(res => {
      const rec = this.currentRec
      if (rec && rec.state !== "inactive") { this._finalResolve = res; try { rec.stop() } catch { res() } }
      else res()
    })
    while (this.draining || this.uploadQueue.length) await sleep(200)
    this._teardownStreams()
    this._status("Recording finished")
  }

  _teardownStreams() {
    for (const s of [this.outStream, this.screenStream, this.camStream]) {
      try { s && s.getTracks().forEach(t => t.stop()) } catch {}
    }
    if (this.screenVideo) this.screenVideo.srcObject = null
    if (this.camVideo) this.camVideo.srcObject = null
  }
}

import { useState, useEffect, useRef } from "react"
import { Brain, Eye, Calendar, MessageSquare, Lightbulb, FileText, Sun, Moon, Clock, Video, MonitorUp, AlertTriangle } from "lucide-react"
import { AssessmentRecorder, isRecordingSupported } from "./recorder"

// ═══════════════ DATA ═══════════════════════════════════════════
const SECS = [
  { id:"ct", title:"Critical Thinking", color:"#12a594", Icon:Brain, qs:[
    { type:"sc", text:"You receive 4 requests at the same time: (1) a bug breaking a report used in today's leadership meeting, (2) a team lead's feature request marked 'urgent,' (3) a documentation task you've postponed, (4) a routine colleague check-in. What do you do first?", opts:["Address the feature request — a team lead's urgent label carries real authority","Respond to all four quickly to signal responsiveness, then work through them","Fix the bug affecting today's meeting and acknowledge the others with timelines","Confirm priority with your manager before acting on anything"], ans:2, ex:"Real-time impact outweighs urgency labels. The broken report affects a live meeting right now.", tr:"A treats labels as facts. B spreads attention before the critical thing is handled. D wastes time when the answer is clear." },
    { type:"mc", text:"A workflow that ran perfectly last week suddenly stops sending reports. You haven't changed anything on your side. What's your most logical first assumption?", opts:["Something changed upstream — an API key expired, a connected app updated, or a data source shifted format","The workflow has a latent bug that only surfaces under specific conditions","It's a temporary platform outage and will likely self-resolve","The workflow was misconfigured from the start and happened to work until now"], ans:0, ex:"When nothing changed on your end, look at dependencies. External services rotate keys and push updates — often without notice.", tr:"B and D assume internal origin without evidence. C is plausible but passive." },
    { type:"tf", tf:false, text:"A process that has run without complaints for two years is strong evidence that it is working efficiently.", ex:"No complaints isn't the same as working well. Many processes persist because no one has questioned them." },
    { type:"sc", text:"You're finalizing a monthly report and notice one metric is nearly double last month's number. The data came from an automated system and you're on a deadline. What do you do?", opts:["Publish with a note flagging the anomaly so stakeholders can form their own view","Rerun the report to see if the number reproduces — a glitch would likely not repeat","Hold it, cross-check against the raw data source, then submit with a note on your finding","Remove the outlier from this report and document it separately for follow-up"], ans:2, ex:"A report with unverified data is worse than a slightly late one. Cross-checking takes minutes; walking back bad data takes days.", tr:"A outsources judgment. B only tests if the system repeats — not if source data is accurate. D is deceptive." },
    { type:"sc", text:"Your manager says the goal this quarter is to 'automate everything in the CS department.' What is the most useful first step?", opts:["Start documenting all current CS processes right away — you need a full inventory before prioritizing","Ask which specific workflows are causing the most pain, since 'everything' is rarely the actual ask","Build a quick prototype automation to show what's possible and let results shape the conversation","Schedule a stakeholder meeting to align on a shared definition of 'automation' before any mapping begins"], ans:1, ex:"Vague directives need scoping before execution. 'Everything' almost always means 'the most painful things' — find those first.", tr:"A produces a map of the wrong territory. C risks building the wrong thing. D adds overhead too early." }
  ]},
  { id:"ad", title:"Attention to Detail", color:"#c99a1f", Icon:Eye, qs:[
    { type:"sp", text:"Read this bug report carefully. Which answer best describes what is wrong with it?", mockLabel:"Bug Report #0042", mock:"Title: Button not working\nReported by: [not filled]\nDate: July 2026\nSteps to reproduce: I clicked the button and it didn't work.\nExpected result: It should work.\nActual result: It doesn't work.\nBrowser: Chrome\nPriority: High", opts:["The priority seems off — a non-functional button rarely warrants High without knowing business impact","It's missing the reporter's name, but otherwise has the key fields needed to investigate","The reproduction steps and expected/actual results describe no real behavior — a developer cannot act on this","The date is incomplete, making SLA compliance tracking impossible"], ans:2, ex:"'I clicked it and it didn't work' tells a developer nothing — which button, which page, what happened? Expected/actual are untestable.", tr:"A raises a fair point about priority but misses the bigger structural failure. B undersells the gaps. D fixates on formatting." },
    { type:"sp", text:"Something specific is wrong with this feature request. What is it?", mockLabel:"Feature Request", mock:"Request: Add an export button to the dashboard\nRequested by: CS Team\nDate submitted: July 10, 2026\nPriority: Low\nDescription: We need to be able to export the data.\nAcceptance criteria: The export works.\nTimeline: ASAP", opts:["The description needs more specifics — format, scope, and user group are all undefined","'Priority: Low' and 'Timeline: ASAP' directly contradict each other and must be resolved first","The acceptance criteria are untestable — 'the export works' does not define what success looks like","There is no assigned owner, meaning this could sit in queue with no accountability"], ans:1, ex:"Low priority and ASAP timeline in the same ticket is a direct conflict — one of them is wrong and must be resolved before planning.", tr:"A, C, and D all identify real issues. But the priority/timeline conflict is the most clear-cut factual contradiction." },
    { type:"sp", text:"Find the error in this weekly report.", mockLabel:"Weekly Ticket Volume", mock:"Monday:     142\nTuesday:    138\nWednesday:  201\nThursday:   139\nFriday:     137\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nTotal:      747", opts:["Wednesday's volume is an outlier and should be verified before the report goes out","The total is wrong — the five days add up to 757, not 747, a 10-ticket discrepancy","The formatting is inconsistent — spacing and alignment differ across rows","Friday looks low compared to the week's pattern and may reflect missing data"], ans:1, ex:"142+138+201+139+137 = 757. The stated total of 747 is off by 10 — exactly the kind of error that influences decisions downstream.", tr:"A sounds analytical but the actual error is in the arithmetic. C and D are distractions." },
    { type:"sp", text:"Something is factually impossible in this status update. What is it?", mockLabel:"Ticket #1204 — Status Update", mock:"Issue: Data sync failure\nDate reported:  July 3, 2026\nDate resolved:  June 29, 2026\nResolution:     Integration service restarted\nTime to resolve: 5 days", opts:["The resolution note is too vague — it should specify which integration service was restarted","The resolved date (June 29) is earlier than the reported date (July 3), which is impossible","The time-to-resolve is also wrong — 5 days does not match the gap between the two dates","The ticket is missing an assigned owner and severity classification"], ans:1, ex:"A ticket resolved before it was reported is factually impossible. This invalidates the entire record.", tr:"C is also true but B is the root error that makes everything else moot. A and D are quality issues, not factual errors." },
    { type:"tf", tf:false, text:"Reading your own written work aloud before sending it to a stakeholder is unnecessary if you've already done a silent proofread.", ex:"Reading aloud forces you to process every word rather than autocorrecting. It catches missing words and awkward phrasing that silent reading skips." }
  ]},
  { id:"po", title:"Planning & Org", color:"#2f8fd6", Icon:Calendar, qs:[
    { type:"sc", text:"It's Monday morning. You have: a critical bug, two minor bugs, two feature requests to triage, a weekly report due Wednesday, and a sync update to prepare for Thursday. How do you structure the week?", opts:["Draft the weekly report first — Wednesday is a fixed deadline and writing needs the most focused time","Triage all bugs and feature requests together on Monday, then sequence the rest from there","Handle the critical bug first, triage feature requests by EOD, block Tuesday for the report, prep sync update Wednesday afternoon","Clear the two minor bugs first to reduce the open ticket count, then tackle bigger work"], ans:2, ex:"Impact-first triage (critical bug), then batching similar work, with buffer before deadlines.", tr:"A deprioritizes a live critical issue for a Wednesday deadline. B delays the critical bug. D clears noise but ignores severity." },
    { type:"mc", text:"A stakeholder submits a feature request with only a title — no description, no context. What do you do next?", opts:["Flag it as incomplete and give them 3 business days to add detail before closing it","Reach out with specific questions: what problem does this solve, who uses it, what does done look like","Start a rough scope based on the title to use as a conversation-starter when you follow up","Schedule a call to walk through requirements — written back-and-forth takes too long"], ans:1, ex:"Specific written questions are async, create a paper trail, and force the requester to think through their own need.", tr:"A is too passive. C wastes effort on guesses. D may be overkill for something a message can resolve." },
    { type:"tf", tf:false, text:"Documenting the reasoning behind decisions — even small ones — is more effort than it is worth on a fast-moving team.", ex:"Decision logs answer 'why did we do it this way?' weeks later when context has disappeared. On fast teams, this matters most." },
    { type:"sc", text:"It's Thursday afternoon and an urgent bug comes in while you're mid-way through 6 open feature requests. How do you respond?", opts:["Finish your current task before switching — leaving work half-done creates more confusion than a short delay","Handle the bug immediately regardless of severity — bugs always take priority over feature work","Assess severity, reprioritize if warranted, update your tracker, and notify anyone whose request is affected","Log the bug for Monday to protect in-progress feature work that already has stakeholder expectations"], ans:2, ex:"Reprioritization is normal — the skill is doing it visibly. Assess, act, then communicate. Silent shifts cause things to fall through cracks.", tr:"A could leave a critical issue sitting. B ignores severity. D risks real urgency." },
    { type:"sc", text:"Your manager asks for a status update on all your open items. You have 11 tasks across 3 projects. How do you present this?", opts:["Group by project, note the status and next action for each item, and flag anything blocked","List all 11 items in the order you're currently working through them with a one-line status each","Write a short paragraph summarizing overall progress without getting into individual item detail","Ask your manager which project is most pressing before spending time preparing the full update"], ans:0, ex:"Grouped by project with status + next action is scannable and decision-ready. It shows organizational thinking.", tr:"B is thorough but a flat list of 11 is hard to scan. C loses detail. D delays delivering what was asked." }
  ]},
  { id:"cm", title:"Communication", color:"#b06fcc", Icon:MessageSquare, qs:[
    { type:"sc", text:"A team member submits a bug report that is too vague for anyone to act on. How do you respond?", opts:["Send a link to the bug report template and ask them to resubmit using the correct format","Forward it to a developer with a note that more detail is needed and let them follow up","Acknowledge it, explain specifically what's missing, and show them what a complete report looks like","Close the ticket and ask them to reopen it once they have more information available"], ans:2, ex:"The best response teaches, not just rejects. Explaining what's missing and showing an example improves every future report they write.", tr:"A is impersonal. B passes the work. D is abrupt." },
    { type:"sp", text:"Which is the clearest, most professional rewrite of this message?", mockLabel:"Original message (to a stakeholder)", mock:"Hey so the thing you asked for last week isn't done yet because we had a bunch of other stuff come up and honestly it's pretty complicated so I'm not sure when it'll be ready but I'll try to get to it soon.", opts:["Hi — wanted to flag that your request is still in progress. It's been a busy week but it's on my radar and I'll update you when I have a clearer timeline.","Hi [Name], I wanted to update you on your request from last week. Competing priorities shifted our timeline. I'll confirm a revised estimate by [specific date] and keep you posted.","Hey, sorry for the delay — things got complicated on our end but we haven't forgotten about it. More updates coming soon.","Your request has been deprioritized this week due to workload. We'll reschedule based on team availability and notify you accordingly."], ans:1, ex:"B takes ownership, commits to a specific date, and maintains a professional tone.", tr:"A is cleaner but 'when I have a clearer timeline' is not a commitment. C is still casual. D sounds dismissive." },
    { type:"mc", text:"You need to explain a data sync failure to a non-technical stakeholder. Which response is most appropriate?", opts:["Two of our systems stopped sharing data correctly. This means [specific impact] until we fix it, which we expect by [date].","There's been a backend sync issue. Our engineering team is investigating and will update within 24 hours.","The data pipeline between our CRM and reporting tool experienced a handshake failure causing records to fall out of sync.","One of our integrations went down — it's a known issue type and the fix is already in progress. No action needed."], ans:0, ex:"Plain language, specific impact, concrete timeline. That's what a non-technical stakeholder needs.", tr:"B sounds professional but 'investigating' with no impact or timeline isn't actionable. C uses jargon. D assumes 'known issue' without evidence." },
    { type:"tf", tf:false, text:"When delivering bad news — like a missed deadline — it's better to open with context and explanation so the reader understands the situation before hearing the issue.", ex:"Lead with the bad news first. Burying it after context feels evasive. State it plainly, then explain." },
    { type:"tf", tf:false, text:"When a feature request is rejected or pushed to a later sprint, you do not need to notify the requester unless they follow up asking about it.", ex:"Silence reads as neglect. A brief 'not this sprint, here's why' maintains trust and stops requests from feeling like they vanish." }
  ]},
  { id:"ps", title:"Problem-Solving", color:"#e04b4b", Icon:Lightbulb, qs:[
    { type:"sc", text:"A user reports: 'The export button on the dashboard is broken.' That's all you have. What's your first move?", opts:["Check the system error logs — if something broke, it'll be recorded there without involving the user","Log it as a confirmed bug and assign it to a developer, noting more detail may be needed","Try to reproduce it yourself first, then document: which browser, what data, and exactly what happens","Ask the user for a screen recording before taking any other step so you have something concrete"], ans:2, ex:"Reproducing it yourself is faster than waiting on the user and gives you firsthand information.", tr:"A assumes log access. B moves too fast on thin information. D adds a step before you've tried it yourself." },
    { type:"mc", text:"You've been asked to investigate a recurring issue. Which format is most useful for documenting your findings?", opts:["A Slack post summarizing the issue so the whole team is aware and can contribute","A running log of every instance with timestamps to build pattern data over time","A structured write-up: what the issue is, when it started, frequency, what's been tried, impact, and recommended next step","A developer ticket with enough technical detail for someone to begin investigating immediately"], ans:2, ex:"A structured write-up forces clear thinking and makes the problem handoff-ready.", tr:"A creates awareness but nothing durable. B is useful data but not a complete picture. D assumes it's already developer-ready." },
    { type:"sc", text:"You're generating a monthly performance report. The automation rate is lower than last month but no issues were reported. You're about to send it. What do you do?", opts:["Send on time — unexpected dips happen and stakeholders can ask questions if they want to investigate","Rerun the report to confirm the numbers reproduce — a system glitch would likely not repeat the same error","Cross-check against the raw data source, determine if the dip is real or an error, and note your finding either way","Hold the report and schedule a data review meeting so stakeholders can assess the discrepancy together"], ans:2, ex:"Verify before publishing. Cross-checking takes minutes; a wrong number in a leadership report takes days to walk back.", tr:"A publishes uncertain data. B only tests if the system repeats — not if source data is accurate. D delays unnecessarily." },
    { type:"sc", text:"Three different team members independently report the same bug on the same day. What does this signal, and how should your response differ from a single report?", opts:["Merge the reports, treat as an elevated-priority issue, and investigate how broadly it's affecting users before responding individually","Handle each report individually first so every reporter feels acknowledged before consolidating anything","Three independent reports in one day is likely coincidence — volume alone does not indicate a more severe problem","Close the duplicate tickets immediately to keep the tracker clean, then resolve the single remaining report"], ans:0, ex:"Three independent reports on the same day signals the issue is actively and broadly affecting users — that changes urgency and scope.", tr:"B prioritizes feelings over triage speed. C is wrong — correlated reports are a meaningful signal. D loses context from additional reports." },
    { type:"tf", tf:false, text:"When presenting a solution to a problem, giving a single strong recommendation is always more effective than presenting multiple options with trade-offs.", ex:"Sometimes one recommendation is right — but presenting trade-offs shows you've considered the full picture and respects that the decision-maker may have context you don't." }
  ]},
  { id:"es", title:"Essay Prompts", color:"#5c9a4f", Icon:FileText, qs:[
    { type:"es", text:"Tell us about a process you've encountered — at school, work, or in daily life — that felt unnecessarily slow, manual, or repetitive. What made it frustrating, and how would you redesign it?", hint:"Red flag: vague frustration with no concrete example. Strong: names a real process, the actual friction, and a practical redesign idea." },
    { type:"es", text:"What genuinely excites you about AI and automation — and what makes you cautious? We want both sides, honestly.", hint:"Red flag: pure enthusiasm with no caveats, or blanket skepticism. Strong: names something specific on both sides." },
    { type:"es", text:"Describe a time you caught an error — in your own work or someone else's — before it caused a problem. What made you notice it, and what did you do?", hint:"Tests attention to detail + communication. Look for: specificity of the error, proactive flagging, diplomatic handling." },
    { type:"es", text:"If you could change one thing about how teams typically manage requests and tasks — feature requests, bug reports, or projects — what would it be and why?", hint:"Weak: too personal or too vague. Strong: names a structural problem and proposes something that would scale." },
    { type:"es", text:"You've just finished your first 30 days in this role. What would tell you that you're actually performing well — not just staying busy?", hint:"Tests results-orientation. Weak: describes activity. Strong: names specific outcomes and observable indicators." }
  ]}
]

const LL=["A","B","C","D"]
const TL={sc:"Scenario",mc:"Multiple choice",tf:"True / False",sp:"Spot the issue",es:"Essay"}
const QK=(si,qi)=>`${si}-${qi}`
const OBJ_SECS=SECS.filter(s=>s.id!=="es")
const ES_IDX=SECS.findIndex(s=>s.id==="es")
const TOTAL_OBJ=OBJ_SECS.reduce((a,s)=>a+s.qs.length,0)
const TOTAL_Q=SECS.reduce((a,s)=>a+s.qs.length,0)

// ── Timed assessment ──
// Total time allowed, shown on the welcome screen. The server (apps-script.js)
// is the source of truth for the actual countdown — it returns the real
// remaining time on every validation. Keep this in sync with DURATION_MIN there.
const DURATION_MIN=90
const fmtTime=ms=>{
  const s=Math.max(0,Math.floor(ms/1000))
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60
  const pad=n=>String(n).padStart(2,"0")
  return h>0?`${h}:${pad(m)}:${pad(sec)}`:`${m}:${pad(sec)}`
}

// ═══════════════ API ════════════════════════════════════════════
// Google Apps Script Web App URL (ends in /exec). Set VITE_ASSESSMENT_URL in your env / Vercel.
const ASSESSMENT_URL = import.meta.env.VITE_ASSESSMENT_URL || ""

async function validateCode(url, code) {
  const res = await fetch(`${url}?action=validate&code=${encodeURIComponent(code)}`, { mode:"cors" })
  if (!res.ok) throw new Error("Network error")
  return res.json()
}

async function scoreEssayAI(question, hint, response) {
  const res = await fetch('/api/score-essay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, hint, response })
  })
  // The API returns { score, feedback } even on errors (e.g. missing key) —
  // surface that specific message instead of a generic failure.
  const data = await res.json().catch(() => null)
  if (data && (data.score != null || data.feedback)) return data
  throw new Error('Score API failed')
}

async function postToSheets(url, payload) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
    mode: "no-cors"
  })
}

// ═══════════════ APP ════════════════════════════════════════════
export default function App() {
  const [phase, setPhase]           = useState("welcome")
  const [code, setCode]             = useState("")
  const [codeError, setCodeError]   = useState("")
  const [candidateName, setCandidateName] = useState("")
  const [si, setSi]                 = useState(0)
  const [qi, setQi]                 = useState(0)
  const [answers, setAnswers]       = useState({})
  const [essayTexts, setEssayTexts] = useState({})
  const [aiScores, setAiScores]     = useState({})
  const [scoring, setScoring]       = useState({})
  const [expanded, setExpanded]     = useState({0:true})
  const [panel, setPanel]           = useState("quiz")
  const [submitMsg, setSubmitMsg]   = useState("")
  const [deadline, setDeadline]     = useState(null)   // local-clock ms timestamp when time expires (null = no timer)
  const [timeLeft, setTimeLeft]     = useState(null)   // ms remaining (null = timer not started)
  const [timedOut, setTimedOut]     = useState(false)
  const [theme, setTheme]           = useState(() => { try { return localStorage.getItem("ps_theme") || "dark" } catch { return "dark" } })
  // ── Recording (screen + webcam, proctoring) ──
  const [recStarting, setRecStarting] = useState(false)  // permission prompts in flight
  const [recError, setRecError]       = useState("")     // "", "unsupported", "denied", or a message
  const [recActive, setRecActive]     = useState(false)  // recording is live → show the REC indicator
  const [screenLost, setScreenLost]   = useState(false)  // candidate stopped screen sharing → block until re-shared
  const editorRef = useRef(null)
  const autoSubmitRef = useRef(false)
  const recorderRef = useRef(null)
  const selfViewRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    try { localStorage.setItem("ps_theme", theme) } catch {}
  }, [theme])
  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark")

  // ── Persist (keyed by code) ──
  useEffect(() => {
    if (phase !== "assessing" && phase !== "done") return
    const key = `ps_${code.trim().toUpperCase()}`
    try { localStorage.setItem(key, JSON.stringify({code,candidateName,answers,essayTexts,aiScores,phase})) } catch {}
  }, [answers, essayTexts, aiScores, phase])

  const restoreSession = (savedCode) => {
    const key = `ps_${savedCode.trim().toUpperCase()}`
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const d = JSON.parse(saved)
        if (d.answers)    setAnswers(d.answers)
        if (d.essayTexts) setEssayTexts(d.essayTexts)
        if (d.aiScores)   setAiScores(d.aiScores)
        return true
      }
    } catch {}
    return false
  }

  const handleValidate = async () => {
    if (!code.trim()) return
    if (!ASSESSMENT_URL) { setCodeError("Assessment is not configured yet. Please contact your administrator."); return }
    setPhase("validating"); setCodeError("")
    try {
      const data = await validateCode(ASSESSMENT_URL, code.trim().toUpperCase())
      if (data.valid) {
        setCandidateName(data.name || code.trim().toUpperCase())
        restoreSession(code.trim().toUpperCase())
        // Server-anchored countdown: trust the server's remaining time so the
        // deadline can't be reset by clearing the browser or switching devices.
        // (Older Apps Script without a timer omits remainingMs → no timer shown.)
        if (typeof data.remainingMs === "number") setDeadline(Date.now() + data.remainingMs)
        // Gate the assessment behind the recording-consent screen — recording is mandatory.
        setPhase("consent")
      } else {
        setCodeError(data.reason || "Invalid or already-used code.")
        setPhase("welcome")
      }
    } catch {
      setCodeError("Cannot reach the assessment server. Please check the URL or contact your administrator.")
      setPhase("welcome")
    }
  }

  // ── Recording lifecycle ──
  const beginAssessment = async () => {
    setRecError("")
    if (!isRecordingSupported()) { setRecError("unsupported"); return }
    setRecStarting(true)
    try {
      const rec = new AssessmentRecorder({
        uploadUrl: ASSESSMENT_URL,
        code: code.trim().toUpperCase(),
        onScreenEnded: () => setScreenLost(true)
      })
      await rec.start()
      recorderRef.current = rec
      setRecActive(true)
      setPhase("assessing")
    } catch (err) {
      const name = err && err.name
      setRecError(name === "NotAllowedError" ? "denied" : (name === "NotFoundError" ? "nodevice" : (err && err.message) || "failed"))
    } finally {
      setRecStarting(false)
    }
  }

  const handleReshare = async () => {
    try { await recorderRef.current?.resume(); setScreenLost(false) }
    catch { /* candidate cancelled again — keep the overlay up so they retry */ }
  }

  // Bind the on-screen self-view to the live camera stream once we're recording.
  useEffect(() => {
    if (phase === "assessing" && recActive && selfViewRef.current && recorderRef.current?.camStream) {
      selfViewRef.current.srcObject = recorderRef.current.camStream
      selfViewRef.current.play?.().catch(() => {})
    }
  }, [phase, recActive])

  const sec=SECS[si], q=sec.qs[qi], qk=QK(si,qi)

  const correctObj=Object.entries(answers).filter(([k,v])=>{
    const [s,qq]=k.split("-").map(Number)
    if(SECS[s].id==="es") return false
    const question=SECS[s].qs[qq]
    if(question.type==="tf") return v==="true"?question.tf===true:question.tf===false
    return parseInt(v)===question.ans
  }).length

  const totalAnswered=Object.keys(answers).filter(k=>{const[s]=k.split("-").map(Number);return SECS[s].id!=="es"}).length
  const essaysDone=SECS[ES_IDX].qs.map((_,i)=>QK(ES_IDX,i)).filter(k=>essayTexts[k]?.trim()).length
  const essayScoreList=SECS[ES_IDX].qs.map((_,i)=>aiScores[QK(ES_IDX,i)]?.score).filter(n=>typeof n==="number")
  const essayTotal=essayScoreList.reduce((a,b)=>a+b,0)
  const essayMax=SECS[ES_IDX].qs.length*5

  const navigate=(ns,nq)=>{setSi(ns);setQi(nq);if(editorRef.current)editorRef.current.scrollTop=0}
  const handleAnswer=v=>setAnswers(a=>({...a,[qk]:String(v)}))
  const handleEssay=v=>setEssayTexts(t=>({...t,[qk]:v}))

  const getQStatus=(sIdx,qIdx)=>{
    const k=QK(sIdx,qIdx),question=SECS[sIdx].qs[qIdx],ans=answers[k]
    if(question.type==="es") return essayTexts[k]?.trim()?"answered":"todo"
    if(ans===undefined) return "todo"
    if(phase!=="done") return "answered"
    if(question.type==="tf") return (ans==="true")===question.tf?"correct":"wrong"
    return parseInt(ans)===question.ans?"correct":"wrong"
  }

  const scoreEssay=async()=>{
    const txt=essayTexts[qk]||""; if(!txt.trim()) return
    setScoring(s=>({...s,[qk]:true}))
    try { const r=await scoreEssayAI(q.text,q.hint,txt); setAiScores(s=>({...s,[qk]:r})) }
    catch { setAiScores(s=>({...s,[qk]:{score:null,feedback:"Scoring failed. Please try again."}})) }
    setScoring(s=>({...s,[qk]:false}))
  }

  const handleSubmit=async()=>{
    // Stop recording now so the final clip captures up to submit time and starts
    // uploading in the background while essays are scored. Awaited before "done".
    const recStop = recorderRef.current ? recorderRef.current.stop().catch(()=>{}) : null
    setRecActive(false); setScreenLost(false)
    setPhase("submitting"); setSubmitMsg("Scoring essays with AI…")
    const scores={...aiScores}
    for(let i=0;i<SECS[ES_IDX].qs.length;i++){
      const k=QK(ES_IDX,i),esQ=SECS[ES_IDX].qs[i],txt=essayTexts[k]||""
      if(!scores[k]&&txt.trim()){
        setSubmitMsg(`Scoring essay ${i+1} of ${SECS[ES_IDX].qs.length}…`)
        try { const r=await scoreEssayAI(esQ.text,esQ.hint,txt); scores[k]=r; setAiScores(s=>({...s,[k]:r})) } catch {}
      }
    }
    setSubmitMsg("Saving to Google Sheets…")
    const objRows=[]
    OBJ_SECS.forEach((section,sIdx)=>section.qs.forEach((oq,qIdx)=>{
      const k=QK(sIdx,qIdx),ans=answers[k]
      const correct=ans!==undefined&&(oq.type==="tf"?(ans==="true")===oq.tf:parseInt(ans)===oq.ans)
      objRows.push({section:section.title,type:oq.type,question:oq.text.slice(0,80)+"…",
        answer:ans!==undefined?(oq.type==="tf"?ans:LL[parseInt(ans)]):"Unanswered",
        correct:ans===undefined?"Unanswered":correct?"Yes":"No",
        correctAnswer:oq.type==="tf"?String(oq.tf):LL[oq.ans]})
    }))
    const esRows=SECS[ES_IDX].qs.map((esQ,i)=>{
      const k=QK(ES_IDX,i),sc=scores[k]
      return {question:esQ.text.slice(0,80)+"…",response:essayTexts[k]||"",aiScore:sc?.score??"N/A",aiFeedback:sc?.feedback??"Not scored"}
    })
    const payload={action:"submit",code:code.trim().toUpperCase(),timestamp:new Date().toISOString(),
      candidateName,objectiveScore:`${correctObj}/${TOTAL_OBJ}`,
      objectivePercent:`${Math.round((correctObj/TOTAL_OBJ)*100)}%`,
      objectiveResults:objRows,essayResults:esRows}
    if(ASSESSMENT_URL){
      try { await postToSheets(ASSESSMENT_URL,payload); setSubmitMsg("Saved!") }
      catch { setSubmitMsg("Results saved locally.") }
    }
    if (recStop) { setSubmitMsg("Finishing recording upload…"); await recStop }
    setPhase("done"); setPanel("results")
  }

  // ── Countdown timer (server-anchored via deadline) ──
  useEffect(() => {
    if (phase !== "assessing" || deadline == null) return
    const tick = () => setTimeLeft(Math.max(0, deadline - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, deadline])

  // ── Auto-submit when the clock hits zero (fires once) ──
  useEffect(() => {
    if (phase === "assessing" && deadline != null && timeLeft === 0 && !autoSubmitRef.current) {
      autoSubmitRef.current = true
      setTimedOut(true)
      handleSubmit()
    }
  }, [phase, deadline, timeLeft])

  // ── Styles ──
  const C={
    bg0:"var(--surface-0)",bg1:"var(--surface-1)",bg2:"var(--surface-2)",
    border:"var(--border)",bStr:"var(--border-strong)",
    text:"var(--text-primary)",textSec:"var(--text-secondary)",textMute:"var(--text-muted)",
    accent:"var(--text-accent)",bgAccent:"var(--bg-accent)",bdAccent:"var(--border-accent)",
    success:"var(--text-success)",bgSuccess:"var(--bg-success)",bdSuccess:"var(--border-success)",
    danger:"var(--text-danger)",bgDanger:"var(--bg-danger)",bdDanger:"var(--border-danger)",
    warning:"var(--text-warning)",bgWarning:"var(--bg-warning)",bdWarn:"var(--border-warning)"
  }
  const root={display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",background:C.bg0}
  const navBtn={padding:"8px 18px",fontSize:12.5,border:`0.5px solid ${C.bStr}`,borderRadius:7,cursor:"pointer",background:"transparent",color:C.textSec,fontFamily:"var(--font-sans)",transition:"all .15s"}
  const subBtn={padding:"9px 22px",fontSize:13,border:"none",borderRadius:7,cursor:"pointer",background:"var(--fill-accent)",color:"var(--on-accent)",fontFamily:"var(--font-sans)",fontWeight:500,transition:"all .15s"}
  const optSt=(sel,correct,wrong)=>({display:"flex",gap:10,padding:"11px 14px",borderRadius:8,cursor:phase==="done"?"default":"pointer",marginBottom:6,fontFamily:"var(--font-sans)",fontSize:13,lineHeight:1.55,alignItems:"flex-start",transition:"background .15s, border-color .15s, color .15s",border:`0.5px solid ${wrong?C.bdDanger:correct?C.bdSuccess:sel?C.bdAccent:C.border}`,background:wrong?C.bgDanger:correct?C.bgSuccess:sel?C.bgAccent:"transparent",color:wrong?C.danger:correct?C.success:sel?C.accent:C.textSec})
  const segBtn=(active)=>({padding:"6px 16px",fontSize:12,fontWeight:500,borderRadius:6,border:"none",cursor:"pointer",fontFamily:"var(--font-sans)",background:active?"var(--fill-accent)":"transparent",color:active?"var(--on-accent)":C.textSec,transition:"all .15s",display:"flex",alignItems:"center",gap:5})
  const iconBtn={display:"flex",alignItems:"center",justifyContent:"center",width:30,height:30,borderRadius:7,border:`0.5px solid ${C.bStr}`,background:"transparent",color:C.textSec,cursor:"pointer",flexShrink:0,transition:"all .15s"}

  // ── Welcome ──
  if(phase==="welcome"||phase==="validating") return (
    <div style={{...root,alignItems:"center",justifyContent:"center",padding:"0 20px",position:"relative"}}>
      <button onClick={toggleTheme} title="Toggle light / dark" style={{...iconBtn,position:"absolute",top:18,right:18}}>
        {theme==="dark"?<Sun size={15}/>:<Moon size={15}/>}
      </button>
      <div style={{maxWidth:380,width:"100%"}}>
        <div style={{fontSize:10,color:C.textMute,fontFamily:"var(--font-mono)",letterSpacing:"0.08em",marginBottom:6}}>helpflow.net // ps-assessment</div>
        <div style={{fontSize:26,fontWeight:500,color:C.text,fontFamily:"var(--font-sans)",marginBottom:6}}>PS Apprentice Assessment</div>
        <div style={{fontSize:13,color:C.textSec,lineHeight:1.7,marginBottom:28}}>Enter your personal code to begin. You'll have {DURATION_MIN} minutes to complete it, and each code is single-use only.</div>

        <div style={{fontSize:11,color:C.textMute,marginBottom:5}}>Your assessment code</div>
        <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="e.g. HFPS001" style={{width:"100%",marginBottom:16,fontFamily:"var(--font-mono)",fontSize:16,letterSpacing:"0.14em"}} disabled={phase==="validating"} onKeyDown={e=>e.key==="Enter"&&handleValidate()} />

        {codeError&&<div style={{padding:"10px 12px",background:C.bgDanger,border:`0.5px solid ${C.bdDanger}`,borderRadius:6,fontSize:13,color:C.danger,marginBottom:14,lineHeight:1.5}}>{codeError}</div>}

        <button onClick={handleValidate} disabled={!code.trim()||phase==="validating"} style={{...subBtn,width:"100%",fontSize:14,padding:"10px 20px"}}>
          {phase==="validating"?"Validating…":"Validate & begin →"}
        </button>

        <div style={{marginTop:16,padding:"10px 12px",background:C.bgWarning,border:`0.5px solid ${C.bdWarn}`,borderRadius:6,fontSize:11,color:C.warning,lineHeight:1.7,display:"flex",gap:8,alignItems:"flex-start"}}>
          <span style={{fontSize:16,flexShrink:0}}>⏱️</span>
          <span>You have <strong>{DURATION_MIN} minutes</strong>. The timer starts the moment you enter your code and keeps running even if you close the tab — so begin only when you're ready. When time runs out, your answers are submitted automatically.</span>
        </div>
        <div style={{marginTop:10,padding:"10px 12px",background:C.bg1,borderRadius:6,fontSize:11,color:C.textMute,lineHeight:1.7,display:"flex",gap:8,alignItems:"flex-start"}}>
          <span style={{fontSize:16,flexShrink:0}}>🔒</span>
          <span>Your code can only be used once. Once you submit, the code is permanently locked and cannot be reused.</span>
        </div>
      </div>
    </div>
  )

  // ── Recording consent (mandatory, gates the assessment) ──
  if(phase==="consent") return (
    <div style={{...root,alignItems:"center",justifyContent:"center",padding:"0 20px",position:"relative"}}>
      <button onClick={toggleTheme} title="Toggle light / dark" style={{...iconBtn,position:"absolute",top:18,right:18}}>
        {theme==="dark"?<Sun size={15}/>:<Moon size={15}/>}
      </button>
      <div style={{maxWidth:420,width:"100%"}}>
        <div style={{fontSize:10,color:C.textMute,fontFamily:"var(--font-mono)",letterSpacing:"0.08em",marginBottom:6}}>helpflow.net // ps-assessment</div>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:8}}>
          <Video size={20} style={{color:C.accent}}/>
          <div style={{fontSize:22,fontWeight:500,color:C.text,fontFamily:"var(--font-sans)"}}>This assessment is recorded</div>
        </div>
        <div style={{fontSize:13,color:C.textSec,lineHeight:1.7,marginBottom:20}}>
          To keep the assessment fair, your <strong>screen</strong>, <strong>camera</strong>, and <strong>microphone</strong> are recorded for the full session. When you continue, your browser will ask you to share your screen and allow your camera — please accept both. Recording is required to take the assessment.
        </div>

        {recError==="unsupported"?(
          <div style={{padding:"12px 14px",background:C.bgDanger,border:`0.5px solid ${C.bdDanger}`,borderRadius:6,fontSize:13,color:C.danger,marginBottom:16,lineHeight:1.6}}>
            Your browser can't screen-record. Please use a <strong>desktop</strong> Chrome, Edge, or Firefox (phones and tablets are not supported), then reopen this link.
          </div>
        ):recError?(
          <div style={{padding:"12px 14px",background:C.bgDanger,border:`0.5px solid ${C.bdDanger}`,borderRadius:6,fontSize:13,color:C.danger,marginBottom:16,lineHeight:1.6}}>
            {recError==="denied"?"Screen or camera access was blocked. Recording is required — please allow both when prompted and try again.":recError==="nodevice"?"No camera or microphone was found. Please connect one and try again.":"Couldn't start recording. Please try again."}
          </div>
        ):null}

        <button onClick={beginAssessment} disabled={recStarting} style={{...subBtn,width:"100%",fontSize:14,padding:"11px 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <MonitorUp size={16}/>{recStarting?"Waiting for permission…":"Enable recording & start assessment →"}
        </button>

        <div style={{marginTop:14,padding:"10px 12px",background:C.bg1,borderRadius:6,fontSize:11,color:C.textMute,lineHeight:1.7,display:"flex",gap:8,alignItems:"flex-start"}}>
          <span style={{fontSize:15,flexShrink:0}}>🖥️</span>
          <span>When prompted, choose to share your <strong>entire screen</strong> for the recording to be valid. If you stop sharing during the assessment, you'll be asked to share again before you can continue.</span>
        </div>
      </div>
    </div>
  )

  // ── Results ──
  const ResultsView=()=>(
    <div style={{padding:"28px 28px 48px",overflowY:"auto",flex:1,fontFamily:"var(--font-sans)"}}>
      <div style={{maxWidth:860,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
        <div style={{fontSize:18,fontWeight:500}}>{candidateName}</div>
        <div style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:C.bgSuccess,color:C.success,fontWeight:500}}>Submitted</div>
        {timedOut&&<div style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:C.bgWarning,color:C.warning,fontWeight:500}}>Time expired — auto-submitted</div>}
      </div>
      <div style={{fontSize:12,color:C.textSec,marginBottom:22}}>Code: {code.toUpperCase()} · {new Date().toLocaleDateString()}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:28}}>
        {[{l:"Objective score",v:`${correctObj} / ${TOTAL_OBJ}`},{l:"Percentage",v:`${Math.round((correctObj/TOTAL_OBJ)*100)}%`},{l:"Essay score",v:`${essayTotal} / ${essayMax}`}].map(c=>(
          <div key={c.l} style={{background:C.bg1,borderRadius:8,padding:"14px 16px"}}>
            <div style={{fontSize:10,color:C.textMute,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{c.l}</div>
            <div style={{fontSize:24,fontWeight:500,color:C.text}}>{c.v}</div>
          </div>
        ))}
      </div>
      {OBJ_SECS.map((section,sIdx)=>(
        <div key={section.id} style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:8,height:8,borderRadius:2,background:section.color,display:"inline-block"}}/>
            {section.title}
          </div>
          {section.qs.map((oq,qIdx)=>{
            const k=QK(sIdx,qIdx),ans=answers[k],unanswered=ans===undefined
            const correct=!unanswered&&(oq.type==="tf"?(ans==="true")===oq.tf:parseInt(ans)===oq.ans)
            return (
              <div key={k} style={{display:"flex",gap:10,padding:"7px 10px",borderRadius:6,marginBottom:4,background:unanswered?C.bg1:correct?C.bgSuccess:C.bgDanger,fontSize:12,alignItems:"flex-start",cursor:"pointer"}} onClick={()=>{navigate(sIdx,qIdx);setPanel("quiz")}}>
                <span style={{color:unanswered?C.textMute:correct?C.success:C.danger,flexShrink:0,marginTop:1}}>{unanswered?"–":correct?"✓":"✗"}</span>
                <span style={{flex:1,color:C.textSec,lineHeight:1.5}}>{oq.text.slice(0,80)}…</span>
                <span style={{color:C.textMute,flexShrink:0,fontFamily:"var(--font-mono)",fontSize:11}}>
                  {unanswered?"–":oq.type==="tf"?ans:LL[parseInt(ans)]}
                  {!correct&&!unanswered&&<span style={{color:C.success,marginLeft:4}}>({oq.type==="tf"?String(oq.tf):LL[oq.ans]})</span>}
                </span>
              </div>
            )
          })}
        </div>
      ))}
      <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        <span style={{width:8,height:8,borderRadius:2,background:SECS[ES_IDX].color,display:"inline-block"}}/>Essay scores
      </div>
      {SECS[ES_IDX].qs.map((esQ,i)=>{
        const k=QK(ES_IDX,i),sc=aiScores[k]
        return (
          <div key={k} style={{padding:"12px 14px",borderRadius:6,background:C.bg1,marginBottom:8,fontSize:12,cursor:"pointer"}} onClick={()=>{navigate(ES_IDX,i);setPanel("quiz")}}>
            <div style={{color:C.textSec,marginBottom:6,lineHeight:1.5}}>{esQ.text.slice(0,90)}…</div>
            {sc?<div style={{display:"flex",gap:8,alignItems:"flex-start"}}><span style={{fontWeight:500,fontSize:14,color:sc.score>=4?C.success:sc.score>=3?C.warning:C.danger}}>{sc.score}/5</span><span style={{color:C.textMute,lineHeight:1.5}}>{sc.feedback}</span></div>:<span style={{color:C.textMute}}>Not scored</span>}
          </div>
        )
      })}
      </div>
    </div>
  )

  const isDone=phase==="done"
  const showTimer=!isDone&&timeLeft!=null
  const lowTime=timeLeft!=null&&timeLeft<=10*60*1000
  const critTime=timeLeft!=null&&timeLeft<=2*60*1000
  const tabBtn=(active,col)=>({padding:"7px 16px",fontSize:12,cursor:"pointer",borderRight:`0.5px solid ${C.border}`,whiteSpace:"nowrap",fontFamily:"var(--font-sans)",borderTop:active?`2px solid ${col}`:"2px solid transparent",background:active?C.bg2:"transparent",color:active?C.text:C.textMute,flexShrink:0,transition:"all .15s"})

  return (
    <div style={root}>
      {/* On-screen self-view — reassures the candidate that recording is live */}
      {recActive&&!isDone&&(
        <div style={{position:"fixed",bottom:16,left:16,zIndex:40,width:160,borderRadius:10,overflow:"hidden",border:`1px solid ${C.bStr}`,background:"#000",boxShadow:"0 6px 20px rgba(0,0,0,0.35)"}}>
          <video ref={selfViewRef} autoPlay muted playsInline style={{display:"block",width:"100%",height:"auto",transform:"scaleX(-1)"}}/>
          <div style={{position:"absolute",top:6,left:6,display:"flex",alignItems:"center",gap:5,padding:"2px 7px",borderRadius:20,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:10,fontFamily:"var(--font-mono)",letterSpacing:"0.06em"}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"#e04b4b",display:"inline-block"}}/>REC
          </div>
        </div>
      )}

      {/* Re-share overlay — blocks the exam if screen sharing is stopped mid-assessment */}
      {screenLost&&!isDone&&(
        <div style={{position:"fixed",inset:0,zIndex:60,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{maxWidth:400,width:"100%",background:C.bg1,border:`0.5px solid ${C.bStr}`,borderRadius:12,padding:"26px 26px 24px",textAlign:"center"}}>
            <AlertTriangle size={30} style={{color:C.warning,marginBottom:12}}/>
            <div style={{fontSize:17,fontWeight:500,color:C.text,marginBottom:8}}>Screen sharing stopped</div>
            <div style={{fontSize:13,color:C.textSec,lineHeight:1.7,marginBottom:20}}>
              Recording is required for the whole assessment. Your timer is still running — share your screen again to continue.
            </div>
            <button onClick={handleReshare} style={{...subBtn,width:"100%",fontSize:14,padding:"11px 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <MonitorUp size={16}/>Share screen & continue
            </button>
          </div>
        </div>
      )}

      {/* Title bar */}
      <div style={{height:44,background:C.bg1,borderBottom:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flexShrink:0}}>
        <div style={{fontSize:12,color:C.textSec,display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:C.textMute,fontFamily:"var(--font-mono)"}}>PS Assessment</span>
          <span style={{color:C.textMute}}>›</span>
          <span>{candidateName}</span>
          <span style={{padding:"1px 7px",borderRadius:10,fontSize:10,background:C.bg0,border:`0.5px solid ${C.border}`,color:C.textMute,fontFamily:"var(--font-mono)"}}>{code.toUpperCase()}</span>
          {isDone&&<span style={{padding:"1px 7px",borderRadius:10,fontSize:10,background:C.bgSuccess,color:C.success,fontWeight:500}}>Submitted</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {showTimer&&<div title="Time remaining" style={{display:"flex",alignItems:"center",gap:6,padding:"5px 11px",borderRadius:8,border:`0.5px solid ${critTime?C.bdDanger:lowTime?C.bdWarn:C.border}`,background:critTime?C.bgDanger:lowTime?C.bgWarning:C.bg0,color:critTime?C.danger:lowTime?C.warning:C.textSec,fontFamily:"var(--font-mono)",fontSize:12.5,fontWeight:500}}>
            <Clock size={13}/>
            <span>{fmtTime(timeLeft)}</span>
          </div>}
          <div style={{display:"flex",background:C.bg0,border:`0.5px solid ${C.border}`,borderRadius:8,padding:3,gap:3}}>
            {["quiz","results"].map(v=>(
              <button key={v} style={segBtn(panel===v)} onClick={()=>setPanel(v)}>
                {v==="quiz"?"Questions":<>Results{!isDone&&<span style={{opacity:.7}}>🔒</span>}</>}
              </button>
            ))}
          </div>
          <button onClick={toggleTheme} title="Toggle light / dark" style={iconBtn}>
            {theme==="dark"?<Sun size={15}/>:<Moon size={15}/>}
          </button>
        </div>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:230,background:C.bg1,borderRight:`0.5px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"8px 14px 4px",fontSize:10,color:C.textMute,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"var(--font-sans)"}}>Explorer</div>
          <div style={{flex:1,overflowY:"auto"}}>
            {SECS.map((section,sIdx)=>{
              const isOpen=expanded[sIdx]
              return (
                <div key={section.id}>
                  <div style={{padding:"5px 14px",display:"flex",alignItems:"center",gap:6,cursor:"pointer",color:isOpen?C.text:C.textSec,fontSize:11,fontFamily:"var(--font-sans)",userSelect:"none"}}
                    onClick={()=>setExpanded(e=>({...e,[sIdx]:!e[sIdx]}))}>
                    <span style={{fontSize:9,color:C.textMute,width:8}}>{isOpen?"▾":"▸"}</span>
                    <span style={{width:8,height:8,borderRadius:2,background:section.color,flexShrink:0}}/>
                    <span style={{flex:1}}>{section.title}</span>
                    <span style={{fontSize:10,color:C.textMute}}>{section.qs.filter((_,qi)=>getQStatus(sIdx,qi)!=="todo").length}/{section.qs.length}</span>
                  </div>
                  {isOpen&&section.qs.map((qq,qIdx)=>{
                    const status=getQStatus(sIdx,qIdx),isActive=si===sIdx&&qi===qIdx&&panel==="quiz"
                    const icon=status==="correct"?"✓":status==="wrong"?"✗":status==="answered"?"●":"○"
                    const col=status==="correct"?C.success:status==="wrong"?C.danger:status==="answered"?C.accent:C.textMute
                    return (
                      <div key={QK(sIdx,qIdx)} style={{padding:"3px 14px 3px 34px",display:"flex",alignItems:"center",gap:6,cursor:"pointer",background:isActive?C.bgAccent:"transparent",fontSize:11,fontFamily:"var(--font-mono)"}}
                        onClick={()=>{navigate(sIdx,qIdx);setPanel("quiz")}}>
                        <span style={{color:col}}>{icon}</span>
                        <span style={{color:isActive?C.accent:status==="todo"?C.textMute:C.textSec}}>Q{qIdx+1} · {TL[qq.type]}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <div style={{padding:"12px 14px",borderTop:`0.5px solid ${C.border}`,flexShrink:0}}>
            <div style={{fontSize:10,color:C.textMute,fontFamily:"var(--font-sans)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{isDone?"Final score":"Progress"}</div>
            <div style={{fontSize:24,fontWeight:500,color:C.text,fontFamily:"var(--font-sans)"}}>{isDone?`${correctObj}/${TOTAL_OBJ}`:`${totalAnswered}/${TOTAL_Q}`}</div>
            <div style={{fontSize:11,color:C.textSec,fontFamily:"var(--font-sans)"}}>{isDone?`${Math.round((correctObj/TOTAL_OBJ)*100)}% objective`:"questions answered"}</div>
          </div>
        </div>

        {/* Main */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{height:36,background:C.bg1,borderBottom:`0.5px solid ${C.border}`,display:"flex",alignItems:"flex-end",overflowX:"auto",flexShrink:0}}>
            {SECS.map((section,sIdx)=>(
              <div key={section.id} style={tabBtn(si===sIdx&&panel==="quiz",section.color)} onClick={()=>{navigate(sIdx,0);setPanel("quiz")}}>{section.title}</div>
            ))}
          </div>

          {panel==="results"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {isDone?<ResultsView/>:(
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:40,textAlign:"center"}}>
                <div>
                  <div style={{fontSize:36,marginBottom:12}}>🔒</div>
                  <div style={{fontSize:16,fontWeight:500,color:C.text,fontFamily:"var(--font-sans)",marginBottom:8}}>Results locked until submission</div>
                  <div style={{fontSize:13,color:C.textSec,fontFamily:"var(--font-sans)",lineHeight:1.7,marginBottom:20}}>Complete all questions and submit the assessment to unlock your scores and the answer key.</div>
                  <div style={{fontSize:12,color:C.textMute,fontFamily:"var(--font-sans)"}}>{totalAnswered}/{TOTAL_Q} questions answered · {essaysDone}/5 essays written</div>
                </div>
              </div>
            )}
          </div>}

          {panel==="quiz"&&(
            <div ref={editorRef} style={{flex:1,overflowY:"auto",padding:"28px 28px 44px",background:C.bg2}}>
              <div style={{maxWidth:760,margin:"0 auto"}}>
              <div style={{fontSize:10,color:C.textMute,marginBottom:4,fontFamily:"var(--font-mono)"}}>// {sec.title} · Question {qi+1} of {sec.qs.length}</div>
              <div style={{display:"inline-block",padding:"2px 8px",borderRadius:4,fontSize:10,fontFamily:"var(--font-sans)",marginBottom:14,background:sec.color+"22",color:sec.color,border:`0.5px solid ${sec.color}44`}}>{TL[q.type]}</div>
              <div style={{fontSize:14,color:C.text,lineHeight:1.75,marginBottom:16,fontFamily:"var(--font-sans)"}}>{q.text}</div>

              {q.mock&&<div style={{background:C.bg1,border:`0.5px solid ${C.border}`,borderRadius:6,padding:"12px 16px",marginBottom:16,fontSize:12.5,color:C.textSec,lineHeight:1.85,fontFamily:"var(--font-mono)"}}>
                <div style={{fontFamily:"var(--font-sans)",fontSize:10,color:C.textMute,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{q.mockLabel}</div>
                {q.mock.split("\n").map((l,i)=><div key={i}>{l||"\u00a0"}</div>)}
              </div>}

              {["mc","sc","sp"].includes(q.type)&&<div>
                {q.opts.map((opt,oi)=>{
                  const sel=answers[qk]===String(oi)
                  const correct=isDone&&oi===q.ans
                  const wrong=isDone&&sel&&oi!==q.ans
                  return <div key={oi} style={optSt(sel,correct,wrong)} onClick={()=>!isDone&&handleAnswer(oi)}>
                    <span style={{fontWeight:500,minWidth:18,flexShrink:0,paddingTop:1,opacity:.7}}>{LL[oi]}</span>
                    <span style={{flex:1}}>{opt}</span>
                    {correct&&<span style={{marginLeft:"auto",flexShrink:0}}>✓</span>}
                    {wrong&&<span style={{marginLeft:"auto",flexShrink:0}}>✗</span>}
                  </div>
                })}
                {isDone&&<div style={{marginTop:14,padding:"12px 16px",borderRadius:6,background:C.bg1,borderLeft:`3px solid ${C.bdSuccess}`,fontSize:13,color:C.textSec,fontFamily:"var(--font-sans)",lineHeight:1.65}}>
                  <strong style={{color:C.success,display:"block",marginBottom:4}}>Answer: {LL[q.ans]}</strong>
                  {q.ex}
                  {q.tr&&<div style={{marginTop:6,color:C.textMute,fontSize:11}}>Why the others are tempting: {q.tr}</div>}
                </div>}
              </div>}

              {q.type==="tf"&&<div>
                <div style={{display:"flex",gap:10,marginBottom:12}}>
                  {["true","false"].map(v=>{
                    const sel=answers[qk]===v,isThisCorrect=v==="true"?q.tf===true:q.tf===false
                    const correct=isDone&&isThisCorrect,wrong=isDone&&sel&&!isThisCorrect
                    return <button key={v} onClick={()=>!isDone&&handleAnswer(v)}
                      style={{padding:"9px 26px",borderRadius:6,fontSize:13,cursor:isDone?"default":"pointer",fontFamily:"var(--font-sans)",border:`0.5px solid ${wrong?C.bdDanger:correct?C.bdSuccess:sel?C.bdAccent:C.border}`,background:wrong?C.bgDanger:correct?C.bgSuccess:sel?C.bgAccent:"transparent",color:wrong?C.danger:correct?C.success:sel?C.accent:C.textSec}}>
                      {v.charAt(0).toUpperCase()+v.slice(1)}
                    </button>
                  })}
                </div>
                {isDone&&<div style={{padding:"12px 16px",borderRadius:6,background:C.bg1,borderLeft:`3px solid ${C.bdSuccess}`,fontSize:13,color:C.textSec,fontFamily:"var(--font-sans)",lineHeight:1.65}}>
                  <strong style={{color:C.success,display:"block",marginBottom:4}}>Answer: {q.tf?"True":"False"}</strong>
                  {q.ex}
                </div>}
              </div>}

              {q.type==="es"&&<div>
                <textarea value={essayTexts[qk]||""} onChange={e=>handleEssay(e.target.value)} placeholder="Write your response here…" rows={7} disabled={isDone} style={{width:"100%"}}/>
                {!isDone&&<div style={{display:"flex",gap:8,marginTop:10,alignItems:"center"}}>
                  <button onClick={scoreEssay} disabled={!essayTexts[qk]?.trim()||scoring[qk]}
                    style={{padding:"6px 16px",fontSize:12,border:`0.5px solid ${C.bdAccent}`,borderRadius:6,cursor:"pointer",background:C.bgAccent,color:C.accent,fontFamily:"var(--font-sans)"}}>
                    {scoring[qk]?"Scoring with AI…":"Score with AI"}
                  </button>
                  {aiScores[qk]?.score!=null&&<span style={{fontSize:12,color:C.textMute,fontFamily:"var(--font-sans)"}}>Score: {aiScores[qk].score}/5</span>}
                </div>}
                {aiScores[qk]&&<div style={{marginTop:12,padding:"12px 16px",borderRadius:6,background:C.bg1,borderLeft:`3px solid ${aiScores[qk].score>=4?C.bdSuccess:aiScores[qk].score>=3?C.bdWarn:C.bdDanger}`,fontSize:13,color:C.textSec,fontFamily:"var(--font-sans)",lineHeight:1.65}}>
                  <strong style={{color:aiScores[qk].score>=4?C.success:aiScores[qk].score>=3?C.warning:C.danger}}>{aiScores[qk].score}/5 — </strong>
                  {aiScores[qk].feedback}
                </div>}
                <div style={{marginTop:12,padding:"10px 14px",background:C.bg1,borderRadius:6,fontSize:11,color:C.textMute,fontFamily:"var(--font-sans)",borderLeft:`3px solid ${C.border}`,lineHeight:1.6}}>
                  <strong style={{color:C.warning}}>Evaluator guidance: </strong>{q.hint}
                </div>
              </div>}

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:24,paddingTop:18,borderTop:`0.5px solid ${C.border}`}}>
                <button style={navBtn} onClick={()=>qi>0?navigate(si,qi-1):si>0&&navigate(si-1,SECS[si-1].qs.length-1)}>← Previous</button>
                {si===SECS.length-1&&qi===sec.qs.length-1
                  ?(!isDone&&<button style={subBtn} onClick={handleSubmit} disabled={phase==="submitting"}>{phase==="submitting"?submitMsg:"Submit assessment →"}</button>)
                  :<button style={navBtn} onClick={()=>qi<sec.qs.length-1?navigate(si,qi+1):si<SECS.length-1&&navigate(si+1,0)}>Next →</button>
                }
              </div>
              {phase==="submitting"&&<div style={{marginTop:10,fontSize:12,color:C.accent,fontFamily:"var(--font-sans)"}}>{submitMsg}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div style={{height:24,background:"var(--fill-accent)",display:"flex",alignItems:"center",padding:"0 14px",gap:18,flexShrink:0}}>
        {[{i:"✓",l:`${isDone?correctObj:totalAnswered}/${isDone?TOTAL_OBJ:TOTAL_Q} ${isDone?"correct":"answered"}`},{i:"✎",l:`${essaysDone}/5 essays`},{i:"🔑",l:code.toUpperCase()}].map(s=>(
          <span key={s.l} style={{fontSize:11,color:"var(--on-accent)",fontFamily:"var(--font-sans)",display:"flex",alignItems:"center",gap:4}}>
            {s.i} {s.l}
          </span>
        ))}
        <span style={{marginLeft:"auto",fontSize:11,color:"var(--on-accent)",fontFamily:"var(--font-sans)"}}>{sec.title} · Q{qi+1}/{sec.qs.length}</span>
      </div>
    </div>
  )
}

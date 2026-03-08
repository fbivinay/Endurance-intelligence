import { useState, useEffect } from "react"
import { Area, AreaChart, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts"

const FontLink = () => (
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
)

const T = {
  bg: "#0d1117", surface: "#161b22", border: "rgba(255,255,255,0.10)",
  textPrime: "#f0f6fc", textSub: "#c9d1d9", textMuted: "#8b949e",
  body: "'Outfit', sans-serif", mono: "'JetBrains Mono', monospace", display: "'Bebas Neue', cursive",
}

const LEVELS = {
  Beginner:     { color: "#3fb950", decay: 0.013,  growthMult: 0.85, label: "0-1 yr",  icon: "🌱" },
  Intermediate: { color: "#e3b341", decay: 0.0105, growthMult: 1.0,  label: "1-3 yrs", icon: "⚡" },
  Advanced:     { color: "#f78166", decay: 0.009,  growthMult: 1.2,  label: "3-5 yrs", icon: "🔥" },
  Elite:        { color: "#d2a8ff", decay: 0.007,  growthMult: 1.4,  label: "5+ yrs",  icon: "🏆" },
}

const RACES = { "5K": 5, "10K": 10, "Half Marathon": 21.1, "Full Marathon": 42.2, "Ultra 50K": 50, "Custom": null }
const SESS_COLORS = { Easy: "#3fb950", Tempo: "#e3b341", Long: "#f78166", Recovery: "#58a6ff", Rest: "#30363d", Intervals: "#d2a8ff", Warmup: "#e3b341" }

const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || "YOUR_CLIENT_ID"
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

function stravaAuthUrl() {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID, response_type: "code",
    redirect_uri: `${APP_URL}/api/strava-callback`, approval_prompt: "auto", scope: "activity:read_all",
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

function classifyLevel(stats) {
  if (!stats) return "Beginner"
  const { avgPaceMin, weeklyKm } = stats
  if (avgPaceMin < 4.5 && weeklyKm > 70) return "Elite"
  if (avgPaceMin < 5.5 && weeklyKm > 40) return "Advanced"
  if (avgPaceMin < 6.5 && weeklyKm > 20) return "Intermediate"
  return "Beginner"
}

function computeStatsFromRuns(runs) {
  if (!runs || !runs.length) return null
  const paces = runs.map(r => r.pace / 60)
  const hrs = runs.filter(r => r.hr).map(r => r.hr)
  const dists = runs.map(r => r.distance / 1000)
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length
  const avgHr = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null
  const totalKm = dists.reduce((a, b) => a + b, 0)
  const longestKm = Math.max(...dists)
  const weeklyKm = totalKm / Math.max(runs.length / 4, 1)
  return {
    avgPaceMin: +avgPace.toFixed(2), avgHr: avgHr ? +avgHr.toFixed(0) : null,
    totalKm: +totalKm.toFixed(1), longestKm: +longestKm.toFixed(1),
    weeklyKm: +weeklyKm.toFixed(1), runsCount: runs.length,
  }
}

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
function addDays(date, days) {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}
function formatDate(date) {
  return date.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })
}
function formatShortDate(date) {
  return date.toLocaleDateString("en-GB", { day:"2-digit", month:"short" })
}
function daysBetween(d1, d2) {
  return Math.max(1, Math.round((new Date(d2) - new Date(d1)) / (1000*60*60*24)))
}

// ── PACE HELPERS — fix invalid times like 5:97 ────────────────────────────────
// Store pace as decimal min/km, display as M:SS
function paceToDisplay(decimalPace) {
  const mins = Math.floor(decimalPace)
  const secs = Math.round((decimalPace - mins) * 60)
  const safeSecs = secs >= 60 ? 59 : secs
  return `${mins}:${String(safeSecs).padStart(2, "0")}`
}

function paceRangeDisplay(low, high) {
  return `${paceToDisplay(low)}-${paceToDisplay(high)}`
}

// ── GOAL TIME HELPERS ─────────────────────────────────────────────────────────
function parseGoalTime(str) {
  if (!str) return null
  const parts = str.split(":").map(Number)
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts[0] * 60 + parts[1]
  if (parts.length === 1 && !isNaN(parts[0])) return parts[0]
  return null
}
function formatTime(mins) {
  const h = Math.floor(mins / 60); const m = Math.round(mins % 60)
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}` : `${m} min`
}
function predictRequiredTraining(goalTimeMinutes, raceDistKm) {
  const requiredPace = goalTimeMinutes / raceDistKm
  return {
    requiredPace: +requiredPace.toFixed(2),
    easyPace: +(requiredPace * 1.18).toFixed(2),
    weeklyLoad: +(raceDistKm * 1.9 + goalTimeMinutes * 0.05).toFixed(1),
    longRunKm: +(raceDistKm * 0.65).toFixed(1),
  }
}

// ── PLAN BUILDER ──────────────────────────────────────────────────────────────
// restDays: how many rest days per week (1, 2, or 3)
// Builds pattern dynamically based on restDays count
function buildWeekPattern(runSessions, restCount) {
  // Sunday (index 6) is ALWAYS Long Run day
  // Sat (index 5) is ALWAYS a rest day
  // 1 rest: Sat only
  // 2 rest: Wed + Sat
  // 3 rest: Tue + Thu + Sat
  // Sun = Long Run, never rest
  const LONG_RUN_DAY = 6  // Sunday
  const restPositions =
    restCount === 1 ? [5] :           // Sat
    restCount === 2 ? [2, 5] :        // Wed + Sat
    [1, 3, 5]                         // Tue + Thu + Sat

  // Build sessions for non-rest, non-sunday days
  // Mon(0) Tue(1) Wed(2) Thu(3) Fri(4) Sat(5) Sun(6)
  let sessionIdx = 0
  const pattern = []
  for (let i = 0; i < 7; i++) {
    if (i === LONG_RUN_DAY) {
      pattern.push(["Long", 0.30])   // Sunday always Long Run
    } else if (restPositions.includes(i)) {
      pattern.push(["Rest", 0])
    } else {
      const sess = runSessions[sessionIdx % runSessions.length]
      const frac = sess === "Easy" ? 0.22 : sess === "Tempo" ? 0.18 : sess === "Long" ? 0.30 : sess === "Intervals" ? 0.14 : sess === "Recovery" ? 0.10 : 0.18
      pattern.push([sess, frac])
      sessionIdx++
    }
  }
  return pattern
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function buildPlan(weeklyKm, goalKm, totalWeeks, pace, level, longRun, startDate, raceDate, restDaysPerWeek) {
  const cfg = LEVELS[level]
  const peak = goalKm * 2.2
  const growth = ((peak - weeklyKm) / Math.max(totalWeeks - 3, 1)) * cfg.growthMult
  const base = startDate ? new Date(startDate) : null

  // Session lists by run count (total runs = 7 - restDaysPerWeek)
  const runCount = 7 - restDaysPerWeek
  // Sunday is always Long Run, so pool only contains weekday sessions
  const sessionsByCount = {
    3: ["Easy", "Tempo", "Easy"],
    4: ["Easy", "Tempo", "Easy", "Intervals"],
    5: ["Easy", "Tempo", "Easy", "Intervals", "Recovery"],
    6: ["Easy", "Tempo", "Easy", "Intervals", "Recovery", "Easy"],
  }
  const runSessions = sessionsByCount[Math.min(6, Math.max(3, runCount))] || sessionsByCount[4]

  let wk = weeklyKm, lr = longRun
  const plan = Array.from({ length: totalWeeks }, (_, i) => {
    const n = i + 1
    const isLastWeek = n === totalWeeks
    const isSecondLast = n === totalWeeks - 1
    const taper = n > totalWeeks - 2

    if (taper) { wk *= 0.70; lr *= 0.60 }
    else { wk = Math.min(wk + growth, peak); lr = Math.min(lr + 1.5, goalKm) }

    const weekStart = base ? addDays(base, i * 7) : null
    const weekEnd = weekStart ? addDays(weekStart, 6) : null
    const pat = buildWeekPattern(runSessions, restDaysPerWeek)

    const days = pat.map(([sess, frac], di) => {
      const date = weekStart ? addDays(weekStart, di) : null
      const isRaceDay = raceDate && date && date.toDateString() === new Date(raceDate).toDateString()
      const isDayBeforeRace = raceDate && date && addDays(date, 1).toDateString() === new Date(raceDate).toDateString()

      // Override last day of plan and race day logic
      let finalSess = sess
      let km = frac > 0 ? +(wk * frac).toFixed(1) : 0

      if (isRaceDay) { finalSess = "Rest"; km = 0 }
      else if (isDayBeforeRace) { finalSess = "Warmup"; km = +(wk * 0.08).toFixed(1) }
      else if (isLastWeek && di === 6) { finalSess = "Rest"; km = 0 }
      else if (isSecondLast && di === 5) { finalSess = "Warmup"; km = +(wk * 0.12).toFixed(1) }

      const p = pace
      let paceStr = "--"
      if (finalSess === "Easy")      paceStr = paceRangeDisplay(p, p + 0.4)
      else if (finalSess === "Tempo")     paceStr = paceRangeDisplay(p - 0.7, p - 0.4)
      else if (finalSess === "Long")      paceStr = paceRangeDisplay(p + 0.3, p + 0.6)
      else if (finalSess === "Recovery")  paceStr = paceRangeDisplay(p + 0.6, p + 1.0)
      else if (finalSess === "Intervals") paceStr = paceRangeDisplay(p - 1.2, p - 0.8)
      else if (finalSess === "Warmup")    paceStr = paceRangeDisplay(p + 0.5, p + 0.8)

      return { day: DAYS_OF_WEEK[di], sess: finalSess, km, pace: paceStr, date: date ? formatShortDate(date) : null, isRace: isRaceDay }
    })

    return {
      week: n, totalKm: +wk.toFixed(1), longRun: +lr.toFixed(1), taper, days,
      dateRange: weekStart ? `${formatDate(weekStart)} - ${formatDate(weekEnd)}` : null,
    }
  })
  return plan
}

// ── UI COMPONENTS ─────────────────────────────────────────────────────────────
function Field({ label, min, max, step, value, onChange, unit="", accent, hint }) {
  const [raw, setRaw] = useState(String(value))
  const [focused, setFoc] = useState(false)
  useEffect(() => { if (!focused) setRaw(String(value)) }, [value, focused])
  const commit = v => { const n = parseFloat(v); if (!isNaN(n)) onChange(Math.min(max, Math.max(min, +n.toFixed(2)))) }
  const onKey = e => {
    if (e.key === "Enter") { e.target.blur(); commit(raw) }
    if (e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(max, +(value + step).toFixed(2))) }
    if (e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(min, +(value - step).toFixed(2))) }
  }
  const btn = { width:42, height:46, background:"rgba(255,255,255,0.06)", border:`1px solid ${T.border}`, borderRadius:10, color:T.textPrime, cursor:"pointer", fontSize:22, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ fontSize:15, fontWeight:600, color:T.textSub, fontFamily:T.body, marginBottom:8 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <button style={btn} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>-</button>
        <input type="text" value={focused ? raw : `${value}${unit}`}
          onFocus={() => { setFoc(true); setRaw(String(value)) }}
          onBlur={() => { setFoc(false); commit(raw) }}
          onChange={e => setRaw(e.target.value)} onKeyDown={onKey}
          style={{ flex:1, height:46, textAlign:"center", boxSizing:"border-box", background:focused?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.04)", border:`2px solid ${focused?accent:T.border}`, borderRadius:10, padding:"0 12px", fontFamily:T.mono, fontSize:20, fontWeight:700, color:accent, outline:"none", cursor:"text", transition:"all 0.15s" }}
        />
        <button style={btn} onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}>+</button>
      </div>
      <div style={{ fontSize:13, color:T.textMuted, fontFamily:T.body, marginTop:5 }}>{hint || `Range ${min}-${max === 9999 ? "unlimited" : max}${unit}`}</div>
    </div>
  )
}

function DateInput({ label, value, onChange, accent, hint }) {
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ fontSize:15, fontWeight:600, color:T.textSub, fontFamily:T.body, marginBottom:8 }}>{label}</div>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        style={{ width:"100%", height:46, boxSizing:"border-box", background:"rgba(255,255,255,0.04)", border:`2px solid ${T.border}`, borderRadius:10, padding:"0 16px", fontFamily:T.mono, fontSize:16, fontWeight:700, color:accent, outline:"none", cursor:"pointer", colorScheme:"dark" }}
      />
      {hint && <div style={{ fontSize:13, color:T.textMuted, fontFamily:T.body, marginTop:5 }}>{hint}</div>}
    </div>
  )
}

function Stat({ label, value, unit, color }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${color}35`, borderRadius:14, padding:"16px 18px", flex:1, minWidth:110 }}>
      <div style={{ fontFamily:T.mono, fontSize:26, fontWeight:700, color, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:13, color:T.textMuted, fontFamily:T.body, marginTop:4 }}>{unit}</div>
      <div style={{ fontSize:14, color:T.textSub, fontFamily:T.body, marginTop:6, fontWeight:600 }}>{label}</div>
    </div>
  )
}

function SecHead({ num, title, sub, color }) {
  return (
    <div style={{ marginBottom:30 }}>
      <div style={{ display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ width:54, height:54, borderRadius:14, background:`${color}18`, border:`2px solid ${color}50`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:T.display, fontSize:26, color, flexShrink:0 }}>{num}</div>
        <div>
          <h2 style={{ margin:0, fontFamily:T.display, fontSize:34, letterSpacing:"0.04em", color:T.textPrime, lineHeight:1 }}>{title}</h2>
          <p style={{ margin:"6px 0 0", fontSize:15, color:T.textSub, fontFamily:T.body }}>{sub}</p>
        </div>
      </div>
    </div>
  )
}

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:"#1c2128", border:`1px solid ${T.border}`, borderRadius:12, padding:"12px 16px" }}>
      <div style={{ fontFamily:T.mono, fontSize:13, color:T.textMuted, marginBottom:8 }}>WEEK {label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ fontFamily:T.mono, fontSize:15, color:p.color, marginBottom:4 }}>
          {p.name}: <strong>{typeof p.value==="number" ? p.value.toFixed(1) : p.value} km</strong>
        </div>
      ))}
    </div>
  )
}

function StravaConnect({ onDemo }) {
  return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, fontFamily:T.body }}>
      <FontLink />
      <div style={{ fontFamily:T.display, fontSize:32, color:"#e3b341", letterSpacing:"0.15em", marginBottom:12 }}>ENDURANCE INTELLIGENCE</div>
      <h1 style={{ fontFamily:T.display, fontSize:"clamp(2.8rem,6vw,5rem)", color:T.textPrime, textAlign:"center", lineHeight:0.95, margin:"0 0 20px" }}>
        TRAIN SMARTER.<br /><span style={{ color:"#e3b341" }}>RUN FASTER.</span>
      </h1>
      <p style={{ color:T.textSub, fontSize:17, maxWidth:500, textAlign:"center", lineHeight:1.8, marginBottom:48 }}>
        Connect your Strava account and get a science-backed, fully personalised training plan built from your real running data.
      </p>
      <a href={stravaAuthUrl()} style={{ display:"flex", alignItems:"center", gap:14, background:"#FC4C02", color:"#fff", padding:"16px 32px", borderRadius:14, textDecoration:"none", fontFamily:T.body, fontSize:18, fontWeight:700, boxShadow:"0 4px 24px rgba(252,76,2,0.35)", marginBottom:20 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
        </svg>
        Connect with Strava
      </a>
      <button onClick={onDemo} style={{ background:"transparent", border:`1px solid ${T.border}`, color:T.textMuted, padding:"10px 24px", borderRadius:10, cursor:"pointer", fontFamily:T.body, fontSize:14 }}>
        Try with demo data instead
      </button>
      <div style={{ marginTop:64, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20, maxWidth:680, width:"100%" }}>
        {[
          { icon:"🔗", title:"Connect", desc:"Securely link your Strava account via OAuth" },
          { icon:"📊", title:"Analyse", desc:"We read your last 60 runs - pace, HR, elevation" },
          { icon:"🏃", title:"Train", desc:"Get a personalised week-by-week plan instantly" },
        ].map(s => (
          <div key={s.title} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:"22px 20px", textAlign:"center" }}>
            <div style={{ fontSize:28, marginBottom:10 }}>{s.icon}</div>
            <div style={{ fontFamily:T.display, fontSize:20, color:T.textPrime, letterSpacing:"0.05em", marginBottom:8 }}>{s.title}</div>
            <div style={{ fontSize:14, color:T.textSub, lineHeight:1.6 }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LoadingScreen({ name }) {
  return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
      <FontLink />
      <div style={{ width:60, height:60, border:"3px solid rgba(255,255,255,0.1)", borderTop:"3px solid #FC4C02", borderRadius:"50%", animation:"spin 0.9s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ fontFamily:T.mono, fontSize:15, color:T.textSub }}>
        {name ? `Loading ${name}'s runs from Strava...` : "Connecting to Strava..."}
      </div>
    </div>
  )
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]   = useState("connect")
  const [athlete, setAthlete] = useState(null)
  const [stravaRuns, setRuns] = useState(null)
  const [isDemo, setIsDemo]   = useState(false)
  const [level, setLevel]     = useState("Intermediate")
  const [autoLevel, setAutoLevel] = useState(null) // set from Strava

  const [race, setRace]         = useState("Half Marathon")
  const [cKm, setCKm]           = useState(30)
  const [wkKm, setWkKm]         = useState(25)
  const [lRun, setLRun]         = useState(10)
  const [pace, setPace]         = useState(6.5)
  const [openWk, setOpenWk]     = useState(null)
  const [goalTime, setGoalTime] = useState("")
  const [restDays, setRestDays] = useState(2)

  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0])
  const [raceDate, setRaceDate]   = useState("")

  const [trainingDaysDone, setTrainingDaysDone] = useState(0)
  const [daysOff, setDaysOff] = useState(7)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const athleteId = params.get("athlete_id")
    const name = params.get("name")
    const error = params.get("error")
    if (error) { setScreen("connect"); return }
    if (athleteId) {
      setScreen("loading")
      setAthlete({ id: athleteId, firstname: name || "Athlete" })
      window.history.replaceState({}, "", "/")
      fetchRuns(athleteId)
    }
  }, [])

  async function fetchRuns(athleteId) {
    try {
      const res = await fetch(`/api/activities?athlete_id=${athleteId}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAthlete(data.athlete)
      setRuns(data.runs)
      const stats = computeStatsFromRuns(data.runs)
      if (stats) {
        setWkKm(Math.round(stats.weeklyKm))
        setPace(+stats.avgPaceMin.toFixed(2))
        setLRun(Math.min(stats.longestKm, 40))
        const classified = classifyLevel(stats)
        setLevel(classified)
        setAutoLevel(classified)
      }
      setIsDemo(false)
      setScreen("dashboard")
    } catch (err) { setScreen("connect") }
  }

  function useDemo() {
    setAthlete({ id:"demo", firstname:"Demo", lastname:"Runner", pic:null })
    setRuns([])
    setIsDemo(true)
    setAutoLevel(null)
    setScreen("dashboard")
  }

  // Compute weeks: if race date set, use diff; else default 16
  const totalWeeks = raceDate && startDate
    ? Math.max(1, Math.ceil(daysBetween(startDate, raceDate) / 7))
    : 16

  const goalKm       = race === "Custom" ? cKm : RACES[race]
  const cfg          = LEVELS[level]
  const acc          = cfg.color
  const goalTimeMins = parseGoalTime(goalTime)
  const mlPrediction = goalTimeMins && goalKm ? predictRequiredTraining(goalTimeMins, goalKm) : null
  const effectivePace= mlPrediction ? mlPrediction.easyPace : pace
  const effectiveWkKm= mlPrediction ? Math.max(wkKm, mlPrediction.weeklyLoad * 0.6) : wkKm

  const plan   = buildPlan(effectiveWkKm, goalKm, totalWeeks, effectivePace, level, lRun, startDate, raceDate, restDays)
  const peak   = Math.max(...plan.map(w => w.totalKm))
  const chart1 = plan.map(w => ({ week: w.week, "Weekly Load": w.totalKm, "Long Run": w.longRun }))
  const decay  = Array.from({length:61}, (_, d) => ({ day: d, fitness: +(Math.exp(-cfg.decay * d) * 100).toFixed(1) }))
  const fLoss  = +(100 - Math.exp(-cfg.decay * daysOff) * 100).toFixed(2)
  const stats  = stravaRuns && stravaRuns.length ? computeStatsFromRuns(stravaRuns) : null

  const card = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:24, padding:"36px 40px", marginBottom:28 }
  const grid2 = { display:"grid", gridTemplateColumns:"360px 1fr", gap:44 }
  const axis  = { stroke:"#30363d", tick:{ fill:T.textSub, fontSize:13, fontFamily:"JetBrains Mono", fontWeight:500 } }

  if (screen === "connect") return <StravaConnect onDemo={useDemo} />
  if (screen === "loading") return <LoadingScreen name={athlete?.firstname} />

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.textPrime, fontFamily:T.body }}>
      <FontLink />

      {/* TOPBAR — no level switcher for Strava users (auto-classified) */}
      <div style={{ borderBottom:`1px solid ${T.border}`, padding:"0 40px" }}>
        <div style={{ maxWidth:1240, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:72 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:11, background:`linear-gradient(135deg,${acc},${acc}70)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>⚡</div>
            <span style={{ fontFamily:T.display, fontSize:26, letterSpacing:"0.12em", color:acc }}>ENDURANCE INTELLIGENCE</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            {/* Level switcher only for demo users */}
            {isDemo && (
              <div style={{ display:"flex", gap:6 }}>
                {Object.entries(LEVELS).map(([k,v]) => (
                  <button key={k} onClick={() => setLevel(k)} style={{ padding:"8px 14px", borderRadius:10, cursor:"pointer", fontFamily:T.body, fontSize:14, fontWeight:level===k?700:500, background:level===k?`${v.color}20`:"rgba(255,255,255,0.05)", border:`2px solid ${level===k?v.color:T.border}`, color:level===k?v.color:T.textSub, display:"flex", alignItems:"center", gap:6 }}>
                    <span>{v.icon}</span> {k}
                  </button>
                ))}
              </div>
            )}
            {/* Auto-classified badge for real users */}
            {!isDemo && autoLevel && (
              <div style={{ background:`${cfg.color}15`, border:`1px solid ${cfg.color}50`, borderRadius:20, padding:"8px 18px", display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:18 }}>{cfg.icon}</span>
                <div>
                  <div style={{ fontFamily:T.mono, fontSize:11, color:T.textMuted, letterSpacing:"0.1em" }}>AUTO-CLASSIFIED</div>
                  <div style={{ fontFamily:T.mono, fontSize:14, fontWeight:700, color:cfg.color }}>{level.toUpperCase()}</div>
                </div>
                {/* Allow manual override */}
                <select value={level} onChange={e => setLevel(e.target.value)}
                  style={{ background:"transparent", border:"none", color:T.textMuted, fontFamily:T.body, fontSize:12, cursor:"pointer", outline:"none", marginLeft:4 }}>
                  {Object.keys(LEVELS).map(k => <option key={k} value={k} style={{ background:"#161b22" }}>{k}</option>)}
                </select>
              </div>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(252,76,2,0.10)", border:"1px solid rgba(252,76,2,0.30)", borderRadius:30, padding:"8px 16px" }}>
              {athlete?.pic && <img src={athlete.pic} style={{ width:28, height:28, borderRadius:"50%", objectFit:"cover" }} alt="" />}
              <span style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:"#FC4C02" }}>
                {athlete?.firstname} {athlete?.lastname || ""}
                {isDemo && <span style={{ fontSize:11, color:T.textMuted, marginLeft:6 }}>(Demo)</span>}
              </span>
              <button onClick={() => setScreen("connect")} style={{ background:"none", border:"none", color:T.textMuted, cursor:"pointer", fontSize:13, fontFamily:T.body }}>Disconnect</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1240, margin:"0 auto", padding:"48px 40px 80px" }}>

        {/* STRAVA STATS BANNER */}
        {stats && !isDemo && (
          <div style={{ background:"rgba(252,76,2,0.06)", border:"1px solid rgba(252,76,2,0.20)", borderRadius:20, padding:"24px 32px", marginBottom:32 }}>
            <div style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:"#FC4C02", letterSpacing:"0.15em", marginBottom:16 }}>
              📡 LIVE FROM STRAVA — {stats.runsCount} RUNS ANALYSED
            </div>
            <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
              {[
                ["Avg Pace",    paceToDisplay(stats.avgPaceMin), "min/km"],
                ["Avg HR",      stats.avgHr ? `${stats.avgHr}` : "N/A", "bpm"],
                ["Total Logged",`${stats.totalKm}`, "km"],
                ["Longest Run", `${stats.longestKm}`, "km"],
                ["Est. Weekly", `${stats.weeklyKm}`, "km/wk"],
              ].map(([lbl,val,unit]) => (
                <div key={lbl} style={{ background:"rgba(252,76,2,0.08)", borderRadius:12, padding:"14px 20px", textAlign:"center", minWidth:110 }}>
                  <div style={{ fontFamily:T.mono, fontSize:22, fontWeight:700, color:"#FC4C02" }}>{val}</div>
                  <div style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>{unit}</div>
                  <div style={{ fontSize:13, color:T.textSub, marginTop:4, fontWeight:600 }}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ 01 — TRAINING PLAN ══ */}
        <div style={card}>
          <SecHead num="01" title="Goal-Aware Training Plan" sub="ML-powered plan calibrated to your goal time and Strava data" color={acc} />
          <div style={grid2}>
            <div>

              {/* TARGET RACE */}
              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:15, fontWeight:700, color:T.textSub, marginBottom:10 }}>TARGET RACE</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {Object.keys(RACES).map(r => (
                    <button key={r} onClick={() => setRace(r)} style={{ padding:"10px 12px", borderRadius:10, cursor:"pointer", fontFamily:T.body, fontSize:14, fontWeight:race===r?700:500, background:race===r?`${acc}20`:"rgba(255,255,255,0.04)", border:`2px solid ${race===r?acc:T.border}`, color:race===r?acc:T.textSub, transition:"all 0.15s" }}>{r}</button>
                  ))}
                </div>
              </div>
              {race === "Custom" && <Field label="Custom Distance" min={1} max={9999} step={0.5} value={cKm} onChange={setCKm} unit=" km" accent={acc} />}

              {/* GOAL TIME */}
              <div style={{ marginBottom:22 }}>
                <div style={{ fontSize:15, fontWeight:600, color:T.textSub, fontFamily:T.body, marginBottom:8 }}>🎯 Goal Finish Time</div>
                <input type="text" placeholder="e.g. 1:55 or 2:10" value={goalTime} onChange={e => setGoalTime(e.target.value)}
                  style={{ width:"100%", height:46, textAlign:"center", boxSizing:"border-box", background:"rgba(255,255,255,0.04)", border:`2px solid ${T.border}`, borderRadius:10, padding:"0 12px", fontFamily:T.mono, fontSize:18, fontWeight:700, color:acc, outline:"none", colorScheme:"dark" }}
                />
                <div style={{ fontSize:13, color:T.textMuted, fontFamily:T.body, marginTop:5 }}>Format H:MM (e.g. 1:45) · ML model adjusts plan from 42k runs</div>
              </div>

              {mlPrediction && (
                <div style={{ background:`${acc}10`, border:`1px solid ${acc}40`, borderRadius:14, padding:"14px 18px", marginBottom:22 }}>
                  <div style={{ fontFamily:T.mono, fontSize:12, fontWeight:700, color:acc, letterSpacing:"0.12em", marginBottom:10 }}>🤖 ML PREDICTION</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {[["Race Pace", `${paceToDisplay(mlPrediction.requiredPace)} /km`], ["Easy Pace", `${paceToDisplay(mlPrediction.easyPace)} /km`], ["Peak Weekly", `${mlPrediction.weeklyLoad} km`], ["Long Run", `${mlPrediction.longRunKm} km`]].map(([l,v]) => (
                      <div key={l} style={{ fontSize:13, color:T.textSub, fontFamily:T.body }}>
                        <span style={{ color:T.textMuted }}>{l}: </span>
                        <span style={{ fontFamily:T.mono, fontWeight:700, color:acc }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:12, color:T.textMuted, marginTop:8, fontFamily:T.body }}>Plan adjusted to hit {formatTime(goalTimeMins)} · 42,116 runs dataset</div>
                </div>
              )}

              {/* START DATE */}
              <DateInput label="📅 Training Start Date" value={startDate} onChange={setStartDate} accent={acc} hint="Plan begins from this date" />

              {/* RACE DATE */}
              <DateInput label="🏁 Race Date" value={raceDate} onChange={setRaceDate} accent="#f78166"
                hint={raceDate && startDate ? `${daysBetween(startDate, raceDate)} days = ${totalWeeks} weeks of training` : "Optional — auto-sets training duration"} />

              {/* REST DAYS PER WEEK */}
              <div style={{ marginBottom:22 }}>
                <div style={{ fontSize:15, fontWeight:600, color:T.textSub, fontFamily:T.body, marginBottom:8 }}>😴 Rest Days Per Week</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[1, 2, 3].map(n => (
                    <button key={n} onClick={() => setRestDays(n)} style={{ flex:1, padding:"12px", borderRadius:10, cursor:"pointer", fontFamily:T.mono, fontSize:16, fontWeight:700, background:restDays===n?`${acc}20`:"rgba(255,255,255,0.04)", border:`2px solid ${restDays===n?acc:T.border}`, color:restDays===n?acc:T.textSub, transition:"all 0.15s" }}>
                      {n} {n === 1 ? "day" : "days"}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize:13, color:T.textMuted, fontFamily:T.body, marginTop:5 }}>
                  {restDays === 1 ? "Rest: Sat · Long Run: Sun" : restDays === 2 ? "Rest: Wed + Sat · Long Run: Sun" : "Rest: Tue + Thu + Sat · Long Run: Sun"} · {7 - restDays} sessions/week
                </div>
              </div>

              <Field label="Current Weekly Mileage" min={1} max={9999} step={1} value={wkKm} onChange={setWkKm} unit=" km" accent={acc} hint="1 km to unlimited" />
              <Field label="Longest Recent Run" min={1} max={9999} step={0.5} value={lRun} onChange={setLRun} unit=" km" accent={acc} hint="1 km to unlimited" />
              {!mlPrediction && <Field label="Easy Pace" min={3.0} max={12.0} step={0.05} value={pace} onChange={setPace} unit=" min/km" accent={acc} hint="3-12 min/km · displayed as M:SS" />}

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:6 }}>
                <Stat label="Race Distance" value={goalKm} unit="kilometres" color={acc} />
                <Stat label="Peak Weekly" value={peak.toFixed(1)} unit="km / week" color={acc} />
                <Stat label="Run Sessions" value={7 - restDays} unit="per week" color="#58a6ff" />
                <Stat label="Experience" value={cfg.icon} unit={cfg.label} color="#58a6ff" />
              </div>
            </div>

            <div>
              <div style={{ height:300, marginBottom:28 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart1} margin={{ top:10, right:10, left:-10, bottom:0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={acc} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={acc} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                    <XAxis dataKey="week" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip content={<Tip />} />
                    <Legend wrapperStyle={{ fontFamily:T.body, fontSize:15, color:T.textSub }} />
                    <Area type="monotone" dataKey="Weekly Load" stroke={acc} fill="url(#g1)" strokeWidth={3} dot={false} />
                    <Area type="monotone" dataKey="Long Run" stroke="#f78166" fill="transparent" strokeWidth={2.5} dot={false} strokeDasharray="6 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:T.textMuted, letterSpacing:"0.12em", marginBottom:12 }}>WEEKLY BREAKDOWN — CLICK TO EXPAND</div>
              <div style={{ maxHeight:400, overflowY:"auto", paddingRight:4 }}>
                {plan.map(w => (
                  <div key={w.week} style={{ marginBottom:6 }}>
                    <button onClick={() => setOpenWk(openWk === w.week ? null : w.week)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", background:w.taper?"rgba(88,166,255,0.08)":"rgba(255,255,255,0.03)", border:`1px solid ${openWk===w.week?acc+"70":T.border}`, borderRadius:10, padding:"13px 18px", cursor:"pointer", transition:"all 0.15s" }}>
                      <div style={{ textAlign:"left" }}>
                        <span style={{ fontFamily:T.mono, fontSize:15, fontWeight:700, color:w.taper?"#58a6ff":T.textSub }}>WEEK {w.week}{w.taper?" — TAPER":""}</span>
                        {w.dateRange && <div style={{ fontFamily:T.body, fontSize:12, color:T.textMuted, marginTop:2 }}>{w.dateRange}</div>}
                      </div>
                      <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                        <span style={{ fontFamily:T.mono, fontSize:16, fontWeight:700, color:acc }}>{w.totalKm} km</span>
                        <span style={{ color:T.textMuted, fontSize:16 }}>{openWk === w.week ? "▲" : "▼"}</span>
                      </div>
                    </button>
                    {openWk === w.week && (
                      <div style={{ marginTop:4, background:"rgba(0,0,0,0.45)", borderRadius:10, border:`1px solid ${T.border}`, overflow:"hidden" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"65px 50px 110px 1fr 65px 130px", padding:"8px 18px", borderBottom:`1px solid ${T.border}`, gap:8 }}>
                          {["DATE","DAY","SESSION","","DIST","PACE"].map(h => <span key={h} style={{ fontFamily:T.mono, fontSize:11, fontWeight:700, color:T.textMuted, letterSpacing:"0.10em" }}>{h}</span>)}
                        </div>
                        {w.days.map((d, i) => (
                          <div key={i} style={{ display:"grid", gridTemplateColumns:"65px 50px 110px 1fr 65px 130px", padding:"11px 18px", gap:8, alignItems:"center", borderBottom:i<6?`1px solid rgba(255,255,255,0.05)`:"none", background:d.isRace?"rgba(252,76,2,0.06)":"transparent" }}>
                            <span style={{ fontFamily:T.mono, fontSize:11, fontWeight:600, color:T.textMuted }}>{d.date || "--"}</span>
                            <span style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:T.textMuted }}>{d.day}</span>
                            <span style={{ fontFamily:T.body, fontSize:14, fontWeight:700, color:SESS_COLORS[d.sess] || T.textSub }}>● {d.sess}{d.isRace?" 🏁":""}</span>
                            <div style={{ height:5, background:"rgba(255,255,255,0.08)", borderRadius:3, overflow:"hidden" }}>
                              {d.km > 0 && <div style={{ height:"100%", width:`${Math.min(100,(d.km/w.totalKm)*250)}%`, background:SESS_COLORS[d.sess] || T.textSub, borderRadius:3 }} />}
                            </div>
                            <span style={{ fontFamily:T.mono, fontSize:14, fontWeight:700, color:T.textSub, textAlign:"right" }}>{d.km > 0 ? `${d.km}km` : "--"}</span>
                            <span style={{ fontFamily:T.mono, fontSize:12, fontWeight:500, color:T.textSub, textAlign:"right" }}>{d.pace}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ══ 02 — FITNESS DECAY ══ */}
        <div style={card}>
          <SecHead num="02" title="Fitness Loss Forecast" sub="How much fitness do you lose during rest days?" color="#f78166" />
          <div style={grid2}>
            <div>
              <Field label="Training Days Completed" min={0} max={365} step={1} value={trainingDaysDone} onChange={setTrainingDaysDone} unit=" days" accent="#58a6ff" hint="How many days of training have you already done?" />
              <Field label="Rest Days Taken" min={1} max={60} step={1} value={daysOff} onChange={setDaysOff} unit=" days" accent="#f78166" hint="How many consecutive rest days are you taking?" />
              <div style={{ background:"rgba(247,129,102,0.09)", border:"2px solid rgba(247,129,102,0.32)", borderRadius:16, padding:"22px 24px", marginTop:8 }}>
                <div style={{ fontFamily:T.mono, fontSize:14, fontWeight:700, color:"#f78166", letterSpacing:"0.12em", marginBottom:18 }}>DETRAINING REPORT</div>
                {[
                  ["Training done",    `${trainingDaysDone} days`],
                  ["Rest days",        `${daysOff} days`],
                  ["Fitness retained", `${(100-fLoss).toFixed(1)}%`],
                  ["Estimated loss",   `-${fLoss}%`],
                  ["Recovery time",    `~${Math.round(daysOff*0.65)} days`],
                  ["Decay rate",       cfg.decay.toFixed(4)],
                ].map(([lbl,val]) => (
                  <div key={lbl} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, paddingBottom:12, borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontSize:15, fontWeight:500, color:T.textSub, fontFamily:T.body }}>{lbl}</span>
                    <span style={{ fontFamily:T.mono, fontSize:16, fontWeight:700, color:"#f78166" }}>{val}</span>
                  </div>
                ))}
                <p style={{ margin:0, fontSize:15, color:T.textSub, lineHeight:1.75, fontFamily:T.body }}>
                  {level==="Elite"||level==="Advanced" ? "Strong aerobic base — slower decay and faster bounce-back." : trainingDaysDone > 60 ? "Good base built — fitness decays slower with consistent training history." : "Aerobic base preserved under 14 days. Rebuild at 60% volume on return."}
                </p>
              </div>
            </div>
            <div style={{ height:380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={decay} margin={{ top:10, right:10, left:-10, bottom:24 }}>
                  <defs>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f78166" stopOpacity={0.40} />
                      <stop offset="100%" stopColor="#f78166" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis dataKey="day" {...axis} label={{ value:"Days Inactive", position:"insideBottom", offset:-8, fill:T.textMuted, fontSize:14 }} />
                  <YAxis domain={[50,100]} {...axis} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={v => [`${v}%`, "Fitness"]} contentStyle={{ background:"#1c2128", border:`1px solid ${T.border}`, borderRadius:12, fontFamily:"JetBrains Mono", fontSize:14, color:T.textSub }} />
                  <ReferenceLine x={daysOff} stroke="#f78166" strokeWidth={2.5} strokeDasharray="6 3" label={{ value:`Day ${daysOff}`, fill:"#f78166", fontSize:14, fontFamily:"JetBrains Mono", fontWeight:700 }} />
                  <ReferenceLine x={14} stroke="rgba(255,255,255,0.28)" strokeDasharray="4 2" label={{ value:"14d", fill:T.textMuted, fontSize:13, fontFamily:"JetBrains Mono" }} />
                  <Area type="monotone" dataKey="fitness" stroke="#f78166" fill="url(#g2)" strokeWidth={3} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:48, fontFamily:T.mono, fontSize:14, fontWeight:600, color:T.textMuted, letterSpacing:"0.1em" }}>
          ENDURANCE INTELLIGENCE SYSTEM · MSc BIG DATA ANALYTICS · SJU BANGALORE
        </div>
      </div>
    </div>
  )
}

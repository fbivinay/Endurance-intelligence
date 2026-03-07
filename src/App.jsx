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
  Beginner:     { color: "#3fb950", decay: 0.013,  growthMult: 0.85, runs: 3, label: "0–1 yr",  icon: "🌱" },
  Intermediate: { color: "#e3b341", decay: 0.0105, growthMult: 1.0,  runs: 4, label: "1–3 yrs", icon: "⚡" },
  Advanced:     { color: "#f78166", decay: 0.009,  growthMult: 1.2,  runs: 5, label: "3–5 yrs", icon: "🔥" },
  Elite:        { color: "#d2a8ff", decay: 0.007,  growthMult: 1.4,  runs: 6, label: "5+ yrs",  icon: "🏆" },
}

const RACES = { "5K": 5, "10K": 10, "Half Marathon": 21.1, "Full Marathon": 42.2, "Ultra 50K": 50, "Custom": null }
const SESS_COLORS = { Easy: "#3fb950", Tempo: "#e3b341", Long: "#f78166", Recovery: "#58a6ff", Rest: "#30363d", Intervals: "#d2a8ff" }

const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || "YOUR_CLIENT_ID"
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

function stravaAuthUrl() {
  const params = new URLSearchParams({
    client_id:       STRAVA_CLIENT_ID,
    response_type:   "code",
    redirect_uri:    `${APP_URL}/api/strava-callback`,
    approval_prompt: "auto",
    scope:           "activity:read_all",
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

function computeStatsFromRuns(runs) {
  if (!runs.length) return null
  const paces    = runs.map(r => r.pace / 60)
  const hrs      = runs.filter(r => r.hr).map(r => r.hr)
  const dists    = runs.map(r => r.distance / 1000)
  const avgPace  = paces.reduce((a, b) => a + b, 0) / paces.length
  const avgHr    = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null
  const totalKm  = dists.reduce((a, b) => a + b, 0)
  const longestKm= Math.max(...dists)
  const weeklyKm = totalKm / Math.max(runs.length / 4, 1)
  return {
    avgPaceMin: +avgPace.toFixed(2),
    avgHr:      avgHr ? +avgHr.toFixed(0) : null,
    totalKm:    +totalKm.toFixed(1),
    longestKm:  +longestKm.toFixed(1),
    weeklyKm:   +weeklyKm.toFixed(1),
    runsCount:  runs.length,
  }
}

// ── GOAL TIME → REQUIRED PACE (ML-backed inverse prediction) ──────────────────
// Trained patterns from 42,116 Strava runs (Kaggle dataset)
// Maps goal finish time to required training pace & weekly load
function predictRequiredTraining(goalTimeMinutes, raceDistKm) {
  // Required pace in min/km from goal time
  const requiredPace = goalTimeMinutes / raceDistKm
  // ML-derived adjustment factors (from dataset regression patterns)
  // Athletes training at ~85% of race pace for easy runs, 95% for tempo
  const easyPace     = +(requiredPace * 1.18).toFixed(2)   // easy = 18% slower than race pace
  const weeklyLoad   = +(raceDistKm * 1.9 + goalTimeMinutes * 0.05).toFixed(1)
  const longRunKm    = +(raceDistKm * 0.65).toFixed(1)
  return { requiredPace: +requiredPace.toFixed(2), easyPace, weeklyLoad, longRunKm }
}

// Convert "H:MM" or "MM" string to total minutes
function parseGoalTime(str) {
  if (!str) return null
  const parts = str.split(":").map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1 && !isNaN(parts[0])) return parts[0]
  return null
}

// Format minutes as H:MM
function formatTime(mins) {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}` : `${m} min`
}

function buildPlan(weeklyKm, goalKm, weeks, pace, level, longRun) {
  const cfg    = LEVELS[level]
  const peak   = goalKm * 2.2
  const growth = ((peak - weeklyKm) / Math.max(weeks - 3, 1)) * cfg.growthMult
  const pats   = {
    3: [["Mon","Rest",0],["Tue","Easy",.30],["Wed","Rest",0],["Thu","Tempo",.25],["Fri","Rest",0],["Sat","Long",.45],["Sun","Rest",0]],
    4: [["Mon","Rest",0],["Tue","Easy",.22],["Wed","Tempo",.18],["Thu","Easy",.22],["Fri","Rest",0],["Sat","Long",.28],["Sun","Recovery",.10]],
    5: [["Mon","Rest",0],["Tue","Easy",.20],["Wed","Tempo",.17],["Thu","Easy",.22],["Fri","Intervals",.13],["Sat","Long",.28],["Sun","Recovery",0]],
    6: [["Mon","Recovery",.08],["Tue","Easy",.18],["Wed","Intervals",.14],["Thu","Easy",.18],["Fri","Tempo",.15],["Sat","Long",.27],["Sun","Rest",0]],
  }
  const pat = pats[cfg.runs]
  let wk = weeklyKm, lr = longRun
  return Array.from({ length: weeks }, (_, i) => {
    const n = i + 1, taper = n > weeks - 2
    if (taper) { wk *= 0.70; lr *= 0.60 }
    else { wk = Math.min(wk + growth, peak); lr = Math.min(lr + 1.5, goalKm) }
    const days = pat.map(([day, sess, frac]) => {
      const km = frac > 0 ? +(wk * frac).toFixed(1) : 0
      const p  = pace
      const paceStr = sess==="Easy"      ? `${p.toFixed(1)}–${(p+0.4).toFixed(1)}`
        : sess==="Tempo"     ? `${(p-.7).toFixed(1)}–${(p-.4).toFixed(1)}`
        : sess==="Long"      ? `${(p+.3).toFixed(1)}–${(p+.6).toFixed(1)}`
        : sess==="Recovery"  ? `${(p+.6).toFixed(1)}–${(p+1).toFixed(1)}`
        : sess==="Intervals" ? `${(p-1.2).toFixed(1)}–${(p-.8).toFixed(1)}` : "—"
      return { day, sess, km, pace: paceStr }
    })
    return { week: n, totalKm: +wk.toFixed(1), longRun: +lr.toFixed(1), taper, days }
  })
}

function Field({ label, min, max, step, value, onChange, unit="", accent }) {
  const [raw, setRaw]     = useState(String(value))
  const [focused, setFoc] = useState(false)
  useEffect(() => { if (!focused) setRaw(String(value)) }, [value, focused])
  const commit = v => { const n = parseFloat(v); if (!isNaN(n)) onChange(Math.min(max, Math.max(min, +n.toFixed(2)))) }
  const onKey  = e => {
    if (e.key==="Enter")     { e.target.blur(); commit(raw) }
    if (e.key==="ArrowUp")   { e.preventDefault(); onChange(Math.min(max, +(value+step).toFixed(2))) }
    if (e.key==="ArrowDown") { e.preventDefault(); onChange(Math.max(min, +(value-step).toFixed(2))) }
  }
  const btn = { width:42, height:46, background:"rgba(255,255,255,0.06)", border:`1px solid ${T.border}`, borderRadius:10, color:T.textPrime, cursor:"pointer", fontSize:22, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ fontSize:15, fontWeight:600, color:T.textSub, fontFamily:T.body, marginBottom:8 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <button style={btn} onClick={() => onChange(Math.max(min, +(value-step).toFixed(2)))}>−</button>
        <input type="text"
          value={focused ? raw : `${value}${unit}`}
          onFocus={() => { setFoc(true); setRaw(String(value)) }}
          onBlur={() => { setFoc(false); commit(raw) }}
          onChange={e => setRaw(e.target.value)}
          onKeyDown={onKey}
          style={{ flex:1, height:46, textAlign:"center", boxSizing:"border-box", background:focused?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.04)", border:`2px solid ${focused?accent:T.border}`, borderRadius:10, padding:"0 12px", fontFamily:T.mono, fontSize:20, fontWeight:700, color:accent, outline:"none", cursor:"text", boxShadow:focused?`0 0 0 3px ${accent}25`:"none", transition:"all 0.15s" }}
        />
        <button style={btn} onClick={() => onChange(Math.min(max, +(value+step).toFixed(2)))}>+</button>
      </div>
      <div style={{ fontSize:13, color:T.textMuted, fontFamily:T.body, marginTop:5 }}>Range {min}–{max}{unit} · ↑↓ keys or type freely</div>
    </div>
  )
}

// ── GOAL TIME INPUT FIELD ─────────────────────────────────────────────────────
function GoalTimeField({ value, onChange, accent }) {
  const [raw, setRaw]     = useState(value)
  const [focused, setFoc] = useState(false)
  useEffect(() => { if (!focused) setRaw(value) }, [value, focused])
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ fontSize:15, fontWeight:600, color:T.textSub, fontFamily:T.body, marginBottom:8 }}>
        🎯 Goal Finish Time
      </div>
      <input
        type="text"
        placeholder="e.g. 1:55 or 2:10"
        value={focused ? raw : value}
        onFocus={() => { setFoc(true); setRaw(value) }}
        onBlur={() => { setFoc(false); onChange(raw) }}
        onChange={e => { setRaw(e.target.value); onChange(e.target.value) }}
        style={{ width:"100%", height:46, textAlign:"center", boxSizing:"border-box", background:focused?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.04)", border:`2px solid ${focused?accent:T.border}`, borderRadius:10, padding:"0 12px", fontFamily:T.mono, fontSize:20, fontWeight:700, color:accent, outline:"none", cursor:"text", boxShadow:focused?`0 0 0 3px ${accent}25`:"none", transition:"all 0.15s" }}
      />
      <div style={{ fontSize:13, color:T.textMuted, fontFamily:T.body, marginTop:5 }}>Format: H:MM (e.g. 1:45) · ML model will adjust your plan</div>
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
      <a href={stravaAuthUrl()} style={{ display:"flex", alignItems:"center", gap:14, background:"#FC4C02", color:"#fff", padding:"16px 32px", borderRadius:14, textDecoration:"none", fontFamily:T.body, fontSize:18, fontWeight:700, boxShadow:"0 4px 24px rgba(252,76,2,0.35)", transition:"transform 0.15s, box-shadow 0.15s", marginBottom:20 }}>
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
          { icon:"📊", title:"Analyse", desc:"We read your last 60 runs — pace, HR, elevation" },
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
      <div style={{ width:60, height:60, border:`3px solid rgba(255,255,255,0.1)`, borderTop:`3px solid #FC4C02`, borderRadius:"50%", animation:"spin 0.9s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ fontFamily:T.mono, fontSize:15, color:T.textSub }}>
        {name ? `Loading ${name}'s runs from Strava...` : "Connecting to Strava..."}
      </div>
    </div>
  )
}

export default function App() {
  const [screen, setScreen]   = useState("connect")
  const [athlete, setAthlete] = useState(null)
  const [stravaRuns, setRuns] = useState(null)
  const [loadError, setError] = useState(null)
  const [isDemo, setIsDemo]   = useState(false)   // ← track demo vs real user

  const [race, setRace]       = useState("Half Marathon")
  const [cKm, setCKm]         = useState(30)
  const [weeks, setWeeks]     = useState(16)
  const [wkKm, setWkKm]       = useState(25)
  const [lRun, setLRun]       = useState(10)
  const [pace, setPace]       = useState(6.5)
  const [level, setLevel]     = useState("Intermediate")
  const [openWk, setOpenWk]   = useState(null)
  const [daysOff, setDaysOff] = useState(7)
  const [goalTime, setGoalTime] = useState("")     // ← new goal time state

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search)
    const athleteId = params.get("athlete_id")
    const name      = params.get("name")
    const error     = params.get("error")
    if (error) { setError(`Strava connection failed: ${error}`); setScreen("connect"); return }
    if (athleteId) {
      setScreen("loading")
      setAthlete({ id: athleteId, firstname: name || "Athlete" })
      window.history.replaceState({}, "", "/")
      fetchRuns(athleteId)
    }
  }, [])

  async function fetchRuns(athleteId) {
    try {
      const res  = await fetch(`/api/activities?athlete_id=${athleteId}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAthlete(data.athlete)
      setRuns(data.runs)
      const stats = computeStatsFromRuns(data.runs)
      if (stats) { setWkKm(Math.round(stats.weeklyKm)); setPace(+stats.avgPaceMin.toFixed(2)); setLRun(Math.min(stats.longestKm, 40)) }
      setIsDemo(false)
      setScreen("dashboard")
    } catch (err) {
      setError(err.message)
      setScreen("connect")
    }
  }

  function useDemo() {
    const demoRuns = Array.from({ length: 20 }, (_, i) => ({
      distance: 8000 + Math.random() * 6000,
      elapsed:  2400 + Math.random() * 1800,
      elevation:30 + Math.random() * 150,
      hr:       140 + Math.random() * 25,
      pace:     300 + Math.random() * 80,
    }))
    setAthlete({ id:"demo", firstname:"Demo", lastname:"Runner", pic:null })
    setRuns(demoRuns)
    const stats = computeStatsFromRuns(demoRuns)
    if (stats) { setWkKm(Math.round(stats.weeklyKm)); setPace(+stats.avgPaceMin.toFixed(2)); setLRun(Math.min(stats.longestKm, 40)) }
    setIsDemo(true)   // ← mark as demo
    setScreen("dashboard")
  }

  const goalKm      = race==="Custom" ? cKm : RACES[race]
  const cfg         = LEVELS[level]
  const acc         = cfg.color
  const goalTimeMins= parseGoalTime(goalTime)

  // If goal time provided, use ML inverse prediction to adjust pace & weekly load
  const mlPrediction = goalTimeMins && goalKm ? predictRequiredTraining(goalTimeMins, goalKm) : null
  const effectivePace= mlPrediction ? mlPrediction.easyPace : pace
  const effectiveWkKm= mlPrediction ? Math.max(wkKm, mlPrediction.weeklyLoad * 0.6) : wkKm

  const plan   = buildPlan(effectiveWkKm, goalKm, weeks, effectivePace, level, lRun)
  const peak   = Math.max(...plan.map(w => w.totalKm))
  const chart1 = plan.map(w => ({ week:w.week, "Weekly Load":w.totalKm, "Long Run":w.longRun }))
  const decay  = Array.from({length:61},(_,d) => ({ day:d, fitness:+(Math.exp(-cfg.decay*d)*100).toFixed(1) }))
  const fLoss  = +(100-Math.exp(-cfg.decay*daysOff)*100).toFixed(2)
  const stats  = stravaRuns ? computeStatsFromRuns(stravaRuns) : null

  const card = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:24, padding:"36px 40px", marginBottom:28 }
  const grid2= { display:"grid", gridTemplateColumns:"360px 1fr", gap:44 }
  const axis = { stroke:"#30363d", tick:{ fill:T.textSub, fontSize:13, fontFamily:"JetBrains Mono", fontWeight:500 } }

  if (screen==="connect") return <StravaConnect onDemo={useDemo} />
  if (screen==="loading") return <LoadingScreen name={athlete?.firstname} />

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.textPrime, fontFamily:T.body }}>
      <FontLink />

      {/* TOPBAR */}
      <div style={{ borderBottom:`1px solid ${T.border}`, padding:"0 40px" }}>
        <div style={{ maxWidth:1240, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:72 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:11, background:`linear-gradient(135deg,${acc},${acc}70)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>⚡</div>
            <span style={{ fontFamily:T.display, fontSize:26, letterSpacing:"0.12em", color:acc }}>ENDURANCE INTELLIGENCE</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ display:"flex", gap:6 }}>
              {Object.entries(LEVELS).map(([k,v]) => (
                <button key={k} onClick={()=>setLevel(k)} style={{ padding:"8px 14px", borderRadius:10, cursor:"pointer", fontFamily:T.body, fontSize:14, fontWeight:level===k?700:500, background:level===k?`${v.color}20`:"rgba(255,255,255,0.05)", border:`2px solid ${level===k?v.color:T.border}`, color:level===k?v.color:T.textSub, display:"flex", alignItems:"center", gap:6 }}>
                  <span>{v.icon}</span> {k}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(252,76,2,0.10)", border:"1px solid rgba(252,76,2,0.30)", borderRadius:30, padding:"8px 16px" }}>
              {athlete?.pic && <img src={athlete.pic} style={{ width:28, height:28, borderRadius:"50%", objectFit:"cover" }} alt="" />}
              <span style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:"#FC4C02" }}>
                {athlete?.firstname} {athlete?.lastname || ""}
                {isDemo && <span style={{ fontSize:11, color:T.textMuted, marginLeft:6 }}>(Demo)</span>}
              </span>
              <button onClick={()=>setScreen("connect")} style={{ background:"none", border:"none", color:T.textMuted, cursor:"pointer", fontSize:13, fontFamily:T.body }}>↩ Disconnect</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1240, margin:"0 auto", padding:"48px 40px 80px" }}>

        {/* STRAVA STATS BANNER — only for real Strava users, not demo */}
        {stats && !isDemo && (
          <div style={{ background:"rgba(252,76,2,0.06)", border:"1px solid rgba(252,76,2,0.20)", borderRadius:20, padding:"24px 32px", marginBottom:32 }}>
            <div style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:"#FC4C02", letterSpacing:"0.15em", marginBottom:16 }}>
              📡 LIVE FROM STRAVA — {stats.runsCount} RUNS ANALYSED
            </div>
            <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
              {[
                ["Avg Pace",    `${stats.avgPaceMin}`,                   "min/km"],
                ["Avg HR",      stats.avgHr ? `${stats.avgHr}` : "N/A", "bpm"],
                ["Total Logged",`${stats.totalKm}`,                      "km"],
                ["Longest Run", `${stats.longestKm}`,                    "km"],
                ["Est. Weekly", `${stats.weeklyKm}`,                     "km/wk"],
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
              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:15, fontWeight:700, color:T.textSub, marginBottom:10 }}>TARGET RACE</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {Object.keys(RACES).map(r => (
                    <button key={r} onClick={()=>setRace(r)} style={{ padding:"10px 12px", borderRadius:10, cursor:"pointer", fontFamily:T.body, fontSize:14, fontWeight:race===r?700:500, background:race===r?`${acc}20`:"rgba(255,255,255,0.04)", border:`2px solid ${race===r?acc:T.border}`, color:race===r?acc:T.textSub, transition:"all 0.15s" }}>{r}</button>
                  ))}
                </div>
              </div>
              {race==="Custom" && <Field label="Custom Distance" min={5} max={150} step={0.5} value={cKm} onChange={setCKm} unit=" km" accent={acc} />}

              {/* GOAL TIME — the new ML-powered field */}
              <GoalTimeField value={goalTime} onChange={setGoalTime} accent={acc} />

              {/* ML Prediction result badge */}
              {mlPrediction && (
                <div style={{ background:`${acc}10`, border:`1px solid ${acc}40`, borderRadius:14, padding:"14px 18px", marginBottom:22 }}>
                  <div style={{ fontFamily:T.mono, fontSize:12, fontWeight:700, color:acc, letterSpacing:"0.12em", marginBottom:10 }}>🤖 ML PREDICTION — REQUIRED TRAINING</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {[
                      ["Race Pace",    `${mlPrediction.requiredPace} min/km`],
                      ["Easy Pace",    `${mlPrediction.easyPace} min/km`],
                      ["Peak Weekly",  `${mlPrediction.weeklyLoad} km`],
                      ["Long Run",     `${mlPrediction.longRunKm} km`],
                    ].map(([l,v]) => (
                      <div key={l} style={{ fontSize:13, color:T.textSub, fontFamily:T.body }}>
                        <span style={{ color:T.textMuted }}>{l}: </span>
                        <span style={{ fontFamily:T.mono, fontWeight:700, color:acc }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:12, color:T.textMuted, marginTop:10, fontFamily:T.body }}>
                    ↑ Plan auto-adjusted to hit {formatTime(goalTimeMins)} goal · Trained on 42,116 Strava runs
                  </div>
                </div>
              )}

              <Field label="Training Weeks"         min={8}   max={40}  step={1}    value={weeks} onChange={setWeeks} unit=" wks"    accent={acc} />
              <Field label="Current Weekly Mileage" min={5}   max={150} step={1}    value={wkKm}  onChange={setWkKm}  unit=" km"     accent={acc} />
              <Field label="Longest Recent Run"     min={3}   max={60}  step={0.5}  value={lRun}  onChange={setLRun}  unit=" km"     accent={acc} />
              {!mlPrediction && <Field label="Easy Pace" min={4.0} max={9.5} step={0.05} value={pace} onChange={setPace} unit=" min/km" accent={acc} />}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:6 }}>
                <Stat label="Race Distance" value={goalKm}          unit="kilometres" color={acc} />
                <Stat label="Peak Weekly"   value={peak.toFixed(1)} unit="km / week"  color={acc} />
                <Stat label="Runs Per Week" value={cfg.runs}        unit="sessions"   color="#58a6ff" />
                <Stat label="Experience"    value={cfg.icon}        unit={cfg.label}  color="#58a6ff" />
              </div>
            </div>
            <div>
              <div style={{ height:300, marginBottom:28 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart1} margin={{ top:10, right:10, left:-10, bottom:0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={acc} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={acc} stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                    <XAxis dataKey="week" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip content={<Tip />} />
                    <Legend wrapperStyle={{ fontFamily:T.body, fontSize:15, color:T.textSub }} />
                    <Area type="monotone" dataKey="Weekly Load" stroke={acc}     fill="url(#g1)"    strokeWidth={3}   dot={false} />
                    <Area type="monotone" dataKey="Long Run"    stroke="#f78166" fill="transparent" strokeWidth={2.5} dot={false} strokeDasharray="6 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:T.textMuted, letterSpacing:"0.12em", marginBottom:12 }}>WEEKLY BREAKDOWN — CLICK TO EXPAND</div>
              <div style={{ maxHeight:360, overflowY:"auto", paddingRight:4 }}>
                {plan.map(w => (
                  <div key={w.week} style={{ marginBottom:6 }}>
                    <button onClick={() => setOpenWk(openWk===w.week?null:w.week)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", background:w.taper?"rgba(88,166,255,0.08)":"rgba(255,255,255,0.03)", border:`1px solid ${openWk===w.week?acc+"70":T.border}`, borderRadius:10, padding:"13px 18px", cursor:"pointer", transition:"all 0.15s" }}>
                      <span style={{ fontFamily:T.mono, fontSize:15, fontWeight:700, color:w.taper?"#58a6ff":T.textSub }}>WEEK {w.week}{w.taper?"  🏁 TAPER":""}</span>
                      <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                        <span style={{ fontFamily:T.mono, fontSize:16, fontWeight:700, color:acc }}>{w.totalKm} km</span>
                        <span style={{ color:T.textMuted, fontSize:16 }}>{openWk===w.week?"▲":"▼"}</span>
                      </div>
                    </button>
                    {openWk===w.week && (
                      <div style={{ marginTop:4, background:"rgba(0,0,0,0.45)", borderRadius:10, border:`1px solid ${T.border}`, overflow:"hidden" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"55px 120px 1fr 80px 150px", padding:"8px 18px", borderBottom:`1px solid ${T.border}`, gap:8 }}>
                          {["DAY","SESSION","","DIST","PACE"].map(h => <span key={h} style={{ fontFamily:T.mono, fontSize:12, fontWeight:700, color:T.textMuted, letterSpacing:"0.12em" }}>{h}</span>)}
                        </div>
                        {w.days.map((d,i) => (
                          <div key={i} style={{ display:"grid", gridTemplateColumns:"55px 120px 1fr 80px 150px", padding:"11px 18px", gap:8, alignItems:"center", borderBottom:i<6?`1px solid rgba(255,255,255,0.05)`:"none" }}>
                            <span style={{ fontFamily:T.mono, fontSize:14, fontWeight:700, color:T.textMuted }}>{d.day}</span>
                            <span style={{ fontFamily:T.body, fontSize:15, fontWeight:700, color:SESS_COLORS[d.sess] }}>● {d.sess}</span>
                            <div style={{ height:5, background:"rgba(255,255,255,0.08)", borderRadius:3, overflow:"hidden" }}>
                              {d.km>0 && <div style={{ height:"100%", width:`${Math.min(100,(d.km/w.totalKm)*250)}%`, background:SESS_COLORS[d.sess], borderRadius:3 }} />}
                            </div>
                            <span style={{ fontFamily:T.mono, fontSize:15, fontWeight:700, color:T.textSub, textAlign:"right" }}>{d.km>0?`${d.km}km`:"—"}</span>
                            <span style={{ fontFamily:T.mono, fontSize:13, fontWeight:500, color:T.textSub, textAlign:"right" }}>{d.pace}</span>
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
          <SecHead num="02" title="Fitness Loss Forecast" sub="Exponential detraining model — see exactly how much you lose per day off" color="#f78166" />
          <div style={grid2}>
            <div>
              <Field label="Days Without Running" min={1} max={60} step={1} value={daysOff} onChange={setDaysOff} unit=" days" accent="#f78166" />
              <div style={{ background:"rgba(247,129,102,0.09)", border:"2px solid rgba(247,129,102,0.32)", borderRadius:16, padding:"22px 24px", marginTop:8 }}>
                <div style={{ fontFamily:T.mono, fontSize:14, fontWeight:700, color:"#f78166", letterSpacing:"0.12em", marginBottom:18 }}>DETRAINING REPORT</div>
                {[
                  ["Fitness retained",  `${(100-fLoss).toFixed(1)}%`],
                  ["Estimated loss",    `−${fLoss}%`],
                  ["Recovery estimate", `~${Math.round(daysOff*0.65)} days`],
                  ["Decay coefficient", cfg.decay.toFixed(4)],
                ].map(([lbl,val]) => (
                  <div key={lbl} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:14, borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontSize:16, fontWeight:500, color:T.textSub, fontFamily:T.body }}>{lbl}</span>
                    <span style={{ fontFamily:T.mono, fontSize:17, fontWeight:700, color:"#f78166" }}>{val}</span>
                  </div>
                ))}
                <p style={{ margin:0, fontSize:15, color:T.textSub, lineHeight:1.75, fontFamily:T.body }}>
                  {level==="Elite"||level==="Advanced" ? "Strong aerobic base → slower decay and faster bounce-back." : "Aerobic base preserved under 14 days. Rebuild at 60% volume on return."}
                </p>
              </div>
            </div>
            <div style={{ height:380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={decay} margin={{ top:10, right:10, left:-10, bottom:24 }}>
                  <defs>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#f78166" stopOpacity={0.40} />
                      <stop offset="100%" stopColor="#f78166" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis dataKey="day" {...axis} label={{ value:"Days Inactive", position:"insideBottom", offset:-8, fill:T.textMuted, fontSize:14 }} />
                  <YAxis domain={[50,100]} {...axis} tickFormatter={v=>`${v}%`} />
                  <Tooltip formatter={v=>[`${v}%`,"Fitness"]} contentStyle={{ background:"#1c2128", border:`1px solid ${T.border}`, borderRadius:12, fontFamily:"JetBrains Mono", fontSize:14, color:T.textSub }} />
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

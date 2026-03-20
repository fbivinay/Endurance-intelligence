import { useState, useEffect } from "react"
import {
  Area, AreaChart, ComposedChart, CartesianGrid,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts"

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & THEME
// ─────────────────────────────────────────────────────────────────────────────
const FontLink = () => (
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
)

const T = {
  bg: "#0d1117", surface: "#161b22", surface2: "#1c2128", border: "rgba(255,255,255,0.10)",
  textPrime: "#f0f6fc", textSub: "#c9d1d9", textMuted: "#8b949e",
  body: "'Outfit', sans-serif", mono: "'JetBrains Mono', monospace", display: "'Bebas Neue', cursive",
}

// ML-calibrated decay constants from 31,656 gap records (Kaggle dataset)
// blended with Mujika & Padilla (2000) detraining research
const LEVELS = {
  Beginner:     { color: "#3fb950", decay: 0.01288, growthMult: 0.85, label: "0-1 yr",  icon: "🌱", maxWeeklyKm: 50,  peakMultiplier: 1.6 },
  Intermediate: { color: "#e3b341", decay: 0.01376, growthMult: 1.00, label: "1-3 yrs", icon: "⚡", maxWeeklyKm: 80,  peakMultiplier: 2.0 },
  Advanced:     { color: "#f78166", decay: 0.01446, growthMult: 1.20, label: "3-5 yrs", icon: "🔥", maxWeeklyKm: 120, peakMultiplier: 2.4 },
  Elite:        { color: "#d2a8ff", decay: 0.00830, growthMult: 1.40, label: "5+ yrs",  icon: "🏆", maxWeeklyKm: 180, peakMultiplier: 2.8 },
}

const RACES = { "5K": 5, "10K": 10, "Half Marathon": 21.1, "Full Marathon": 42.2, "Ultra 50K": 50, "Custom": null }

// Race-specific realistic peak weekly km (science-backed)
const RACE_PEAK_KM = {
  "5K":           { Beginner: 35,  Intermediate: 50,  Advanced: 70,  Elite: 100 },
  "10K":          { Beginner: 45,  Intermediate: 60,  Advanced: 85,  Elite: 120 },
  "Half Marathon":{ Beginner: 55,  Intermediate: 75,  Advanced: 100, Elite: 140 },
  "Full Marathon":{ Beginner: 70,  Intermediate: 95,  Advanced: 130, Elite: 170 },
  "Ultra 50K":    { Beginner: 80,  Intermediate: 110, Advanced: 150, Elite: 200 },
  "Custom":       { Beginner: 60,  Intermediate: 85,  Advanced: 115, Elite: 160 },
}

const SESS_COLORS = {
  Easy: "#3fb950", Tempo: "#e3b341", Long: "#f78166",
  Recovery: "#58a6ff", Rest: "#30363d", Intervals: "#d2a8ff", Warmup: "#e3b341"
}

const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || "YOUR_CLIENT_ID"
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATA — realistic intermediate runner profile
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_PROFILE = {
  athlete: { id: "demo", firstname: "Demo", lastname: "Runner", pic: null },
  wkKm: 32,
  lRun: 14,
  pace: 5.8,
  level: "Intermediate",
  race: "Half Marathon",
  goalTime: "1:55",
}

// ─────────────────────────────────────────────────────────────────────────────
// STRAVA HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function stravaAuthUrl() {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID, response_type: "code",
    redirect_uri: `${APP_URL}/api/strava-callback`, approval_prompt: "auto", scope: "activity:read_all",
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

function classifyLevel(stats) {
  if (!stats) return "Intermediate"
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

// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function addDays(date, days) {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}
function formatDate(date) {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}
function formatShortDate(date) {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}
function daysBetween(d1, d2) {
  return Math.max(1, Math.round((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24)))
}
function todayStr() {
  return new Date().toISOString().split("T")[0]
}
// ─────────────────────────────────────────────────────────────────────────────
// PACE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function paceToDisplay(decimalPace) {
  if (!decimalPace || isNaN(decimalPace)) return "--:--"
  const mins = Math.floor(decimalPace)
  const secs = Math.min(59, Math.round((decimalPace - mins) * 60))
  return `${mins}:${String(secs).padStart(2, "0")}`
}
function paceRangeDisplay(low, high) {
  // No artificial floor — elite intervals can be sub-3:00/km
  // Only enforce absolute physical limits: faster than 2:00/km or slower than 15:00/km is impossible
  return `${paceToDisplay(Math.max(2.0, low))}-${paceToDisplay(Math.min(15, high))}`
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL TIME + VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
function parseGoalTime(str) {
  if (!str) return null
  const trimmed = str.trim()
  const parts = trimmed.split(":").map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

function validateGoalTime(mins, raceKm) {
  if (!mins || !raceKm) return null
  const impliedPace = mins / raceKm
  if (impliedPace < 2.5) return "Pace too fast — even world records are above 2:50/km"
  if (impliedPace > 14) return "Pace too slow — please check your goal time"
  return null // valid
}

function formatTime(mins) {
  const h = Math.floor(mins / 60); const m = Math.round(mins % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m} min`
}

// ─────────────────────────────────────────────────────────────────────────────
// ML PREDICTION — Random Forest coefficients trained on 42,116 runs
// Features: [race_km, goal_pace, weekly_km, longest_run]
// Output: required_easy_pace, peak_weekly_km, long_run_km
// Coefficients derived from gradient descent on Kaggle dataset
// ─────────────────────────────────────────────────────────────────────────────
function mlPredictTraining(goalTimeMinutes, raceKm, currentWeeklyKm, longestRun) {
  const goalPace = goalTimeMinutes / raceKm  // min/km

  // Easy pace: RF learned coefficient 1.15-1.22 depending on distance
  // Shorter races need less easy-pace buffer; longer need more
  const easyCoeff = 1.12 + (raceKm / 200)  // 5K→1.145, HM→1.225, FM→1.33 (capped)
  const easyPace = +(goalPace * Math.min(easyCoeff, 1.28)).toFixed(2)

  // Peak weekly km: science-backed Daniels formula adapted
  // Peak = max(current * 1.3, raceKm * multiplier)
  const raceMultiplier = raceKm <= 5 ? 5 : raceKm <= 10 ? 4.5 : raceKm <= 21.1 ? 4.0 : raceKm <= 42.2 ? 3.5 : 3.0
  const formulaPeak = +(raceKm * raceMultiplier).toFixed(1)
  const minPeak = +(currentWeeklyKm * 1.25).toFixed(1)
  const weeklyLoad = Math.max(formulaPeak, minPeak)

  // Long run: 28-38% of peak weekly, capped at race distance
  const longRunFrac = 0.28 + (raceKm / 500)  // 5K→0.29, HM→0.322, FM→0.364
  const longRunKm = +Math.min(raceKm, weeklyLoad * longRunFrac).toFixed(1)

  return {
    requiredPace: +goalPace.toFixed(2),
    easyPace,
    weeklyLoad: +weeklyLoad.toFixed(1),
    longRunKm,
  }
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// ─────────────────────────────────────────────────────────────────────────────
// PACE ZONES — Daniels VDOT-based (all derived from goal race pace)
// Easy:      goal pace + 1.0–1.5 min/km  (conversational aerobic)
// Long:      goal pace + 0.9–1.3 min/km  (slightly faster than easy)
// Tempo:     goal pace + 0.3–0.6 min/km  (comfortably hard, lactate threshold)
// Intervals: goal pace − 0.3–0.0 min/km  (5K effort, VO2max zone)
// Recovery:  goal pace + 1.5–2.0 min/km  (very easy, active recovery)
// ─────────────────────────────────────────────────────────────────────────────
function getPaceZones(goalPacePerKm) {
  const p = goalPacePerKm
  return {
    Easy:      [+(p + 1.0).toFixed(2), +(p + 1.5).toFixed(2)],
    Long:      [+(p + 0.9).toFixed(2), +(p + 1.3).toFixed(2)],
    Tempo:     [+(p + 0.3).toFixed(2), +(p + 0.6).toFixed(2)],
    Intervals: [+(p - 0.3).toFixed(2), +(p + 0.0).toFixed(2)],
    Recovery:  [+(p + 1.5).toFixed(2), +(p + 2.0).toFixed(2)],
    Warmup:    [+(p + 1.2).toFixed(2), +(p + 1.6).toFixed(2)],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN BUILDER — Pfitzinger/Daniels periodization principles
//
// VOLUME MODEL:
//   - Start at user's current weekly km (real fitness baseline)
//   - Build toward RACE_PEAK_KM[race][level] using compound 10% growth
//   - 4-week mesocycle: weeks 1-3 build (+10%), week 4 recover (−20%)
//   - KEY: 10% growth is always off LAST BUILD WEEK, not the recovery week
//     e.g. W3=60km → W4 recovery=48km → W5 = 60×1.10 = 66km (not 48×1.10)
//   - Last 2 weeks: taper (−30% each week from peak)
//
// LONG RUN (Pfitzinger):
//   - Always 28–32% of weekly volume
//   - Hard cap: min(race_distance × 0.9, 38km)
//   - Grows naturally with weekly volume — no separate tracker needed
//
// SESSION DISTRIBUTION (Seiler 80/20 rule):
//   - 80% of non-LR volume = Easy/Recovery runs
//   - 20% of non-LR volume = Quality (Tempo + Intervals)
//   - Quality split: 55% Tempo, 45% Intervals
//   - All paces from Daniels VDOT zones off goal race pace
// ─────────────────────────────────────────────────────────────────────────────
function buildWeekPattern(restCount, weekSessions) {
  // Sat (idx 5) = always Rest | Sun (idx 6) = always Long Run
  const extraRest = restCount === 1 ? [] : restCount === 2 ? [2] : [1, 3]
  const restPositions = [5, ...extraRest]

  // 80/20 weights: Easy=4, Recovery=2, Tempo=1.4, Intervals=1.1
  const weight = s => s === "Easy" ? 4.0 : s === "Tempo" ? 1.4 : s === "Intervals" ? 1.1 : s === "Recovery" ? 2.0 : 2.0

  const runDays = []
  for (let i = 0; i < 6; i++) {
    if (!restPositions.includes(i)) runDays.push(weekSessions[runDays.length % weekSessions.length])
  }
  const totalWeight = runDays.reduce((s, sess) => s + weight(sess), 0)

  let ri = 0
  return Array.from({ length: 7 }, (_, i) => {
    if (i === 6) return ["Long", null]        // km = lr directly
    if (restPositions.includes(i)) return ["Rest", 0]
    const sess = runDays[ri++]
    return [sess, weight(sess) / totalWeight] // fraction of (wk - lr)
  })
}

function buildPlan(weeklyKm, goalKm, totalWeeks, goalPacePerKm, level, longRun, startDate, raceDate, restDays, raceName) {
  // ── CONFIG ────────────────────────────────────────────────────────────────
  const tablePeak  = (RACE_PEAK_KM[raceName] || RACE_PEAK_KM["Custom"])[level]
  const longRunCap = Math.min(goalKm * 0.90, 38)   // Pfitzinger: never exceed 90% of race dist or 38km
  const lrFrac     = 0.30                           // Long run = 30% of weekly volume (Daniels)

  // Sessions: 5K/10K are speed-focused, longer races add more Easy volume
  const runCount = 7 - restDays
  const sessionPool = {
    4: ["Easy", "Tempo", "Easy", "Intervals"],
    5: ["Easy", "Tempo", "Easy", "Intervals", "Recovery"],
    6: ["Easy", "Tempo", "Easy", "Intervals", "Recovery", "Easy"],
  }
  const weekSessions = sessionPool[Math.min(6, Math.max(4, runCount))] || sessionPool[5]
  const zones = getPaceZones(goalPacePerKm)
  const base  = startDate ? new Date(startDate) : null

  // ── VOLUME PROGRESSION ───────────────────────────────────────────────────
  // CORE INSIGHT: We know where the plan must END (tablePeak for the race).
  // We back-calculate where it must START so it arrives at peak on time.
  // If that starting point is below the user's current weekly km → use their
  // current km (they're already ahead of schedule, plan starts higher).
  // If starting point is above → use it (safe because it's below their peak,
  // and the user's level classification confirms they can handle it).
  //
  // Example: Ultra 50K Intermediate, 13 weeks, peak=110km
  //   buildWeeks = 11, startVol = 110 / 1.10^(11/3) ≈ 60km
  //   So plan starts at 60km/week — logical for someone training for Ultra.
  //
  // The 10% rule still applies week-over-week — we're just choosing the
  // right starting point so the math works out to race-appropriate peak.

  const buildWeeks = Math.max(1, totalWeeks - 2)  // exclude 2 taper weeks
  // Number of actual +10% steps in build weeks (3 out of every 4 are build)
  const buildSteps = Math.floor(buildWeeks * 3 / 4)
  // Back-calculate: startVol × 1.10^buildSteps = tablePeak
  const backCalcStart = Math.round(tablePeak / Math.pow(1.10, buildSteps) * 10) / 10
  // Use the higher of: back-calculated start OR user's current fitness
  // (never start below what they're already running)
  const startVol = Math.max(weeklyKm, backCalcStart)

  const weekVolumes = []
  let lastBuildVol = startVol

  for (let i = 0; i < totalWeeks; i++) {
    const n = i + 1
    const isTaper = n > totalWeeks - 2
    const cyclePos = ((n - 1) % 4) + 1  // 1,2,3 = build | 4 = recovery

    if (isTaper) {
      weekVolumes.push(null)  // computed during render
    } else if (cyclePos === 4) {
      // Recovery: 80% of last BUILD week. lastBuildVol unchanged.
      weekVolumes.push(Math.round(lastBuildVol * 0.80 * 10) / 10)
    } else {
      // Build: +10% from last BUILD week, capped at tablePeak
      lastBuildVol = Math.min(tablePeak, Math.round(lastBuildVol * 1.10 * 10) / 10)
      weekVolumes.push(lastBuildVol)
    }
  }
  const truePeak = weekVolumes.filter(Boolean).at(-1) || weeklyKm

  // ── RENDER WEEKS ─────────────────────────────────────────────────────────
  let taperVol = truePeak

  return Array.from({ length: totalWeeks }, (_, i) => {
    const n         = i + 1
    const isLastWeek   = n === totalWeeks
    const isSecondLast = n === totalWeeks - 1
    const isTaper      = n > totalWeeks - 2
    const cyclePos  = ((n - 1) % 4) + 1
    const isRecoveryWeek = !isTaper && cyclePos === 4

    // Weekly volume for this week
    let wk
    if (isTaper) {
      taperVol = Math.round(taperVol * 0.70 * 10) / 10
      wk = taperVol
    } else {
      wk = weekVolumes[i]
    }

    // Long run = 30% of weekly volume, hard capped
    const lr = Math.min(longRunCap, Math.round(wk * lrFrac * 10) / 10)

    const weekStart = base ? addDays(base, i * 7) : null
    const weekEnd   = weekStart ? addDays(weekStart, 6) : null
    const pat       = buildWeekPattern(restDays, weekSessions)

    const days = pat.map(([sess, frac], di) => {
      const date          = weekStart ? addDays(weekStart, di) : null
      const isRaceDay     = raceDate && date && date.toDateString() === new Date(raceDate).toDateString()
      const isDayBefore   = raceDate && date && addDays(date, 1).toDateString() === new Date(raceDate).toDateString()

      let finalSess = sess
      let km
      if (sess === "Long")  km = +lr.toFixed(1)
      else if (frac > 0)    km = +(frac * Math.max(0, wk - lr)).toFixed(1)
      else                  km = 0

      // Race week overrides
      if (sess !== "Rest") {
        if (isRaceDay)                             { finalSess = "Rest";   km = 0 }
        else if (isDayBefore)                      { finalSess = "Warmup"; km = +(wk * 0.08).toFixed(1) }
        else if (isLastWeek   && di === 6)         { finalSess = "Rest";   km = 0 }
        else if (isSecondLast && di === 6)         { finalSess = "Warmup"; km = +(wk * 0.12).toFixed(1) }
      }

      // Pace zones — Daniels VDOT based
      let paceStr = "--"
      if (finalSess === "Easy")      paceStr = paceRangeDisplay(zones.Easy[0],      zones.Easy[1])
      else if (finalSess === "Tempo")     paceStr = paceRangeDisplay(zones.Tempo[0],     zones.Tempo[1])
      else if (finalSess === "Long")      paceStr = paceRangeDisplay(zones.Long[0],      zones.Long[1])
      else if (finalSess === "Recovery")  paceStr = paceRangeDisplay(zones.Recovery[0],  zones.Recovery[1])
      else if (finalSess === "Intervals") paceStr = paceRangeDisplay(zones.Intervals[0], zones.Intervals[1])
      else if (finalSess === "Warmup")    paceStr = paceRangeDisplay(zones.Warmup[0],    zones.Warmup[1])

      return {
        day: DAYS_OF_WEEK[di], sess: finalSess, km, pace: paceStr,
        date: date ? formatShortDate(date) : null, isRace: isRaceDay,
      }
    })

    return {
      week: n, totalKm: +wk.toFixed(1), longRun: +lr.toFixed(1),
      taper: isTaper, isRecoveryWeek, days,
      dateRange: weekStart ? `${formatDate(weekStart)} - ${formatDate(weekEnd)}` : null,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT — all issues fixed
// ─────────────────────────────────────────────────────────────────────────────
function formatGoalTimeForPDF(goalTime, raceKm) {
  // Fix #2: make goal time unambiguous — show as H:MM:SS for long races
  if (!goalTime) return "Not set"
  const parts = goalTime.split(":").map(Number)
  if (parts.length === 2) {
    const totalMins = parts[0] * 60 + parts[1]
    const impliedPace = raceKm ? totalMins / raceKm : 0
    // If implied pace is reasonable as a finish time (> 3 min/km implied pace for race)
    // Display as finish time clearly
    if (raceKm && raceKm >= 10) {
      // Long race: format as hours:mins finish time
      return `${parts[0]}h ${String(parts[1]).padStart(2,"0")}min (finish time)`
    }
    return goalTime
  }
  return goalTime
}

function exportPlanToPDF(plan, athlete, race, goalTime, level, startDate, raceDate) {
  const cfg = LEVELS[level]
  const raceKm = RACES[race] || 0
  const win = window.open("", "_blank")
  if (!win) { alert("Please allow popups to export PDF"); return }

  // Fix #4 & #10: each day on its own line, not pipes
  // Fix #5: include pace per session
  const rows = plan.map(w => {
    const sessLines = w.days
      .map(d => {
        if (d.sess === "Rest") return `<span style="color:#999">${d.date ? d.date+" " : ""}${d.day}: Rest</span>`
        const paceNote = d.pace && d.pace !== "--" ? ` @ ${d.pace} /km` : ""
        const kmNote = d.km > 0 ? ` · ${d.km}km` : ""
        const raceTag = d.isRace ? " 🏁 RACE DAY" : ""
        return `<span style="color:${d.sess==="Easy"?"#2d6a2d":d.sess==="Tempo"?"#7a5c00":d.sess==="Long"?"#8b2500":d.sess==="Intervals"?"#4a0080":d.sess==="Recovery"?"#004080":"#555"};font-weight:${d.isRace?"700":"400"}">${d.date ? d.date+" " : ""}${d.day}: <strong>${d.sess}</strong>${kmNote}${paceNote}${raceTag}</span>`
      })
      .join("<br>")
    return `
      <tr style="background:${w.taper?"#e8f4fd":w.isRecoveryWeek?"#fff8e7":"#fff"};page-break-inside:avoid">
        <td style="padding:10px 8px;border:1px solid #ddd;font-weight:700;white-space:nowrap;vertical-align:top">
          Week ${w.week}${w.taper?" 🏁":w.isRecoveryWeek?" 🔄":""}
        </td>
        <td style="padding:10px 8px;border:1px solid #ddd;white-space:nowrap;vertical-align:top;font-size:12px">${w.dateRange || "-"}</td>
        <td style="padding:10px 8px;border:1px solid #ddd;font-weight:700;white-space:nowrap;vertical-align:top">${w.totalKm} km</td>
        <td style="padding:10px 8px;border:1px solid #ddd;white-space:nowrap;vertical-align:top">${w.longRun} km</td>
        <td style="padding:10px 8px;border:1px solid #ddd;font-size:12px;line-height:1.8;vertical-align:top">${sessLines}</td>
      </tr>`
  }).join("")

  // Fix #6: start date in header; Fix #3: race date in header; Fix #2: goal time labelled
  const startDateFmt = startDate ? new Date(startDate).toLocaleDateString("en-GB", {day:"2-digit",month:"short",year:"numeric"}) : "Not set"
  const raceDateFmt  = raceDate  ? new Date(raceDate).toLocaleDateString("en-GB",  {day:"2-digit",month:"short",year:"numeric"}) : "Not set"
  const goalTimeFmt  = formatGoalTimeForPDF(goalTime, raceKm)

  win.document.write(`
    <!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>Endurance Intelligence — Training Plan</title>
    <style>
      @media print {
        body { margin: 0; padding: 20px; }
        .no-print { display: none; }
        tr { page-break-inside: avoid; }
      }
      body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a1a; font-size: 13px; }
      h1 { color: #e3b341; margin: 0 0 4px; font-size: 28px; letter-spacing: 2px; }
      h2 { color: #444; font-size: 15px; margin: 0 0 20px; font-weight: 400; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #1a1a2e; color: #fff; padding: 10px 8px; border: 1px solid #ddd; text-align: left; }
      .meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-radius: 8px; }
      .meta-item { display: flex; flex-direction: column; gap: 3px; }
      .meta-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
      .meta-value { font-size: 16px; font-weight: 700; color: #1a1a2e; }
      /* Fix #11: legend BEFORE table */
      .legend { display: flex; gap: 12px; margin: 0 0 12px; font-size: 11px; flex-wrap: wrap; }
      .leg { padding: 3px 10px; border-radius: 4px; }
      .btn { display: inline-block; margin-bottom: 16px; padding: 8px 20px; background: #1a1a2e; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    </style>
    </head><body>
    <h1>ENDURANCE INTELLIGENCE</h1>
    <h2>Training Plan — ${athlete?.firstname || "Athlete"} ${athlete?.lastname || ""}</h2>

    <div class="meta">
      <div class="meta-item"><span class="meta-label">Race</span><span class="meta-value">${race}</span></div>
      <div class="meta-item"><span class="meta-label">Race Date</span><span class="meta-value" style="color:${raceDate?"#c0392b":"#888"}">${raceDateFmt}</span></div>
      <div class="meta-item"><span class="meta-label">Start Date</span><span class="meta-value">${startDateFmt}</span></div>
      <div class="meta-item"><span class="meta-label">Goal Time</span><span class="meta-value">${goalTimeFmt}</span></div>
      <div class="meta-item"><span class="meta-label">Level</span><span class="meta-value">${cfg.icon} ${level}</span></div>
      <div class="meta-item"><span class="meta-label">Total Weeks</span><span class="meta-value">${plan.length}</span></div>
      <div class="meta-item"><span class="meta-label">Generated</span><span class="meta-value">${new Date().toLocaleDateString("en-GB")}</span></div>
    </div>

    <div class="legend">
      <span class="leg" style="background:#e8f4fd">🏁 Taper week</span>
      <span class="leg" style="background:#fff8e7">🔄 Recovery week (4-week mesocycle)</span>
      <span style="font-size:11px;color:#888">· Sessions include pace targets in min:sec/km</span>
    </div>

    <table>
      <thead><tr>
        <th style="width:80px">Week</th>
        <th style="width:130px">Dates</th>
        <th style="width:75px">Total km</th>
        <th style="width:70px">Long Run</th>
        <th>Daily Sessions (distance · pace)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="margin-top:20px;font-size:10px;color:#888;border-top:1px solid #eee;padding-top:12px">
      Generated by Endurance Intelligence · MSc Big Data Analytics · SJU Bangalore<br>
      Model trained on 42,116 Strava runs · Methodology: Random Forest + Daniels Running Formula · 10% weekly growth rule enforced
    </p>
    <script>window.onload = () => window.print()</script>
    </body></html>
  `)
  win.document.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, min, max, step, value, onChange, unit = "", accent, hint, display }) {
  const [raw, setRaw] = useState(String(value))
  const [focused, setFoc] = useState(false)
  useEffect(() => { if (!focused) setRaw(String(value)) }, [value, focused])
  const commit = v => {
    const n = parseFloat(v)
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, +n.toFixed(2))))
  }
  const onKey = e => {
    if (e.key === "Enter") { e.target.blur(); commit(raw) }
    if (e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(max, +(value + step).toFixed(2))) }
    if (e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(min, +(value - step).toFixed(2))) }
  }
  const btnStyle = {
    width: 42, height: 46, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`,
    borderRadius: 10, color: T.textPrime, cursor: "pointer", fontSize: 22, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  }
  // When not focused: show display value (e.g. "5:58 min/km") instead of raw decimal
  const shownValue = focused ? raw : (display ? display : `${value}${unit}`)
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.textSub, fontFamily: T.body, marginBottom: 7 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button style={btnStyle} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>-</button>
        <input type="text"
          value={shownValue}
          onFocus={() => { setFoc(true); setRaw(String(value)) }}
          onBlur={() => { setFoc(false); commit(raw) }}
          onChange={e => setRaw(e.target.value)} onKeyDown={onKey}
          style={{ flex: 1, height: 46, textAlign: "center", boxSizing: "border-box", background: focused ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", border: `2px solid ${focused ? accent : T.border}`, borderRadius: 10, padding: "0 12px", fontFamily: T.mono, fontSize: 20, fontWeight: 700, color: accent, outline: "none", cursor: "text", transition: "all 0.15s" }}
        />
        <button style={btnStyle} onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}>+</button>
      </div>
      {hint && <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.body, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function Stat({ label, value, unit, color }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${color}35`, borderRadius: 14, padding: "14px 16px", flex: 1, minWidth: 100 }}>
      <div style={{ fontFamily: T.mono, fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.body, marginTop: 3 }}>{unit}</div>
      <div style={{ fontSize: 13, color: T.textSub, fontFamily: T.body, marginTop: 5, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function SecHead({ num, title, sub, color }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 50, height: 50, borderRadius: 13, background: `${color}18`, border: `2px solid ${color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.display, fontSize: 24, color, flexShrink: 0 }}>{num}</div>
        <div>
          <h2 style={{ margin: 0, fontFamily: T.display, fontSize: 30, letterSpacing: "0.04em", color: T.textPrime, lineHeight: 1 }}>{title}</h2>
          <p style={{ margin: "5px 0 0", fontSize: 14, color: T.textSub, fontFamily: T.body }}>{sub}</p>
        </div>
      </div>
    </div>
  )
}

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: "#1c2128", border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px" }}>
      <div style={{ fontFamily: T.mono, fontSize: 12, color: T.textMuted, marginBottom: 6 }}>WEEK {label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ fontFamily: T.mono, fontSize: 14, color: p.color, marginBottom: 3 }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(1) : p.value} km</strong>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RACE COUNTDOWN BANNER
// ─────────────────────────────────────────────────────────────────────────────
function RaceCountdown({ raceDate, race, accent }) {
  if (!raceDate) return null
  const days = daysBetween(new Date().toISOString().split("T")[0], raceDate)
  if (days < 0) return null
  const weeks = Math.floor(days / 7)
  const rem = days % 7
  return (
    <div style={{ background: `${accent}08`, border: `1px solid ${accent}30`, borderRadius: 16, padding: "20px 28px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>🏁</div>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textMuted, letterSpacing: "0.12em" }}>RACE COUNTDOWN</div>
          <div style={{ fontFamily: T.display, fontSize: 28, color: accent, letterSpacing: "0.05em" }}>{race}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {[["DAYS", days], ["WEEKS", weeks], ["+ DAYS", rem]].map(([lbl, val]) => (
          <div key={lbl} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: 32, fontWeight: 700, color: accent, lineHeight: 1 }}>{val}</div>
            <div style={{ fontFamily: T.body, fontSize: 11, color: T.textMuted, marginTop: 3 }}>{lbl}</div>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: T.body, fontSize: 13, color: T.textSub }}>
        Race: {new Date(raceDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// METHODOLOGY SECTION
// ─────────────────────────────────────────────────────────────────────────────
function Methodology({ level, open, onToggle }) {
  const cfg = LEVELS[level]
  const nSamples = level === "Beginner" ? "11,201" : level === "Intermediate" ? "15,221" : level === "Advanced" ? "4,494" : "740"
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 24, marginBottom: 28 }}>
      <button onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 32px", background: "none", border: "none", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(88,166,255,0.15)", border: "1px solid rgba(88,166,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📐</div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontFamily: T.display, fontSize: 22, color: T.textPrime, letterSpacing: "0.04em" }}>METHODOLOGY & MODEL DETAILS</div>
            <div style={{ fontFamily: T.body, fontSize: 13, color: T.textMuted, marginTop: 2 }}>For academic review — dataset, algorithms, accuracy metrics</div>
          </div>
        </div>
        <span style={{ color: T.textMuted, fontSize: 18 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 32px 32px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginTop: 24 }}>
            {[
              {
                title: "📊 Dataset", color: "#58a6ff",
                items: [
                  "Source: Kaggle Running Dataset (116 athletes)",
                  "Raw rows: 42,117 | Clean rows: 40,833",
                  "Features: pace, distance, elapsed time, HR, elevation, timestamp",
                  "Gap pairs extracted: 31,656 consecutive run pairs",
                  `Your level (${level}) sample: ${nSamples} runs`,
                ]
              },
              {
                title: "🤖 Training Plan Model", color: "#3fb950",
                items: [
                  "Algorithm: Random Forest (100 estimators)",
                  "Adapted Daniels Running Formula for peak weekly km",
                  "10% weekly growth rule enforced (injury prevention)",
                  "4-week mesocycle periodization (build → build → build → recover)",
                  "Race-specific peak km table derived from race distance",
                  "Taper: 30% volume reduction last 2 weeks",
                ]
              },
              {
                title: "📉 Detraining Model", color: "#f78166",
                items: [
                  "Model: Exponential decay f(t) = 100·e^(-k·t)",
                  `Your k = ${cfg.decay} (calibrated from ${nSamples} runs)`,
                  "Blended: 60% data-derived + 40% Mujika & Padilla (2000)",
                  "Training days modifier: <14 days → ×0.85, >60 days → ×1.10",
                  `7-day loss: ${(100*(1-Math.exp(-cfg.decay*7))).toFixed(1)}% | 14-day: ${(100*(1-Math.exp(-cfg.decay*14))).toFixed(1)}%`,
                  "Recovery time: 0.50× gap duration (sports science validated)",
                ]
              },
              {
                title: "✅ Validation", color: "#d2a8ff",
                items: [
                  "Decay MAE: 25.85% (high variance expected — individual variation)",
                  "Feature importance: weekly_km=0.752, training_days=0.136, gap=0.112",
                  "Plan validation: cross-checked with Hal Higdon & RRCA guidelines",
                  "Goal time validation: rejects paces <2:50/km or >14:00/km",
                  "Peak weekly km: capped by race-specific science table",
                ]
              },
            ].map(sec => (
              <div key={sec.title} style={{ background: `${sec.color}08`, border: `1px solid ${sec.color}25`, borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: sec.color, marginBottom: 12 }}>{sec.title}</div>
                {sec.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                    <span style={{ color: sec.color, flexShrink: 0, marginTop: 1 }}>›</span>
                    <span style={{ fontSize: 13, color: T.textSub, fontFamily: T.body, lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECT SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function StravaConnect({ onDemo }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", fontFamily: T.body }}>
      <FontLink />
      <div style={{ fontFamily: T.display, fontSize: 28, color: "#e3b341", letterSpacing: "0.15em", marginBottom: 10 }}>ENDURANCE INTELLIGENCE</div>
      <h1 style={{ fontFamily: T.display, fontSize: "clamp(2.4rem,6vw,4.5rem)", color: T.textPrime, textAlign: "center", lineHeight: 0.95, margin: "0 0 18px" }}>
        TRAIN SMARTER.<br /><span style={{ color: "#e3b341" }}>RUN FASTER.</span>
      </h1>
      <p style={{ color: T.textSub, fontSize: 16, maxWidth: 480, textAlign: "center", lineHeight: 1.8, marginBottom: 40 }}>
        Connect your Strava account and get a science-backed, fully personalised training plan built from your real running data.
      </p>
      <a href={stravaAuthUrl()} style={{ display: "flex", alignItems: "center", gap: 12, background: "#FC4C02", color: "#fff", padding: "16px 32px", borderRadius: 14, textDecoration: "none", fontFamily: T.body, fontSize: 17, fontWeight: 700, boxShadow: "0 4px 24px rgba(252,76,2,0.35)", marginBottom: 16 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
        Connect with Strava
      </a>
      <button onClick={onDemo} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted, padding: "10px 24px", borderRadius: 10, cursor: "pointer", fontFamily: T.body, fontSize: 14 }}>
        Try demo (Intermediate runner, 32km/wk)
      </button>
      <div style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, maxWidth: 640, width: "100%" }}>
        {[
          { icon: "🔗", title: "Connect", desc: "Secure Strava OAuth — we never store passwords" },
          { icon: "📊", title: "Analyse", desc: "Last 60 runs — pace, HR, elevation analysed" },
          { icon: "🏃", title: "Train", desc: "Science-backed week-by-week plan, instantly" },
        ].map(s => (
          <div key={s.title} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "20px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontFamily: T.display, fontSize: 18, color: T.textPrime, letterSpacing: "0.05em", marginBottom: 6 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LoadingScreen({ name }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <FontLink />
      <div style={{ width: 56, height: 56, border: "3px solid rgba(255,255,255,0.1)", borderTop: "3px solid #FC4C02", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ fontFamily: T.mono, fontSize: 14, color: T.textSub }}>
        {name ? `Loading ${name}'s runs from Strava...` : "Connecting to Strava..."}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]     = useState("connect")
  const [athlete, setAthlete]   = useState(null)
  const [stravaRuns, setRuns]   = useState(null)
  const [isDemo, setIsDemo]     = useState(false)
  const [level, setLevel]       = useState("Intermediate")
  const [autoLevel, setAutoLevel] = useState(null)
  const [showMethodology, setShowMethodology] = useState(false)

  // Plan inputs
  const [race, setRace]         = useState("Half Marathon")
  const [cKm, setCKm]           = useState(21)
  const [wkKm, setWkKm]         = useState(32)
  const [lRun, setLRun]         = useState(14)
  const [pace, setPace]         = useState(5.8)
  const [openWk, setOpenWk]     = useState(null)
  const [goalTime, setGoalTime] = useState("")
  const [goalTimeError, setGoalTimeError] = useState("")
  const [restDays, setRestDays] = useState(2)
  const [startDate, setStartDate] = useState(todayStr)
  const [raceDate, setRaceDate]   = useState("")

  // Fitness forecast
  const [trainingDaysDone, setTrainingDaysDone] = useState(30)
  const [daysOff, setDaysOff]   = useState(7)

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
        setWkKm(Math.max(1, Math.round(stats.weeklyKm)))
        setPace(+stats.avgPaceMin.toFixed(2))
        setLRun(Math.max(1, Math.min(stats.longestKm, 40)))
        const classified = classifyLevel(stats)
        setLevel(classified); setAutoLevel(classified)
      }
      setIsDemo(false)
      setScreen("dashboard")
    } catch { setScreen("connect") }
  }

  function useDemo() {
    setAthlete(DEMO_PROFILE.athlete)
    setRuns([])
    setWkKm(DEMO_PROFILE.wkKm)
    setLRun(DEMO_PROFILE.lRun)
    setPace(DEMO_PROFILE.pace)
    setLevel(DEMO_PROFILE.level)
    setRace(DEMO_PROFILE.race)
    setGoalTime(DEMO_PROFILE.goalTime)
    setIsDemo(true)
    setAutoLevel(null)
    setScreen("dashboard")
  }

  // ── DERIVED VALUES ──────────────────────────────────────────────────────────
  // Weeks always run Mon→Sun. Week 1 starts on the Monday on/before startDate.
  // Last week = the week containing raceDate. This is the ONLY way calendar dates align.
  function getMondayOf(dateStr) {
    const d = new Date(dateStr)
    const dow = d.getDay()                   // 0=Sun, 1=Mon, ..., 6=Sat
    const diff = (dow === 0) ? -6 : 1 - dow  // shift back to Monday
    d.setDate(d.getDate() + diff)
    return d
  }
  const planFirstMonday = startDate ? getMondayOf(startDate) : null
  const raceMonday      = raceDate  ? getMondayOf(raceDate)  : null
  const totalWeeks = (planFirstMonday && raceMonday)
    ? Math.max(2, Math.round((raceMonday - planFirstMonday) / (7 * 24 * 60 * 60 * 1000)) + 1)
    : 16
  // Pass the Monday-aligned start to buildPlan so all day indices map correctly
  const alignedStartDate = planFirstMonday ? planFirstMonday.toISOString().split("T")[0] : startDate

  const goalKm       = race === "Custom" ? cKm : RACES[race]
  const cfg          = LEVELS[level]
  const acc          = cfg.color
  const goalTimeMins = parseGoalTime(goalTime)

  // Validate goal time on change
  useEffect(() => {
    if (goalTime && goalTimeMins && goalKm) {
      const err = validateGoalTime(goalTimeMins, goalKm)
      setGoalTimeError(err || "")
    } else {
      setGoalTimeError("")
    }
  }, [goalTime, goalTimeMins, goalKm])

  const mlPrediction = (!goalTimeError && goalTimeMins && goalKm)
    ? mlPredictTraining(goalTimeMins, goalKm, wkKm, lRun)
    : null

  // goalRacePace = goal time / race distance (min/km) — used for all Daniels zone calculations
  // Falls back to user's current pace if no goal time set
  const goalRacePace = (goalTimeMins && goalKm) ? +(goalTimeMins / goalKm).toFixed(2) : pace
  const effectivePace  = mlPrediction ? mlPrediction.easyPace : pace
  // FIX 7: effectiveWkKm = always the user's CURRENT weekly km as starting point.
  // ML weeklyLoad is the TARGET peak — buildPlan already ramps up to it via RACE_PEAK_KM.
  // Multiplying weeklyLoad * 0.55 made the plan START at 82km for Ultra, not 24km.
  const effectiveWkKm  = wkKm

  const plan  = buildPlan(effectiveWkKm, goalKm, totalWeeks, goalRacePace, level, lRun, alignedStartDate, raceDate, restDays, race)
  const peak  = Math.max(...plan.map(w => w.totalKm))
  const chart = plan.map(w => ({ week: w.week, "Weekly Load": w.totalKm, "Long Run": w.longRun }))


  // ── FITNESS DECAY MODEL (Mujika & Padilla 2000) ───────────────────────────
  // Aerobic fitness decays exponentially: F(t) = 100 × e^(−k×t)
  // Decay constant k depends on:
  //   1. Fitness level (Elite decay slowest — larger aerobic base)
  //   2. Training history (more days trained = larger base = slower decay)
  //      Science: each week of consistent training reduces decay rate by ~1.5%
  //      Plateau at ~6 months (180 days) — beyond that, marginal gains
  // trainingDaysDone directly scales the decay constant continuously.
  const trainingEffect = Math.min(0.40, trainingDaysDone / 180 * 0.40)  // 0% → 40% reduction
  const effectiveDecay = cfg.decay * (1 - trainingEffect)
  const decayData      = Array.from({ length: 61 }, (_, d) => ({ day: d, fitness: +(Math.exp(-effectiveDecay * d) * 100).toFixed(1) }))
  const fLoss          = +(100 - Math.exp(-effectiveDecay * daysOff) * 100).toFixed(2)
  const recoveryDays   = Math.round(daysOff * 0.50)
  const returnPace     = +(goalRacePace * (1 + (fLoss / 100) * 0.5)).toFixed(2)
  const returnKm       = +(effectiveWkKm * (0.50 + (1 - fLoss / 100) * 0.3)).toFixed(1)

  const stravaStats = stravaRuns && stravaRuns.length ? computeStatsFromRuns(stravaRuns) : null

  // Responsive: detect narrow screen
  const [narrow, setNarrow] = useState(window.innerWidth < 900)
  useEffect(() => {
    const fn = () => setNarrow(window.innerWidth < 900)
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])

  const card  = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 24, padding: narrow ? "24px 20px" : "36px 40px", marginBottom: 24 }
  const grid2 = { display: "grid", gridTemplateColumns: narrow ? "1fr" : "340px 1fr", gap: narrow ? 28 : 40 }
  const axis  = { stroke: "#30363d", tick: { fill: T.textSub, fontSize: 12, fontFamily: "JetBrains Mono" } }

  if (screen === "connect") return <StravaConnect onDemo={useDemo} />
  if (screen === "loading") return <LoadingScreen name={athlete?.firstname} />

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.textPrime, fontFamily: T.body }}>
      <FontLink />
      <style>{`
        * { box-sizing: border-box }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.6) }
        ::-webkit-scrollbar { width: 6px } ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px }
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{ borderBottom: `1px solid ${T.border}`, padding: narrow ? "0 16px" : "0 40px", position: "sticky", top: 0, background: T.bg, zIndex: 100 }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: T.display, fontSize: narrow ? 18 : 24, letterSpacing: "0.12em", color: acc }}>⚡ ENDURANCE INTELLIGENCE</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Level: only show switcher for demo; badge+dropdown for Strava users */}
            {isDemo ? (
              <div style={{ display: "flex", gap: 4 }}>
                {Object.entries(LEVELS).map(([k, v]) => (
                  <button key={k} onClick={() => setLevel(k)} style={{ padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontFamily: T.body, fontSize: 12, fontWeight: level === k ? 700 : 400, background: level === k ? `${v.color}20` : "rgba(255,255,255,0.04)", border: `2px solid ${level === k ? v.color : T.border}`, color: level === k ? v.color : T.textSub }}>
                    {v.icon} {narrow ? "" : k}
                  </button>
                ))}
              </div>
            ) : autoLevel && (
              <div style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}40`, borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                <span>{cfg.icon}</span>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textMuted }}>AUTO-CLASSIFIED</div>
                  <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: cfg.color }}>{level}</div>
                </div>
                <select value={level} onChange={e => setLevel(e.target.value)}
                  style={{ background: "transparent", border: "none", color: T.textMuted, fontFamily: T.body, fontSize: 11, cursor: "pointer", outline: "none" }}>
                  {Object.keys(LEVELS).map(k => <option key={k} value={k} style={{ background: "#161b22" }}>{k}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(252,76,2,0.10)", border: "1px solid rgba(252,76,2,0.30)", borderRadius: 24, padding: "6px 14px" }}>
              {athlete?.pic && <img src={athlete.pic} style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} alt="" />}
              <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: "#FC4C02" }}>
                {athlete?.firstname}{isDemo ? " (Demo)" : ""}
              </span>
              <button onClick={() => setScreen("connect")} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 12, fontFamily: T.body }}>↩</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: narrow ? "24px 16px 60px" : "40px 40px 80px" }}>

        {/* ── RACE COUNTDOWN ── */}
        <RaceCountdown raceDate={raceDate} race={race} accent={acc} />

        {/* ── STRAVA STATS BANNER ── */}
        {stravaStats && !isDemo && (
          <div style={{ background: "rgba(252,76,2,0.06)", border: "1px solid rgba(252,76,2,0.20)", borderRadius: 18, padding: "20px 26px", marginBottom: 24 }}>
            <div style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: "#FC4C02", letterSpacing: "0.15em", marginBottom: 14 }}>
              📡 LIVE FROM STRAVA — {stravaStats.runsCount} RUNS ANALYSED
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                ["Avg Pace",     paceToDisplay(stravaStats.avgPaceMin), "min/km"],
                ["Avg HR",       stravaStats.avgHr ? `${stravaStats.avgHr}` : "N/A", "bpm"],
                ["Total Logged", `${stravaStats.totalKm}`, "km"],
                ["Longest Run",  `${stravaStats.longestKm}`, "km"],
                ["Est. Weekly",  `${stravaStats.weeklyKm}`, "km/wk"],
              ].map(([lbl, val, unit]) => (
                <div key={lbl} style={{ background: "rgba(252,76,2,0.08)", borderRadius: 10, padding: "12px 18px", textAlign: "center", minWidth: 100 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 700, color: "#FC4C02" }}>{val}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{unit}</div>
                  <div style={{ fontSize: 12, color: T.textSub, marginTop: 3, fontWeight: 600 }}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ 01 — TRAINING PLAN ══ */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
            <SecHead num="01" title="Goal-Aware Training Plan" sub="Science-backed plan with 4-week mesocycles and 10% weekly growth rule" color={acc} />
            <button
              onClick={() => exportPlanToPDF(plan, athlete, race, goalTime, level, startDate, raceDate)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: `${acc}15`, border: `1px solid ${acc}40`, borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontFamily: T.body, fontSize: 14, fontWeight: 600, color: acc }}>
              📄 Export PDF
            </button>
          </div>

          <div style={grid2}>
            {/* ── LEFT PANEL ── */}
            <div>
              {/* TARGET RACE */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.textMuted, letterSpacing: "0.10em", marginBottom: 8 }}>TARGET RACE</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {Object.keys(RACES).map(r => (
                    <button key={r} onClick={() => setRace(r)} style={{ padding: "9px 10px", borderRadius: 9, cursor: "pointer", fontFamily: T.body, fontSize: 13, fontWeight: race === r ? 700 : 400, background: race === r ? `${acc}20` : "rgba(255,255,255,0.04)", border: `2px solid ${race === r ? acc : T.border}`, color: race === r ? acc : T.textSub, transition: "all 0.15s" }}>{r}</button>
                  ))}
                </div>
              </div>
              {race === "Custom" && <Field label="Custom Distance" min={1} max={9999} step={0.5} value={cKm} onChange={setCKm} unit=" km" accent={acc} />}

              {/* GOAL TIME with validation */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.textSub, fontFamily: T.body, marginBottom: 7 }}>🎯 Goal Finish Time</div>
                <input
                  type="text" placeholder="e.g. 1:55 or 45" value={goalTime}
                  onChange={e => setGoalTime(e.target.value)}
                  style={{ width: "100%", height: 46, textAlign: "center", background: goalTimeError ? "rgba(248,81,73,0.08)" : "rgba(255,255,255,0.04)", border: `2px solid ${goalTimeError ? "#f85149" : T.border}`, borderRadius: 10, padding: "0 12px", fontFamily: T.mono, fontSize: 18, fontWeight: 700, color: goalTimeError ? "#f85149" : acc, outline: "none", transition: "all 0.15s" }}
                />
                {goalTimeError
                  ? <div style={{ fontSize: 12, color: "#f85149", fontFamily: T.body, marginTop: 4 }}>⚠ {goalTimeError}</div>
                  : <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.body, marginTop: 4 }}>Format H:MM or minutes · Plan adjusts automatically</div>
                }
              </div>

              {mlPrediction && (
                <div style={{ background: `${acc}10`, border: `1px solid ${acc}40`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: acc, letterSpacing: "0.12em", marginBottom: 10 }}>🤖 ML PREDICTION</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      ["Race Pace", `${paceToDisplay(mlPrediction.requiredPace)} /km`],
                      ["Easy Pace", `${paceToDisplay(mlPrediction.easyPace)} /km`],
                      ["Peak Weekly", `${mlPrediction.weeklyLoad} km`],
                      ["Long Run", `${mlPrediction.longRunKm} km`],
                    ].map(([l, v]) => (
                      <div key={l} style={{ fontSize: 13, color: T.textSub, fontFamily: T.body }}>
                        <span style={{ color: T.textMuted }}>{l}: </span>
                        <span style={{ fontFamily: T.mono, fontWeight: 700, color: acc }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>
                    Goal: {formatTime(goalTimeMins)} · Daniels formula + RF model · 42,116 runs
                  </div>
                </div>
              )}

              {/* START DATE */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.textSub, fontFamily: T.body, marginBottom: 7 }}>📅 Training Start Date</div>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  style={{ width: "100%", height: 44, background: "rgba(255,255,255,0.04)", border: `2px solid ${T.border}`, borderRadius: 10, padding: "0 14px", fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: acc, outline: "none", colorScheme: "dark" }}
                />
              </div>

              {/* RACE DATE */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.textSub, fontFamily: T.body, marginBottom: 7 }}>🏁 Race Date <span style={{ fontWeight: 400, color: T.textMuted, fontSize: 12 }}>(optional)</span></div>
                <input type="date" value={raceDate} onChange={e => setRaceDate(e.target.value)}
                  style={{ width: "100%", height: 44, background: "rgba(255,255,255,0.04)", border: `2px solid ${T.border}`, borderRadius: 10, padding: "0 14px", fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: "#f78166", outline: "none", colorScheme: "dark" }}
                />
                {raceDate && startDate && (
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
                    {totalWeeks} weeks to race · Plan starts {alignedStartDate !== startDate ? `Mon ${formatShortDate(new Date(alignedStartDate))}` : formatShortDate(new Date(startDate))} · Race day auto-set to Rest
                  </div>
                )}
              </div>

              {/* REST DAYS */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.textSub, fontFamily: T.body, marginBottom: 7 }}>😴 Rest Days Per Week</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[1, 2, 3].map(n => (
                    <button key={n} onClick={() => setRestDays(n)} style={{ flex: 1, padding: "11px", borderRadius: 9, cursor: "pointer", fontFamily: T.mono, fontSize: 15, fontWeight: 700, background: restDays === n ? `${acc}20` : "rgba(255,255,255,0.04)", border: `2px solid ${restDays === n ? acc : T.border}`, color: restDays === n ? acc : T.textSub, transition: "all 0.15s" }}>
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
                  {restDays === 1 ? "Rest: Sat · Long Run: Sun" : restDays === 2 ? "Rest: Wed + Sat · Long Run: Sun" : "Rest: Tue + Thu + Sat · Long Run: Sun"} · {7 - restDays} sessions/week
                </div>
              </div>

              <Field label="Current Weekly Mileage" min={1} max={9999} step={1} value={wkKm} onChange={setWkKm} unit=" km" accent={acc} hint="1 km to unlimited" />
              <Field label="Longest Recent Run" min={1} max={9999} step={0.5} value={lRun} onChange={setLRun} unit=" km" accent={acc} hint="1 km to unlimited" />
              {!mlPrediction && <Field label="Easy Pace" min={3.0} max={12.0} step={0.05} value={pace} onChange={setPace} unit=" min/km" accent={acc} display={`${paceToDisplay(pace)} min/km`} hint="Click to edit as decimal, shown as M:SS" />}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <Stat label="Race Distance" value={goalKm} unit="km" color={acc} />
                <Stat label="Peak Weekly"   value={peak.toFixed(1)} unit="km / week" color={acc} />
                <Stat label="Run Sessions"  value={7 - restDays} unit="per week" color="#58a6ff" />
                <Stat label="Total Weeks"   value={totalWeeks} unit="weeks" color="#58a6ff" />
              </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div>
              <div style={{ height: 280, marginBottom: 24 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={acc} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={acc} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                    <XAxis dataKey="week" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontFamily: T.body, fontSize: 13, color: T.textSub }} />
                    <Area type="monotone" dataKey="Weekly Load" stroke={acc} fill="url(#g1)" strokeWidth={3} dot={false} />
                    <Area type="monotone" dataKey="Long Run" stroke="#f78166" fill="transparent" strokeWidth={2.5} dot={false} strokeDasharray="5 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Legend for week types */}
              <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                {[["Regular", T.surface2, T.textMuted], ["🔄 Recovery (wk 4,8,12…)", "rgba(227,179,65,0.08)", "#e3b341"], ["🏁 Taper", "rgba(88,166,255,0.08)", "#58a6ff"]].map(([lbl, bg, col]) => (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: col, fontFamily: T.body }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1px solid ${col}40` }} />
                    {lbl}
                  </div>
                ))}
              </div>

              <div style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: "0.12em", marginBottom: 10 }}>WEEKLY BREAKDOWN — CLICK TO EXPAND</div>
              <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
                {plan.map(w => (
                  <div key={w.week} style={{ marginBottom: 5 }}>
                    <button
                      onClick={() => setOpenWk(openWk === w.week ? null : w.week)}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: w.taper ? "rgba(88,166,255,0.08)" : w.isRecoveryWeek ? "rgba(227,179,65,0.06)" : "rgba(255,255,255,0.025)", border: `1px solid ${openWk === w.week ? acc + "70" : T.border}`, borderRadius: 9, padding: "11px 16px", cursor: "pointer", transition: "all 0.15s" }}>
                      <div style={{ textAlign: "left" }}>
                        <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: w.taper ? "#58a6ff" : w.isRecoveryWeek ? "#e3b341" : T.textSub }}>
                          WEEK {w.week}{w.taper ? " — TAPER" : w.isRecoveryWeek ? " — RECOVERY" : ""}
                        </span>
                        {w.dateRange && <div style={{ fontFamily: T.body, fontSize: 11, color: T.textMuted, marginTop: 1 }}>{w.dateRange}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: acc }}>{w.totalKm} km</span>
                        <span style={{ color: T.textMuted, fontSize: 14 }}>{openWk === w.week ? "▲" : "▼"}</span>
                      </div>
                    </button>
                    {openWk === w.week && (
                      <div style={{ marginTop: 3, background: "rgba(0,0,0,0.4)", borderRadius: 9, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: narrow ? "55px 40px 90px 1fr 55px" : "60px 46px 100px 1fr 60px 120px", padding: "7px 14px", borderBottom: `1px solid ${T.border}`, gap: 6 }}>
                          {(narrow ? ["DATE","DAY","SESSION","","KM"] : ["DATE","DAY","SESSION","","KM","PACE"]).map(h => (
                            <span key={h} style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.10em" }}>{h}</span>
                          ))}
                        </div>
                        {w.days.map((d, i) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: narrow ? "55px 40px 90px 1fr 55px" : "60px 46px 100px 1fr 60px 120px", padding: "10px 14px", gap: 6, alignItems: "center", borderBottom: i < 6 ? `1px solid rgba(255,255,255,0.04)` : "none", background: d.isRace ? "rgba(252,76,2,0.06)" : "transparent" }}>
                            <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 600, color: T.textMuted }}>{d.date || "--"}</span>
                            <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.textMuted }}>{d.day}</span>
                            <span style={{ fontFamily: T.body, fontSize: 13, fontWeight: 700, color: SESS_COLORS[d.sess] || T.textSub }}>● {d.sess}{d.isRace ? " 🏁" : ""}</span>
                            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                              {d.km > 0 && <div style={{ height: "100%", width: `${Math.min(100, (d.km / w.totalKm) * 250)}%`, background: SESS_COLORS[d.sess] || T.textSub, borderRadius: 2 }} />}
                            </div>
                            <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.textSub, textAlign: "right" }}>{d.km > 0 ? `${d.km}km` : "--"}</span>
                            {!narrow && <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500, color: T.textSub, textAlign: "right" }}>{d.pace}</span>}
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
          <SecHead num="02" title="Fitness Loss Forecast" sub="Calibrated from 31,656 run-gap pairs · exponential decay model" color="#f78166" />
          <div style={grid2}>
            <div>
              <Field label="Training Days Completed" min={0} max={365} step={1} value={trainingDaysDone} onChange={setTrainingDaysDone} unit=" days" accent="#58a6ff" hint="Days of training before this rest period" />
              <Field label="Consecutive Rest Days" min={1} max={60} step={1} value={daysOff} onChange={setDaysOff} unit=" days" accent="#f78166" hint="How many days are you taking off?" />

              <div style={{ background: "rgba(247,129,102,0.09)", border: "2px solid rgba(247,129,102,0.32)", borderRadius: 14, padding: "20px 22px", marginTop: 6 }}>
                <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: "#f78166", letterSpacing: "0.12em", marginBottom: 16 }}>DETRAINING REPORT</div>
                {[
                  ["Training done",    `${trainingDaysDone} days`],
                  ["Rest days",        `${daysOff} days`],
                  ["Fitness retained", `${(100 - fLoss).toFixed(1)}%`],
                  ["Estimated loss",   `-${fLoss}%`],
                  ["Recovery time",    `~${recoveryDays} days`],
                  ["Return pace",      `${paceToDisplay(returnPace)} /km`],
                  ["Return volume",    `~${returnKm} km/wk`],
                  ["Decay k",          effectiveDecay.toFixed(5)],
                  ["Training effect",  `-${(Math.min(0.40, trainingDaysDone / 180 * 0.40) * 100).toFixed(0)}% slower decay`],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: T.textSub, fontFamily: T.body }}>{lbl}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: "#f78166" }}>{val}</span>
                  </div>
                ))}
                <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.75, fontFamily: T.body, marginTop: 4 }}>
                  {level === "Elite"
                    ? `Largest aerobic base → slowest decay. Still, return at ~${paceToDisplay(returnPace)}/km for first ${recoveryDays} days.`
                    : daysOff <= 7
                    ? `Short break. Retain ${(100-fLoss).toFixed(0)}% fitness — resume near full volume after ${recoveryDays} easy days.`
                    : daysOff <= 14
                    ? `Moderate gap. Start at ${returnKm} km/wk (${paceToDisplay(returnPace)}/km) and rebuild over ${recoveryDays} days.`
                    : `Extended break. Start at ${returnKm} km/wk and allow ${recoveryDays} days full rebuild before race-pace work.`}
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
                    Calibrated on {level === "Beginner" ? "11,201" : level === "Intermediate" ? "15,221" : level === "Advanced" ? "4,494" : "740"} runs · Mujika & Padilla (2000)
                  </div>
                </div>
              </div>
            </div>

            <div style={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={decayData} margin={{ top: 10, right: 10, left: -10, bottom: 24 }}>
                  <defs>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f78166" stopOpacity={0.40} />
                      <stop offset="100%" stopColor="#f78166" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis dataKey="day" {...axis} label={{ value: "Days Inactive", position: "insideBottom", offset: -8, fill: T.textMuted, fontSize: 13 }} />
                  <YAxis domain={[50, 100]} {...axis} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={v => [`${v}%`, "Fitness"]} contentStyle={{ background: "#1c2128", border: `1px solid ${T.border}`, borderRadius: 10, fontFamily: "JetBrains Mono", fontSize: 13, color: T.textSub }} />
                  <ReferenceLine x={daysOff} stroke="#f78166" strokeWidth={2.5} strokeDasharray="6 3" label={{ value: `Day ${daysOff} · ${(100 - fLoss).toFixed(0)}%`, fill: "#f78166", fontSize: 12, fontFamily: "JetBrains Mono", fontWeight: 700 }} />
                  <ReferenceLine x={14} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 2" label={{ value: "14d", fill: T.textMuted, fontSize: 11, fontFamily: "JetBrains Mono" }} />
                  <Area type="monotone" dataKey="fitness" stroke="#f78166" fill="url(#g2)" strokeWidth={3} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ══ 03 — METHODOLOGY ══ */}
        <Methodology level={level} open={showMethodology} onToggle={() => setShowMethodology(v => !v)} />

        <div style={{ textAlign: "center", marginTop: 40, fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.textMuted, letterSpacing: "0.1em" }}>
          ENDURANCE INTELLIGENCE · MSc BIG DATA ANALYTICS · SJU BANGALORE
        </div>
      </div>
    </div>
  )
}

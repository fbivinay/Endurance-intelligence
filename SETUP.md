# 🏃 Endurance Intelligence — Full Deployment Guide
### Strava OAuth + Supabase + Vercel · Student Project

---

## Architecture Overview

```
User clicks "Connect Strava"
        ↓
Strava login page (strava.com)
        ↓
Strava redirects to → /api/strava-callback  (Vercel serverless function)
        ↓
Serverless function exchanges code → access_token + refresh_token
        ↓
Tokens saved to Supabase (Postgres database)
        ↓
Redirect to app with ?athlete_id=XXXXXX
        ↓
Frontend calls /api/activities?athlete_id=XXXXXX
        ↓
Serverless function fetches runs from Strava API
        ↓
Real run data displayed in training plan
```

---

## STEP 1 — Create Strava API App (5 min)

1. Go to **https://www.strava.com/settings/api**
2. Fill in:
   - Application Name: `Endurance Intelligence`
   - Category: `Training`
   - Website: `https://your-app.vercel.app` (placeholder for now)
   - Authorization Callback Domain: `your-app.vercel.app`
3. Click **Create**
4. Save your **Client ID** and **Client Secret** — you'll need these

---

## STEP 2 — Create Supabase Project (5 min)

1. Go to **https://supabase.com** → New Project (free tier is fine)
2. Note your **Project URL** and **anon key** from:
   Settings → API → Project URL + Project API Keys
3. Also copy the **service_role key** (keep this secret — never in browser)

### Create the athletes table:

Go to Supabase → SQL Editor → run this:

```sql
CREATE TABLE athletes (
  id            BIGSERIAL PRIMARY KEY,
  strava_id     BIGINT UNIQUE NOT NULL,
  firstname     TEXT,
  lastname      TEXT,
  profile_pic   TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires BIGINT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX idx_athletes_strava_id ON athletes(strava_id);
```

---

## STEP 3 — Deploy to Vercel (5 min)

### Option A — Vercel CLI (recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Clone / navigate to project
cd endurance-app

# Install dependencies
npm install

# Deploy
vercel

# Follow prompts — it will give you a URL like:
# https://endurance-app-xyz.vercel.app
```

### Option B — GitHub + Vercel UI

1. Push this project to a GitHub repo
2. Go to **https://vercel.com** → Import Project → select your repo
3. Click Deploy

---

## STEP 4 — Add Environment Variables to Vercel

In Vercel dashboard → Your Project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `STRAVA_CLIENT_ID` | From Step 1 |
| `STRAVA_CLIENT_SECRET` | From Step 1 |
| `VITE_SUPABASE_URL` | From Step 2 |
| `VITE_SUPABASE_ANON_KEY` | From Step 2 |
| `SUPABASE_SERVICE_KEY` | From Step 2 (service_role key) |
| `VITE_APP_URL` | Your Vercel URL e.g. `https://endurance-app.vercel.app` |
| `VITE_STRAVA_CLIENT_ID` | Same as STRAVA_CLIENT_ID |

Then **Redeploy** the project so the variables take effect.

---

## STEP 5 — Update Strava Callback URL

Go back to **https://www.strava.com/settings/api** and update:
- **Authorization Callback Domain** → `your-actual-vercel-url.vercel.app`

---

## STEP 6 — Test the flow

1. Visit your Vercel URL
2. Click "Connect with Strava"
3. Approve on Strava
4. You should land back on your app with real run data loaded!

---

## Local Development

```bash
# Create .env file (copy from .env.example)
cp .env.example .env
# Fill in all values

# Run Vercel dev (runs both frontend + serverless functions locally)
npx vercel dev

# App runs at http://localhost:3000
```

---

## Common Issues

**"redirect_uri_mismatch" from Strava**
→ Your callback domain in Strava API settings doesn't match your Vercel URL. Update it.

**"Athlete not found" error**
→ The Supabase table wasn't created. Run the SQL in Step 2.

**Blank page after Strava redirect**
→ Check Vercel function logs: Vercel Dashboard → Deployments → Functions tab

**Token expired errors**
→ The `/api/activities` function auto-refreshes tokens. If it fails, check your Client Secret is correct.

---

## File Structure

```
endurance-app/
├── api/
│   ├── strava-callback.js   ← OAuth exchange (serverless)
│   └── activities.js        ← Fetch runs from Strava (serverless)
├── src/
│   ├── main.jsx             ← React entry
│   ├── App.jsx              ← Main app + UI
│   └── supabase.js          ← Supabase client
├── index.html
├── vite.config.js
├── vercel.json
├── package.json
└── .env.example
```

---

## Costs

Everything on free tiers:
- **Vercel**: Free (hobby plan — 100GB bandwidth/month)
- **Supabase**: Free (500MB DB, 2GB bandwidth)
- **Strava API**: Free (100 requests/15 min per user)

Total monthly cost: **₹0**

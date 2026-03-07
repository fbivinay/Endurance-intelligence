// api/activities.js
// Vercel serverless function — fetches athlete's Strava runs
// GET /api/activities?athlete_id=12345678

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function refreshIfNeeded(athlete) {
  const now = Math.floor(Date.now() / 1000)
  // Token expires within 5 minutes — refresh it
  if (athlete.token_expires - now < 300) {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type:    'refresh_token',
        refresh_token: athlete.refresh_token,
      }),
    })
    const data = await res.json()
    // Update stored tokens
    await supabase
      .from('athletes')
      .update({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        token_expires: data.expires_at,
      })
      .eq('strava_id', athlete.strava_id)

    return data.access_token
  }
  return athlete.access_token
}

export default async function handler(req, res) {
  const { athlete_id } = req.query

  if (!athlete_id) {
    return res.status(400).json({ error: 'athlete_id required' })
  }

  // 1. Look up athlete in Supabase
  const { data: athlete, error } = await supabase
    .from('athletes')
    .select('*')
    .eq('strava_id', athlete_id)
    .single()

  if (error || !athlete) {
    return res.status(404).json({ error: 'Athlete not found' })
  }

  // 2. Refresh token if needed
  const accessToken = await refreshIfNeeded(athlete)

  // 3. Fetch last 60 runs from Strava
  const activitiesRes = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=60&page=1',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  const all = await activitiesRes.json()

  // 4. Filter only runs, extract what we need
  const runs = all
    .filter(a => a.type === 'Run' && a.distance > 0)
    .map(a => ({
      date:      a.start_date_local,
      distance:  a.distance,            // metres
      elapsed:   a.elapsed_time,        // seconds
      elevation: a.total_elevation_gain,
      hr:        a.average_heartrate || null,
      pace:      a.elapsed_time / (a.distance / 1000), // sec/km
    }))

  return res.status(200).json({
    athlete: {
      id:        athlete.strava_id,
      firstname: athlete.firstname,
      lastname:  athlete.lastname,
      pic:       athlete.profile_pic,
    },
    runs,
  })
}

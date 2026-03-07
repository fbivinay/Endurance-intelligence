// api/strava-callback.js
// Vercel serverless function — handles Strava OAuth redirect
// Strava sends: GET /api/strava-callback?code=XXXXX

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service key (secret) — never expose to browser
)

export default async function handler(req, res) {
  const { code, state } = req.query

  if (!code) {
    return res.redirect('/?error=no_code')
  }

  try {
    // 1. Exchange code for Strava access + refresh tokens
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()

    if (tokenData.errors) {
      console.error('Strava token error:', tokenData)
      return res.redirect('/?error=strava_token_failed')
    }

    const {
      access_token,
      refresh_token,
      expires_at,
      athlete,
    } = tokenData

    // 2. Upsert athlete record into Supabase
    const { error: dbError } = await supabase
      .from('athletes')
      .upsert({
        strava_id:     athlete.id,
        firstname:     athlete.firstname,
        lastname:      athlete.lastname,
        profile_pic:   athlete.profile,
        access_token,
        refresh_token,
        token_expires: expires_at,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'strava_id' })

    if (dbError) {
      console.error('Supabase upsert error:', dbError)
      return res.redirect('/?error=db_failed')
    }

    // 3. Redirect back to app with athlete ID so frontend can load the profile
    return res.redirect(`/?athlete_id=${athlete.id}&name=${athlete.firstname}`)

  } catch (err) {
    console.error('Callback error:', err)
    return res.redirect('/?error=server_error')
  }
}

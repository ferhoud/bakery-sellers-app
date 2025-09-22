
# Bakery Sellers App (Planning, Absences, Timesheets & Chat)

A lightweight web app for your vendeuses: login, view the weekly planning, declare an absence, auto‑suggest a remplaçante, chat together, and compute monthly hours.

## Tech stack
- React + Vite
- Supabase (Auth, Postgres DB, Realtime)
- TypeScript

## Quick start

### 1) Create a Supabase project
- Go to supabase.com → create a new project (free is fine).
- In **Project Settings → API**, copy your **Project URL** and **anon public key**.

### 2) Create the database tables
- In **SQL Editor**, paste and run the contents of `supabase/schema.sql` from this repo.

### 3) Configure Auth
- In **Authentication → Providers**, ensure **Email** sign‑in is enabled.
- Invite each vendeuse: **Authentication → Users → Invite user**, with her email and a temporary password (or ask them to sign up).

### 4) Configure your environment
- Copy `.env.example` to `.env` and fill:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### 5) Run locally
```bash
npm install
npm run dev
```
Open the URL shown in your terminal.

### 6) Install on iPhone as an app (PWA-like)
- Open the site in Safari on iPhone.
- Tap **Share** → **Add to Home Screen** to get an icon like a native app.

---

## Features now
- Email/password login (per‑vendeuse accounts).
- Weekly planning (by day, by vendeuse). Edit and save shifts.
- Absence request with **automatic replacement suggestion** based on availability.
- Team chat (real‑time).
- Monthly hours calculator per vendeuse.

## Next steps (optional)
- Roles (Admin for toi, Vendeuse for staff).
- Push notifications (via Supabase/OneSignal) for changes and chat mentions.
- Export PDF of monthly hours.
- Multiple boutiques support.

If you want, I can host this for you or generate a nicer UI later.

# EdMessenger — Setup checklist

Project Supabase: `https://ijxoffbsedvcqbqeohju.supabase.co`

## 1. Run the SQL

**New project:** paste `SUPABASE_SETUP.sql` in the Supabase SQL Editor and run it.

**Existing project:** run `SUPABASE_MIGRATION_QUOTA.sql` to add:
- Primary admin auto-grant for `sheethappenwithjaa@gmail.com` (no passcode)
- Keep latest 50 classroom + DM messages
- Admin-only attendance marking

## 2. Enable Google sign-in

Supabase → **Authentication → Providers → Google → Enable**

Supabase → **Authentication → URL Configuration**:
- **Site URL**: your Cloudflare Worker / deployed URL
- **Redirect URLs**: add the deployed URL (and local `http://localhost:5173` if needed)

## 3. Deploy / keep-alive

Cloudflare Workers do not “sleep”, but **Supabase free-tier can pause**. The app pings `/api/keepalive` every few minutes (client + service worker). `wrangler.toml` also schedules a cron every 5 minutes — enable Cron Triggers if you deploy with Wrangler.

## 4. Sign in

- Sign in with Google as a student normally.
- Sign in as `sheethappenwithjaa@gmail.com` → admin is granted automatically.
- Use the **Student / Admin** toggle on the home screen (or Student button in admin) to switch views.
- Footer passcode UI has been removed.

## Features

- Local logos (`/logo.png`, `/logo-pwa.png`) for Cloudflare (no Lovable CDN dependency)
- PWA install prompt + service worker; PWA icon uses `logo-pwa.png`
- Classroom + DM chat: latest **50** messages kept permanently (older pruned)
- Uploads converted to lean formats (WebP / HTML / text) to protect storage quota
- Attendance: **admin only** (mark students present from Admin → Attendance)
- Quizzes, lessons, student reports

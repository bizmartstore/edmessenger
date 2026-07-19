# EdMessenger — Setup

Supabase: `https://ijxoffbsedvcqbqeohju.supabase.co`

## SQL (required)

1. If new project: run `SUPABASE_SETUP.sql`
2. Then run **`SUPABASE_MIGRATION_ANNOUNCE_ACTIVITIES.sql`** (announcements + activities + admin emails)
3. If not done yet: also run `SUPABASE_MIGRATION_QUOTA.sql` (message prune + attendance admin)
4. Then run **`SUPABASE_MIGRATION_PROFILE_BANNERS.sql`** (profile fields, banners carousel, unread badges, avatars/banners storage)

Primary admin emails (auto-admin, Student/Admin toggle):
- `sheethappenswithjaa@gmail.com`
- `sheethappenwithjaa@gmail.com`

## OneSignal push (required for closed-app alerts)

App ID: `718bec75-70f7-4936-bdff-5dd26e8c835d`

1. In OneSignal dashboard → Settings → Platforms → **Web** — site URL must match your live Cloudflare Worker URL (https)
2. Upload / confirm web push certificates (VAPID is usually automatic)
3. **Required:** set Cloudflare Worker secret  
   `wrangler secret put ONESIGNAL_REST_API_KEY`  
   (OneSignal → Settings → Keys & IDs → REST API Key). Without this secret, `/api/notify` skips sending and nobody gets pushes when the app is closed.
4. Open the app while signed in and tap **Allow** on the notification prompt (students and admins). If you previously blocked notifications, reset the site permission in the browser, then reopen the app.
5. Confirm `https://YOUR-WORKER-URL/OneSignalSDKWorker.js` shows a single `importScripts(...)` line (not HTML). Closed-app delivery uses that service worker.
6. If pushes still fail after a prior broken SW: DevTools → Application → Service Workers → Unregister all → Clear site data → hard reload → Allow again.

### Who gets notified

| Event | Audience |
|--------|----------|
| Announcement, new quiz, activity, lesson | Students |
| Classroom chat | Students |
| Direct message | Recipient only (student or admin) |
| Quiz / activity submitted | Admins |
| New student signed in | Admins |

## PWA

Install banner appears only when the browser supports real install (`beforeinstallprompt`). Tap **Install** to add as PWA. Icon: `/logo-pwa.png`.

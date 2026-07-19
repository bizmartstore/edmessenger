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
4. In the app, tap the **bell** once (Home or Admin header) and allow notifications. Do this on **admin devices too** so admins get DMs / submissions while the app is closed.
5. After allowing, keep the PWA/browser permission ON. Closed-app delivery uses the browser push service + OneSignal service worker (`/OneSignalSDKWorker.js`).

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

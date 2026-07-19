# EdMessenger — Setup

Supabase: `https://ijxoffbsedvcqbqeohju.supabase.co`

## SQL (required)

1. If new project: run `SUPABASE_SETUP.sql`
2. Then run **`SUPABASE_MIGRATION_ANNOUNCE_ACTIVITIES.sql`** (announcements + activities + admin emails)
3. If not done yet: also run `SUPABASE_MIGRATION_QUOTA.sql` (message prune + attendance admin)
4. Then run **`SUPABASE_MIGRATION_PROFILE_BANNERS.sql`** (profile fields, banners carousel, unread badges, avatars/banners storage)
5. Then run **`SUPABASE_MIGRATION_REALTIME_CONTENT.sql`** (live updates for announcements/lessons/quizzes/activities without polling)

Primary admin emails (auto-admin, Student/Admin toggle):
- `sheethappenswithjaa@gmail.com`
- `sheethappenwithjaa@gmail.com`

## PWA

Install banner appears only when the browser supports real install (`beforeinstallprompt`). Tap **Install** to add as PWA. Icon: `/logo-pwa.png`.

## Push notifications (OneSignal)

- App ID: `718bec75-70f7-4936-bdff-5dd26e8c835d`
- Enable banner appears when the user is signed in but not subscribed
- Service worker: `/OneSignalSDKWorker.js`
- Server sends via `POST /api/push/notify` (auth required); health: `GET /api/push/health`
- REST API key is **server-side only** — prefer Cloudflare secret `ONESIGNAL_REST_API_KEY` (do not put it in client code or wrangler `[vars]`)
- iOS Safari: Add to Home Screen (PWA) required for web push

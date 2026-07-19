# EdMessenger — Setup

Supabase: `https://ijxoffbsedvcqbqeohju.supabase.co`

## SQL (required)

1. If new project: run `SUPABASE_SETUP.sql`
2. Then run **`SUPABASE_MIGRATION_ANNOUNCE_ACTIVITIES.sql`** (announcements + activities + admin emails)
3. If not done yet: also run `SUPABASE_MIGRATION_QUOTA.sql` (message prune + attendance admin)

Primary admin emails (auto-admin, Student/Admin toggle):
- `sheethappenswithjaa@gmail.com`
- `sheethappenwithjaa@gmail.com`

## OneSignal push

App ID: `718bec75-70f7-4936-bdff-5dd26e8c835d`

1. In OneSignal dashboard, set your site URL to the Cloudflare Worker URL
2. Upload / confirm web push certificates
3. Add Cloudflare Worker secret **`ONESIGNAL_REST_API_KEY`** (Keys & IDs → REST API Key) so `/api/notify` can send pushes
4. In the app, tap the bell icon on Home to enable notifications

## PWA

Install banner appears only when the browser supports real install (`beforeinstallprompt`). Tap **Install** to add as PWA. Icon: `/logo-pwa.png`.

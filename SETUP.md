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

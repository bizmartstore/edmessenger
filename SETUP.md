# EdMessenger — Setup

Supabase: `https://ijxoffbsedvcqbqeohju.supabase.co`

## SQL (required)

1. If new project: run `SUPABASE_SETUP.sql`
2. Then run **`SUPABASE_MIGRATION_ANNOUNCE_ACTIVITIES.sql`** (announcements + activities + admin emails)
3. If not done yet: also run `SUPABASE_MIGRATION_QUOTA.sql` (message prune + attendance admin)
4. Then run **`SUPABASE_MIGRATION_PROFILE_BANNERS.sql`** (profile fields, banners carousel, unread badges, avatars/banners storage)
5. Then run **`SUPABASE_MIGRATION_REALTIME_CONTENT.sql`** (live updates for announcements/lessons/quizzes/activities without polling)
6. Then run **`SUPABASE_MIGRATION_PUSH_ROLES.sql`** (push notification role lookup for OneSignal)
7. Then run **`SUPABASE_MIGRATION_REVIEWERS.sql`** (lesson reviewers with explanations + practice attempts)
8. Then run **`SUPABASE_MIGRATION_UNREAD_TOTAL.sql`** (reviewers in lessons badge + total for app-icon badge)
9. Then run **`SUPABASE_MIGRATION_WALL_GROUPS.sql`** (class wall, student group chats + passwords, classroom replies, delete private conversations, daily upload quotas)
10. Then run **`SUPABASE_MIGRATION_SOCIAL_TOOLS.sql`** (classroom soft-delete, wall likes/reactions/comments, group polls/reactions/pins)
11. Then run **`SUPABASE_MIGRATION_CHAT_FEEDBACK_GROUP_QUIZ.sql`** (classroom reactions, group quizzes, app feedback)
12. Then run **`SUPABASE_MIGRATION_EDGOTCHI.sql`** (Edgotchi virtual pet — one compact row per student)
13. Then run **`SUPABASE_MIGRATION_GAMES_PASSWORD.sql`** (optional admin password lock for Games / Edgotchi)

Primary admin emails (auto-admin, Student/Admin toggle):
- `sheethappenswithjaa@gmail.com`
- `sheethappenwithjaa@gmail.com`

## PWA

Install banner appears only when the browser supports real install (`beforeinstallprompt`). Tap **Install** to add as PWA. Icon: `/logo-pwa.png`.

## Push notifications (OneSignal)

- App ID: `718bec75-70f7-4936-bdff-5dd26e8c835d`
- Users enable push from **Profile → Enable notifications** (after sign-in)
- Service worker: `/OneSignalSDKWorker.js` (scope `/`)
- Server sends via `POST /api/push/notify` (auth required); health: `GET /api/push/health`
- REST API key is **server-side only** — prefer Cloudflare secret `ONESIGNAL_REST_API_KEY` (do not put it in client code or wrangler `[vars]`)
- iOS Safari: Add to Home Screen (PWA) required for web push
- **App icon badge**: installed PWA uses the Badging API (red number on the icon). Syncs from unread totals; push events bump the badge while the app is closed. Android Chrome shows a notification dot instead of a number.
## Gemini (lesson reviewers)

- Used by **Admin → Lessons → Reviewers → Generate with AI**
- Set Cloudflare secret: `GEMINI_API_KEY` (Google AI Studio / Gemini API key)
- Health: `GET /api/ai/gemini-health`
- Generate: `POST /api/ai/generate-reviewer` (admin auth required)

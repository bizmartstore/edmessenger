# EduChat — Setup checklist

Everything the app needs from your Supabase project (`ijxoffbsedvcqbqeohju`).

## 1. Run the SQL

Open **Supabase → SQL Editor**, paste the entire contents of `SUPABASE_SETUP.sql`, and **before running** edit these two lines near the bottom:

```sql
crypt('CHANGE-ME-PASSCODE', gen_salt('bf'))   -- ← your footer passcode
array['you@gmail.com']                         -- ← educator email allow-list
```

Only Google accounts in the allow-list can redeem the passcode and become admin. To change either later, re-run just that `insert … on conflict … do update` block.

## 2. Enable Google sign-in

Supabase → **Authentication → Providers → Google → Enable** and paste your OAuth Client ID + Secret from Google Cloud Console.

Then Supabase → **Authentication → URL Configuration**:

- **Site URL**: your deployed URL (e.g. `https://your-app.lovable.app`)
- **Redirect URLs**: add both the deployed URL and your Lovable preview URL

## 3. That's it

Sign in with Google → you're a student. Tap the "EduChat • Educator access" text at the bottom → enter your passcode → admin dashboard unlocks.

## Features shipped

- Google auth (managed by Supabase)
- Classroom chat (realtime) + private DMs
- File attachments: images auto-compressed to ~500 KB; PDF/DOC/PPT/XLS uploaded as-is (max 15 MB)
- Lessons: admin uploads PDFs, students read or download
- Quizzes: admin creates multiple-choice, publishes; students take and get graded automatically
- Attendance: one-tap daily check-in; admin sees daily rosters
- Student reports: attendance days, quizzes taken, average score
- Passcode-gated admin footer with email allow-list (defence in depth)
- PWA: installable, mobile-first, safe-area aware
- Aggressive Lovable badge hide (CSS)

## Notes

- **True Word/PPT compression** requires a server-side office toolchain that isn't available on the edge, so those file types are stored as-is. Images and PDFs benefit from client-side compression / natural PDF compactness respectively. If you want server-side PDF re-compression later, add a Supabase Edge Function with `pdf-lib` or similar.
- Realtime is enabled on `messages` and `direct_messages`.
- Storage buckets `chat-files` and `lessons` are created as public so URLs work directly in `<img>` and PDF viewers.

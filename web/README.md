# JJ Magnetic Memories (web)

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind. UI built from the Stitch export in
`Downloads/stitch_magz_printing_app`.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
```

## Database (MongoDB Atlas)

Copy `.env.example` to `.env.local` and fill it in (it is git-ignored). With `MONGODB_URI` set, users and events are
stored in MongoDB. Without it the app keeps them in memory and everything resets on a restart.

| Variable | What it is |
| --- | --- |
| `JJ_MONGODB_URI` | Atlas connection string (Atlas > Connect > Drivers). `MONGODB_URI` also works, but this name wins. Use it on Vercel, whose MongoDB integration injects a locked `MONGODB_URI` |
| `MONGODB_DB` | Database name, default `printpix` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | The first admin. Created once, only when the database has no admin yet |
| `SESSION_SECRET` | Signs the login cookie. Without it everyone is signed out after a restart |

Collections: `users` (unique email) and `events`. Photos are never stored. In database mode the four demo accounts below
are **not** created, only the admin from the variables above.

## How accounts work

- **One sign-in page** (`/login`) for everyone. The server looks at the account and sends admins to
  `/admin` and users to `/events` (My Events). A user who opens `/admin` is sent back to `/events`, and an admin who
  opens `/events` is sent to `/admin`.
- **Only an admin can add users.** There is no sign-up. The admin sets the first password.
- **A signed-in user can change their own password** in Settings (needs the current password, 8+ characters).
- **Active / inactive is controlled by the admin.** An inactive user cannot sign in, and an open session
  stops working on its next request.
- **Every user has a created date and an expiry date.** The admin picks the expiry when adding the user (a year from
  today by default) and can change it any time in Edit. The account works through that day, then it cannot sign in
  and an open session stops on its next request. "Today" is worked out in `APP_TIMEZONE` (default `Asia/Kolkata`).
  Admins never expire. The Users table has Created and Expires columns and an Expired tab.
- **Edit user** (admin): name, email, expiry date, active/inactive and a new password.
- **Support contact.** Users who are locked out, forgot a password, or need an account extended are pointed to `support@novapixelsoftware.com` (login page, login errors, Settings). It is one constant in `lib/support.ts`.
- **Usage totals** (admin): the Users page shows each user's total events, downloads and prints (summed over all their events), plus overall totals across all users at the top.

## Demo accounts (in-memory mode only, `lib/server/db.ts`)

| Email | Password | Type | Status |
| --- | --- | --- | --- |
| admin@example.com | admin123 | admin | active |
| marcus@example.com | user12345 | user | active |
| elena@example.com | user12345 | user | active |
| david@example.com | user12345 | user | inactive |

Restarting the server resets accounts to this seed.

## What lives where

| Data | Where now | Where it moves later |
| --- | --- | --- |
| Users, passwords (hashed), active/inactive | MongoDB `users` (or server memory without `MONGODB_URI`), behind `UserRepo` in `lib/server/db.ts` | Already behind an interface, another database is one more class |
| Events (name, setup, and download and print counts) | MongoDB `events` (or server memory without `MONGODB_URI`), behind `EventRepo` in `lib/server/events.ts` | Same |
| Photos | Browser memory only. Never sent, never saved. A refresh clears them | Stays that way |
| Sessions | Signed, httpOnly cookie, 7 days (`lib/server/session.ts`) | No change needed |

## Screens

| Route | Screen |
| --- | --- |
| `/login` | Sign in (admins and users) |
| `/events` | **My Events** (a user's main page): all their events as a **table** (default) or cards, with Downloads and Prints counts. New Event is in the top bar. Phones always get cards |
| `/events/new` | New Event: just a name. Creating it opens the event |
| `/events/[id]` | Everything for one event: Downloads and Prints counts at the top, a **Setup** tab (product, shape, template size, paper) and a **Photos** tab (editor: slots, zoom, turns, tilt, a name label per photo, Reset Sheet, Download PNG, Print). A new event opens on Setup first |
| `/settings` | Account and change password |
| `/admin` | Users: add, reset password, active/inactive |

## API

| Method and path | Who | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | anyone | Body `{ email, password }`. Returns `redirectTo`. Errors: `INVALID`, `INACTIVE`, `EXPIRED`, `MISSING` |
| `POST /api/auth/logout` | signed in | Sign out |
| `POST /api/auth/password` | signed in | Body `{ current, next }` |
| `POST /api/events` | user | Create an event with just a `name` |
| `PATCH /api/events/[id]` | event owner | Choose or change the setup (`productId`, `shapeId`, `templateId`, `paperId`) |
| `POST /api/events/[id]/count` | event owner | Body `{ kind: 'download' | 'print' }`, adds one to that counter |
| `GET /api/admin/users` | admin | List users |
| `POST /api/admin/users` | admin | Add a user (`name`, `email`, `password`, optional `expiresAt`, default one year) |
| `PATCH /api/admin/users/[id]` | admin | Any of `name`, `email`, `expiresAt` (`YYYY-MM-DD`), `status` (`active` / `inactive`), `password` |

## Sheets, labels and print quality

- **Cut outline templates.** Round (photo 59 mm inside a 68 mm cut line) and Square (photo 53.6 mm inside 64 mm) come from the two PSD
  printing templates, 12 per A4. The Fridge Magnet rectangles get a 5.2 mm ring (the same space Square has) around the photo. The sheet
  draws a thin cut line around each piece. In the Photo Shape list Round is first and Square second.
- **Name labels.** Each photo can carry a name on a ribbon (classic, folded banner, wavy, curved sash, pill, or name only), with its own ribbon colour, text colour, font (seven to pick from), bold, italic, outline and size. The name follows the curve of its ribbon. An optional overlay design (hearts, stars, night sky, sky, dots, gold ring) goes over the photo. Overlays are 2000 px transparent PNGs in `public/frames/`, listed in `lib/frames.ts`, and are shrunk step by step to their printed size so thin lines stay clean.
  "Same design for all" copies the design to every photo and keeps each photo's own name. Labels are drawn on the canvas, so the
  download and the print show exactly what the editor shows. Fonts load from Google Fonts through `next/font` (see `app/layout.tsx`).
- **Print quality.** Photos are kept as imported (no JPEG re-encode) and only shrunk above 2400 px. When the sheet is exported, each photo is
  reduced to its print size by exact area averaging, which gives far less grain than the browser's own smoothing. The PNG carries 300 dpi
  (a pHYs chunk), so Photos, Word and print dialogs open and print the A4 sheet at its true size.

## Not built yet

- Offline install (service worker / PWA) and the Android APK wrapper (Capacitor).
- Heart and hexagon shapes, custom paper size, flip, multi-sheet designs.
- Real printer integration. Printing uses the browser's print dialog. The Prints count goes up when the print dialog closes, so a cancelled dialog is counted too (Chrome with `--kiosk-printing` has no dialog to cancel). Real printer-job counting would need a print server or desktop app.

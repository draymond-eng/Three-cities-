# Room booking

A Skedda-style booking app for the clubhouse: members sign in, see what's free,
tap a slot and book it. Static files served from GitHub Pages alongside the rest
of the site, with Supabase (hosted Postgres + auth) behind it. Nothing to run,
nothing to keep alive.

```
book/index.html   the app shell and styles
book/app.js       everything the app does
book/time.js      timezone / wall-clock helpers  (tested: node book/time.test.mjs)
book/config.js    your Supabase keys — the only file you must edit
supabase/         schema, tests, and the email function
```

## Setting it up

**1. Make a Supabase project** at [supabase.com](https://supabase.com). The free
tier is comfortably enough for a club this size.

**2. Load the schema.** Open the SQL editor and run `supabase/schema.sql` whole.
That creates the tables, the booking rules, row-level security, and three seed
rooms you can rename later. It is safe to re-run.

**3. Point the app at it.** In Supabase go to *Project Settings → Data API* and
copy the URL and the `anon` public key into `book/config.js`. Publishing that key
is expected — every table is guarded by the policies in the schema, so the key on
its own grants nothing beyond what a signed-in member may do.

**4. Allow the redirect.** In *Authentication → URL Configuration* add
`https://thesocialclubconsultant.com/book/` to the redirect allow-list, and set
the Site URL to your domain.

**5. Sign in once,** then make yourself an admin from the SQL editor:

```sql
update public.profiles set is_admin = true, tier = 'founder'
 where email = 'you@yourdomain.com';
```

**6. Set the timezone** if the club is not on US Eastern:

```sql
update public.settings set timezone = 'Europe/London', club_name = 'Three Cities Social';
```

You now have the Admin tab: rename the rooms, set opening hours, and move members
onto the right tier.

## The rules

Rules live on the membership tier, not in the app, so changing them is one `update`
and takes effect immediately for everyone.

| | Guest | Member | Resident | Founding |
|---|---|---|---|---|
| Can book | no | yes | yes | yes |
| Hours per booking | – | 2 | 4 | 8 |
| Days ahead | – | 14 | 30 | 60 |
| Upcoming at once | – | 2 | 5 | 10 |
| Hours per month | – | 8 | 40 | unlimited |

```sql
update public.membership_tiers set max_hours_per_month = 12 where slug = 'member';
```

Per-room limits sit on the room: opening hours, slot size, shortest booking, and
`allowed_tiers` if a room should be restricted (`'{resident,founder}'`, or `null`
for everyone).

Admins may overrun any of these — but not a blackout, and not another booking.

## Why double-booking cannot happen

Every booking is a time range, and Postgres holds an exclusion constraint over
them:

```sql
exclude using gist (room_id with =, during with &&) where (status = 'confirmed')
```

Two members tapping the same slot at the same instant do not race. The second
write is rejected by the index itself, inside the transaction, and that member
sees *"Someone just booked that slot."* This is not a check-then-insert in
application code, which is exactly the pattern that leaks under load.

Everything else — tier limits, opening hours, notice periods, blackouts — is
enforced by database triggers rather than by the browser, so the rules hold no
matter what talks to the database.

## Confirmation and reminder emails

`supabase/functions/booking-notify/` emails a confirmation when a booking is made
and a reminder before it starts (default one hour; change
`settings.reminder_minutes`). Both are stamped on the booking row, so nothing is
ever sent twice.

```bash
supabase functions deploy booking-notify --no-verify-jwt
supabase secrets set RESEND_API_KEY=...  \
  MAIL_FROM="Three Cities Social <club@yourdomain.com>" \
  APP_URL=https://thesocialclubconsultant.com/book/
```

Then edit `supabase/cron.sql` with your project ref and run it — that schedules
the function every five minutes. Without `RESEND_API_KEY` the function logs what
it would have sent instead of sending it, which is a useful way to try it first.

Sending needs a verified domain in [Resend](https://resend.com) (or swap the one
`fetch` in `index.ts` for Postmark, SES, whatever you already use).

Push notifications are **not** wired up. They need a service worker, VAPID keys
and a subscription table — worth doing once members are actually using this, and
email covers the same ground until then.

## Tests

```bash
node book/time.test.mjs        # wall-clock / DST handling
./supabase/run-tests.sh        # booking rules, against a local Postgres 16
```

`schema.test.sql` covers the things that would quietly ruin a booking system:
overlapping bookings, back-to-back bookings, tier limits, opening hours, slot
alignment, notice periods, monthly allowances, blackouts cancelling what is
inside them, members not being able to promote themselves or book for someone
else, and `availability()` not leaking who booked what.

## Notes

* `/book/` is `noindex` — it is a members' tool, not a landing page. There is no
  link to it from the main site; send members the URL directly.
* The Supabase client is loaded from jsDelivr. If it cannot be fetched the page
  says so rather than showing a blank screen.
* Bookings are stored as instants but reasoned about in the club's wall clock, so
  a 2pm booking stays a 2pm booking either side of a daylight-saving change.

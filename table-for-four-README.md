# Kith

Chicago's curated club for couple friends — for couples who find it hard to
make another couple or parent friends. *kith* /kɪθ/ · the friends who become
family.

**One file, no build step:** [`table-for-four.html`](./table-for-four.html).
Open it in a browser or host it on any static host.

## The model — event first, then pair

Deliberately **not** a matching algorithm. The host is the matchmaker:

1. **Apply** — a couple fills out a short, premium intake (four minutes) on the
   public front door. All couples welcome, kids optional.
2. **Curated mixer** — they're invited to a hand-picked Chicago event with a
   handful of vetted couples. Real chemistry, in person, low pressure — which
   also kills flaking.
3. **Flag who you clicked with** — after the night, each couple notes who they'd
   see again. The app surfaces the **mutual** sparks.
4. **The intro** — the host pairs mutual matches into a proper 1:1 hang and
   shepherds it to a real friendship.

Free to start — no payments.

## Surfaces

### Public front door (`#/`)
Tasteful splash ("Not that kind of couples club"), then a mobile-first intake
capturing the full `applications` schema: couple & partner names, Chicago
neighborhood, life stage, household, hang rhythm, per-partner temperament
sliders and likes, and the three open answers that drive matching (a couple
they were close with, what they're hoping for, hard no's).

### Concierge console (`#/console`) — private, host only
Behind a magic-link gate keyed to the admin email.

- **Applications** — every application, newest first; open one to read the full
  intake, add notes, set status (`new / invited / attended / paired / passed`).
- **Events** — create mixers (venue, date, capacity); manage each event's
  roster, mark who attended, and tap who each couple clicked with. Mutual picks
  are detected automatically (shown with a green ⇄).
- **Pairing** — surfaces the mutual matches from each past mixer and turns them
  into intros with one click.
- **Board** — intros grouped `proposed → confirmed → happened →
  matched / fizzled`, with a plan editor (place, date, format) and notes at
  each step. This is how you run the follow-up cadence by hand.

## Data model

- **applications** — one row per couple (names, neighborhood, life_stage[],
  kids, kid_ages[], hang_appetite, free_slots[], bonds_by, partner postures &
  likes, past_couple, hoping_for, hard_no, status, notes).
- **events** — one row per mixer (title, venue, scheduled_at, capacity, status,
  notes, and a `roster` of `{couple_id, attended, likes[]}`).
- **tables** (intros) — one row per pairing (couple_ids[], event_id, place,
  scheduled_at, format, status, notes).

## Backend

Pluggable data layer:

- **Default (localStorage):** works out of the box, and seeds six Chicago
  couples plus a past mixer with a real mutual pair so the console is alive on
  first open.
- **Supabase:** paste your project URL + anon key into the config block near the
  top of the `<script>`. Every read/write then goes to your `applications`,
  `events`, and `tables` tables, and console sign-in uses a real Supabase magic
  link. The public front door only needs `INSERT` on `applications`; the console
  needs an authenticated admin.

## Out of scope (intentionally)

Automated matching / scoring · public profiles / browsing / swiping · in-app
messaging · payments / membership.

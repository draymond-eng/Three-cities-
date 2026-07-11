# Table for Four

A concierge app that pairs families with new family friends — for couples who
find it hard to make another couple or parent friends. Built to the
**Table for Four – Build Brief**, Steps 1–6.

**One file, no build step:** [`table-for-four.html`](./table-for-four.html).
Open it in a browser or host it on GitHub Pages / any static host.

## What it does

Two surfaces, exactly as the brief specifies — and deliberately **not** a
matching algorithm. Dray is the algorithm for the first cohort: reads
applications and seats tables by hand.

### Public front door  (`#/`)
A mobile-first, four-minute intake that a couple fills out on a shared phone.
Collects every field in the `applications` schema:

- couple name, both partners' names, neighborhood
- household / kids + age bands
- hang appetite, free slots, whether they bond by *doing / talking / both*
- each partner's posture slider (0 reserved → 100 expansive) and likes
- the three open answers that actually drive the call:
  **a couple they were once close with**, **what they're hoping for**,
  **hard no's**

Submitting inserts one row into `applications` with `status = 'new'`.

### Concierge console  (`#/console`) — private, Dray only
Behind a magic-link gate keyed to `draymond@threecitiessocial.com`.

1. **Applications** — every application, newest first (couple, neighborhood,
   status). Click one to read the full intake; the two open answers are given
   room. Add private notes and change status (`new / seated / matched / passed`).
2. **Seat a table** — pick 2–3 couples, set place, date/time, and format
   (dinner / outing). Saving creates a `tables` row and flips those
   applications to `seated`.
3. **The board** — tables grouped `proposed → confirmed → happened →
   matched / fizzled`. Advance status and add a note at each step — this is how
   you run the follow-up cadence by hand. Marking a table **matched** flips its
   couples to `matched`; **fizzled** releases still-seated couples back to `new`.

## Data model

Two tables, matching the brief exactly — no third table needed. Cadence and
outcomes live as `tables.status` and `tables.notes`.

**applications:** `id, created_at, couple_name, partner1_name, partner2_name,
neighborhood, kids, kid_ages[], hang_appetite, free_slots[], bonds_by,
partner1_posture, partner2_posture, partner1_likes, partner2_likes,
past_couple, hoping_for, hard_no, status, notes`

**tables:** `id, created_at, couple_ids[], place, scheduled_at, format,
status, notes`

## Backend

The app ships with a **pluggable data layer**:

- **Default (localStorage):** works out of the box with no setup, and seeds
  four realistic sample applications so the console has data immediately
  (Step 4 of the brief). Great for demoing and testing the full flow.
- **Supabase (the brief's stack):** open `table-for-four.html`, find the
  config block near the top of the `<script>`, and paste your project URL and
  anon key:

  ```js
  const SUPABASE_URL = "https://xxxx.supabase.co";
  const SUPABASE_ANON_KEY = "your-anon-public-key";
  ```

  With both set, the app loads `supabase-js` and every read/write goes to your
  `applications` / `tables` tables, and console sign-in uses a real Supabase
  magic link. Create the two tables with Row Level Security per Step 1:
  the public front door only needs `INSERT` on `applications`; the console
  needs an authenticated admin (Dray's email) to read/write everything.

## Out of scope (per the brief, intentionally not built)

Matching algorithm / scoring / auto-pairing · public profiles / browsing /
swiping · in-app messaging (follow-up happens over text) · payments /
membership · the logged-in "couple status" page for applicants.

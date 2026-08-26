# Survivor Pick'em

A weekly prediction pool for *Survivor*, replacing a Google Sheet fed by hand-built Google Forms.
Participants enter a name — no password — and pick who goes home, who wins immunity and who finds
an idol. Points, standings and next week's form all generate themselves.

Season 50 is included as a fixture, and reproducing its original spreadsheet standings is the
project's acceptance test.

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in Supabase URL + service-role key, set an admin passcode
# apply supabase/migrations/0001_survivor_schema.sql in the Supabase SQL editor
npm run seed                      # load Season 50 and verify it against the spreadsheet
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm test` | Full suite, including the Season 50 replay |
| `npm run seed` | Load Season 50 into Supabase and verify the standings (`-- --reset` to reload) |
| `npm run import:sheet` | Regenerate `fixtures/season-50.json` from the Google Sheet |
| `npm run build` | Production build |

## Routes

| Path | |
| --- | --- |
| `/` | Links to this week's form and the standings |
| `/leaderboard` | Current season standings |
| `/episodic-picks` | The open episode's form (`?episode=<id>` for a past week) |
| `/archive` · `/archive/season/[n]` | Past seasons |
| `/admin/forms` | Generate, edit, approve; enter results |
| `/admin/seasons` | Start a new season, paste the roster, declare the Sole Survivor |

Nothing in the browser talks to Supabase. Every read and write goes through the route handlers
under `/api`, which hold the service-role key server-side; `proxy.ts` guards `/admin` and
`/api/admin/*`.

## How scoring works

Reverse-engineered from the Season 50 spreadsheet and verified against it.

Each `(episode, scoring_key)` has one **or more** accepted answers — Ep 5 sent two people home, Ep 6
had three immunity winners — and naming any of them scores. Matching is case-insensitive; `n/a`
accepts nothing.

**Point values are derived, not configured.** This is what makes weekly generation automatic:

| Key | Points |
| --- | --- |
| `voted_out`, `win_immunity`, `season_winner` | **the number of castaways still in the game** |
| `losing_tribe` | 10 (pre-merge only) |
| `hidden_idol` | 20 |
| `play_advantage`, `play_idol`, `play_sitd` | 5 (post-merge only) |

Across Season 50 that produces 24, 22, 21, 20, 19, 17, 14, 13, 11, 10, 9, 7, 5 — exactly the
spreadsheet's Points Key. Naming who goes home is harder when more people are left, so it pays
more early and decays as the field shrinks.

**The season winner is retroactive.** The "who wins?" pick is asked every week and repeats are
allowed, but it is worth nothing until the finale. Setting the winner grades every week at once, at
each week's rate. This is why scoring always runs over a whole season rather than one episode.

`lib/scoring.ts` is pure — no database, no fetch — so the entire season can be replayed in a unit
test.

## Starting a season

`/admin/seasons` takes a season number, a name, the tribes and the cast list — pasted as text,
because that is how a cast list arrives. Merge and finale episode numbers can be left blank and
filled in once the season shows its hand.

The **short name** is the load-bearing field: it is the value stored in every pick, so use whatever
the group actually says — `Tiff`, not `Tiffany`. Duplicates are rejected, since two identical short
names would make a pick ambiguous.

Creating a season makes it the active one, which is what `/` and `/leaderboard` default to. The
previous season becomes an archive automatically.

Declaring the Sole Survivor from the same screen is what triggers the retroactive sweep.

## The weekly loop

1. **Generate** (`/admin/forms`) — builds next week's draft from who is still playing: the form
   shape (pre-merge / post-merge / finale), the point values, and the dropdown options all follow.
2. **Review and approve** — every prompt, point value and option is editable.
3. **Open** — publishes the form at `/episodic-picks`. That is the link to email round; the app
   does not send mail.
4. **Lock** at the pick deadline. Give an episode an air date and the deadline is derived from it
   — 8:00pm ET, with daylight saving handled, so a November episode is EST rather than an hour
   out. Derived server-side, so it is the same wherever the form was generated from.
5. **Enter results** — Wikipedia fills in what it can, you do the rest, and saving re-scores the
   season.

Marking who went home is its own step, and it is the one that matters: it sets next week's options
*and* next week's point values.

## What the Wikipedia assist can and cannot do

`lib/wiki.ts` parses the season summary table. That table is awkward — a two-tier header where
"Episode" spans three sub-columns, and a body where one episode can occupy five `<tr>` elements via
`rowspan` — so it is expanded into a proper grid before anything is read out of it.

It **suggests**; it never applies. Two reasons:

- **One wiki episode is not always one pool week.** Season 50's two-hour premiere is wiki Ep 1 but
  covers a single pool week plus a medical evacuation the pool didn't score; its finale is wiki
  Ep 13 but two pool forms. Episodes therefore carry an explicit `wiki_episode_number`.
- **It covers about half the form.** Who *acquired* an idol, and whether an advantage, idol or
  shot-in-the-dark was played, are not in the table and never will be. Those are entered by hand.

Names are mapped back to the season roster — the wiki says "Tiffany" where the pool says "Tiff" —
and anything that can't be placed is reported rather than guessed.

## Tests

```bash
npm test
```

- **Season 50 replay** — the whole season through `lib/scoring.ts`, asserted against the
  spreadsheet's Standings tab: every category subtotal, every total, and the finishing order.
- **Derived points** — the remaining-castaway rule reproduces every value the sheet recorded.
- **Form generation** — rebuilds the real Episode 3 and Episode 10 Google Forms, prompts, point
  values and option lists included.
- **Wiki parser** — run against the real Season 50 table and cross-checked against the
  spreadsheet's own answer key for Eps 2–12.
- **Form reproduction** — every pick anyone ever made is asserted to be a selectable option on the
  regenerated form. This is what caught the finale being one form recorded as two episodes.
- **Deadlines** — the 8:00pm ET rule across the daylight-saving boundary, both sides.

### One known deviation from the spreadsheet

In Episode 5 the sheet paid **20** points for the second vote-out slot, while its own Points Key
says Episode 5 is worth **19**. Every other slot that week paid 19, so this is a stray formula
rather than a rule, and the app scores the consistent 19.

Shelby, Jane and Dagny therefore finish one point below their spreadsheet totals (203, 154, 39).
No ranks change. The test asserts this is the *only* difference, so any other drift fails the build.

## Schema

All tables are `survivor_` prefixed and the migration is idempotent, so it is safe to apply to a
Supabase project that already has unrelated tables in it.

RLS is deliberately off: nothing is reachable with the anon key, because the route handlers are the
only client. **If a browser is ever given direct table access, that decision has to be revisited
before it ships.**

Two schema details carry real weight:

- `survivor_questions.scoring_key` is separate from `question_key`, so a double-elimination week can
  ask "who goes home?" twice and grade both slots against one answer bucket.
- `survivor_question_options` snapshots the choices at generation time rather than joining live
  castaways, so an archived episode always renders the options it was actually asked with.

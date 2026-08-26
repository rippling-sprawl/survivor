-- Survivor Pick'em schema.
--
-- Everything is prefixed `survivor_` so it can share a Supabase project with unrelated work, and
-- every statement is idempotent so the file can be re-applied safely.
--
-- RLS is intentionally left off: nothing here is reachable with the anon key. The Next.js route
-- handlers are the only client, and they use the service-role key server-side. If a browser is
-- ever given direct table access, this decision has to be revisited before that ships.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------------------------
-- Participants. Identified by name alone: this is a family pool, not a bank, and passwords were
-- the main thing people disliked about the alternatives. `display_name` is citext + unique so
-- "kyle" and "Kyle" are the same player rather than two rows splitting one person's score.
-- ---------------------------------------------------------------------------------------------
create table if not exists survivor_users (
  id           uuid primary key default gen_random_uuid(),
  display_name citext not null unique,
  email        text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Seasons. `merge_episode` and `finale_episode` decide which form shape gets generated each week;
-- `winner_short_name` stays null until the finale and, once set, unlocks the retroactive
-- season-winner sweep across every episode.
-- ---------------------------------------------------------------------------------------------
create table if not exists survivor_seasons (
  id                       uuid primary key default gen_random_uuid(),
  number                   integer not null unique,
  name                     text not null,
  status                   text not null default 'upcoming'
                             check (status in ('upcoming', 'active', 'complete')),
  merge_episode            integer,
  finale_episode           integer,
  starting_castaway_count  integer not null default 0,
  wiki_url                 text,
  winner_short_name        text,
  created_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Castaways. This table does double duty: it is the dropdown option list for every question, and
-- `eliminated_episode is null` is the remaining-player count that sets each week's point values.
-- Marking someone eliminated is therefore what makes next week's form generate correctly.
-- ---------------------------------------------------------------------------------------------
create table if not exists survivor_castaways (
  id                 uuid primary key default gen_random_uuid(),
  season_id          uuid not null references survivor_seasons(id) on delete cascade,
  short_name         text not null,
  full_name          text,
  tribe              text,
  tribe_label        text,
  tribe_color        text,
  eliminated_episode integer,
  finish_place       integer,
  sort_order         integer not null default 0,
  unique (season_id, short_name)
);

create index if not exists survivor_castaways_season_idx on survivor_castaways (season_id);

-- ---------------------------------------------------------------------------------------------
-- Episodes. `wiki_episode_number` is stored explicitly rather than assumed equal to
-- `episode_number`: Season 50's pool numbering drifted from Wikipedia's the moment an episode
-- aired with no tribal council, and silently trusting them to match would mis-score a week.
-- ---------------------------------------------------------------------------------------------
create table if not exists survivor_episodes (
  id                  uuid primary key default gen_random_uuid(),
  season_id           uuid not null references survivor_seasons(id) on delete cascade,
  episode_number      integer not null,
  title               text,
  air_date            date,
  wiki_episode_number integer,
  status              text not null default 'draft'
                        check (status in ('draft', 'approved', 'open', 'locked', 'scored')),
  locks_at            timestamptz,
  created_at          timestamptz not null default now(),
  unique (season_id, episode_number)
);

create index if not exists survivor_episodes_season_idx on survivor_episodes (season_id, episode_number);

-- ---------------------------------------------------------------------------------------------
-- Questions. `scoring_key` is separate from `question_key` on purpose: a double-elimination week
-- asks "who goes home?" twice, and both slots grade against the one `voted_out` answer bucket.
-- ---------------------------------------------------------------------------------------------
create table if not exists survivor_questions (
  id           uuid primary key default gen_random_uuid(),
  episode_id   uuid not null references survivor_episodes(id) on delete cascade,
  question_key text not null,
  scoring_key  text not null check (scoring_key in (
                 'losing_tribe', 'win_immunity', 'play_advantage', 'play_idol',
                 'play_sitd', 'voted_out', 'hidden_idol', 'season_winner')),
  prompt       text not null,
  help_text    text,
  input_type   text not null default 'select' check (input_type in ('select', 'radio')),
  points       integer not null default 0,
  sort_order   integer not null default 0,
  is_required  boolean not null default true,
  unique (episode_id, question_key)
);

create index if not exists survivor_questions_episode_idx on survivor_questions (episode_id, sort_order);

-- Options are snapshotted at generation time rather than joined from survivor_castaways, so an
-- archived episode always renders the choices it was actually asked with.
create table if not exists survivor_question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references survivor_questions(id) on delete cascade,
  value       text not null,
  label       text not null,
  sort_order  integer not null default 0,
  unique (question_id, value)
);

create index if not exists survivor_question_options_question_idx
  on survivor_question_options (question_id, sort_order);

-- ---------------------------------------------------------------------------------------------
-- Picks. One submission per person per episode; re-submitting before lock updates it in place.
-- ---------------------------------------------------------------------------------------------
create table if not exists survivor_submissions (
  id           uuid primary key default gen_random_uuid(),
  episode_id   uuid not null references survivor_episodes(id) on delete cascade,
  user_id      uuid not null references survivor_users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (episode_id, user_id)
);

create index if not exists survivor_submissions_episode_idx on survivor_submissions (episode_id);
create index if not exists survivor_submissions_user_idx on survivor_submissions (user_id);

create table if not exists survivor_answers (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references survivor_submissions(id) on delete cascade,
  question_id   uuid not null references survivor_questions(id) on delete cascade,
  value         text not null,
  unique (submission_id, question_id)
);

create index if not exists survivor_answers_submission_idx on survivor_answers (submission_id);

-- ---------------------------------------------------------------------------------------------
-- The answer key. Several rows can share one (episode, scoring_key): Ep 5 sent two people home and
-- Ep 6 had three immunity winners, and naming any one of them scores.
-- ---------------------------------------------------------------------------------------------
create table if not exists survivor_answer_key (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references survivor_episodes(id) on delete cascade,
  scoring_key text not null,
  value       text not null,
  unique (episode_id, scoring_key, value)
);

create index if not exists survivor_answer_key_episode_idx on survivor_answer_key (episode_id);

-- ---------------------------------------------------------------------------------------------
-- Materialised results. Wiped and rebuilt for the whole season on every rescore, which keeps
-- scoring idempotent and lets the retroactive winner sweep simply re-run everything.
-- ---------------------------------------------------------------------------------------------
create table if not exists survivor_scores (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references survivor_submissions(id) on delete cascade,
  question_id    uuid not null references survivor_questions(id) on delete cascade,
  is_correct     boolean not null default false,
  points_awarded integer not null default 0,
  unique (submission_id, question_id)
);

create index if not exists survivor_scores_submission_idx on survivor_scores (submission_id);

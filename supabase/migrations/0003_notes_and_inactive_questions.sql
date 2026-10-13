-- Episode notes and inactive questions.
--
-- Notes are a short list of { heading, body } shown at the top of a week's picks form ("Double
-- elimination tonight!"). They are only ever read and written with their episode, so a jsonb
-- column is simpler than a table of their own.
--
-- `is_active = false` parks a question below the form instead of deleting it: removing one is
-- undoable, and every episode carries pre-seeded spares (shot-in-the-dark, advantage played, …)
-- that the admin can switch on. Inactive questions are never shown to players or scored.
--
-- Idempotent like 0001.

alter table survivor_episodes
  add column if not exists notes jsonb not null default '[]'::jsonb;

alter table survivor_questions
  add column if not exists is_active boolean not null default true;

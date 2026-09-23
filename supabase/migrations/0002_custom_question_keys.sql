-- Custom questions.
--
-- The admin can add one-off questions to a week's form ("Will anyone quit?"). Each gets its own
-- `custom_…` scoring key so it has its own answer-key bucket; the leaderboard rolls them all into
-- a Bonus column. The original check constraint only allowed the eight built-in keys.
--
-- Idempotent like 0001: drop and re-create.

alter table survivor_questions drop constraint if exists survivor_questions_scoring_key_check;

alter table survivor_questions add constraint survivor_questions_scoring_key_check check (
  scoring_key in (
    'losing_tribe', 'win_immunity', 'play_advantage', 'play_idol',
    'play_sitd', 'voted_out', 'hidden_idol', 'season_winner')
  or scoring_key ~ '^custom_[a-z0-9_]+$'
);

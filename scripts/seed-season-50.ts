/**
 * Loads the Season 50 fixture into Supabase, then scores it and checks the result against the
 * original spreadsheet's Standings tab. If the numbers do not line up, the script fails loudly
 * rather than leaving a plausible-looking but wrong leaderboard in the database.
 *
 *   npm run seed
 *   npm run seed -- --reset   # delete and reload Season 50 first
 */

import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fixture from '../fixtures/season-50.json';
import { scoreSeason } from '../lib/scoring';
import { templatesFor, shapeFor, type QuestionTemplate } from '../lib/question-templates';
import type { ScoringKey } from '../lib/types';

const KNOWN_SHEET_DELTAS: Record<string, number> = { Shelby: -1, Jane: -1, Dagny: -1 };

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function check<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no rows returned`);
  return result.data;
}

/**
 * The spreadsheet stored answers but never the forms themselves, so prompts and option lists are
 * rebuilt from the same templates the app will use going forward. That is the point: if the
 * templates could not reproduce Season 50's forms, they are not the right templates.
 */
function questionMeta(episodeNumber: number, questionKey: string): QuestionTemplate {
  const shape = shapeFor(
    episodeNumber,
    fixture.season.mergeEpisode,
    fixture.season.finaleEpisode,
  );
  const templates = templatesFor(shape, true);
  const found = templates.find((t) => t.questionKey === questionKey);
  if (found) return found;
  throw new Error(`No template for ${questionKey} (episode ${episodeNumber}, shape ${shape})`);
}

async function main() {
  const db = client();
  const reset = process.argv.includes('--reset');
  const { season, castaways, users, episodes, submissions, expectedStandings } = fixture;

  if (reset) {
    console.log('Removing any existing Season 50 rows...');
    const existing = check(
      await db.from('survivor_seasons').select('id').eq('number', season.number),
      'reset/lookup',
    ) as { id: string }[];
    for (const row of existing) {
      // Everything below a season cascades from this delete.
      const removed = await db.from('survivor_seasons').delete().eq('id', row.id);
      if (removed.error) throw new Error(`reset/delete: ${removed.error.message}`);
    }
  }

  // -- season ------------------------------------------------------------------------------------
  const seasonRow = check(
    await db
      .from('survivor_seasons')
      .upsert(
        {
          number: season.number,
          name: season.name,
          status: 'complete',
          merge_episode: season.mergeEpisode,
          finale_episode: season.finaleEpisode,
          starting_castaway_count: season.startingCastawayCount,
          wiki_url: season.wikiUrl,
          winner_short_name: season.winnerShortName,
        },
        { onConflict: 'number' },
      )
      .select('id')
      .single(),
    'season',
  ) as { id: string };
  const seasonId = seasonRow.id;
  console.log(`Season ${season.number} -> ${seasonId}`);

  // -- castaways ---------------------------------------------------------------------------------
  const castawayRows = check(
    await db
      .from('survivor_castaways')
      .upsert(
        castaways.map((c, i) => ({
          season_id: seasonId,
          short_name: c.shortName,
          full_name: c.fullName,
          tribe: c.tribe,
          tribe_label: c.tribeLabel,
          tribe_color: c.tribeColor,
          eliminated_episode: c.eliminatedEpisode,
          finish_place: c.finishPlace,
          sort_order: i,
        })),
        { onConflict: 'season_id,short_name' },
      )
      .select('id, short_name'),
    'castaways',
  ) as { id: string; short_name: string }[];
  console.log(`  ${castawayRows.length} castaways`);

  // -- participants ------------------------------------------------------------------------------
  const userRows = check(
    await db
      .from('survivor_users')
      .upsert(
        users.map((u) => ({ display_name: u.displayName, email: u.email })),
        { onConflict: 'display_name' },
      )
      .select('id, display_name'),
    'users',
  ) as { id: string; display_name: string }[];
  const userIdByName = new Map(userRows.map((u) => [u.display_name.toLowerCase(), u.id]));
  console.log(`  ${userRows.length} participants`);

  // -- episodes, questions, options --------------------------------------------------------------
  const episodeIdByNumber = new Map<number, string>();
  const questionIdByKey = new Map<string, string>(); // "<episodeNumber>:<questionKey>" -> uuid

  for (const episode of episodes) {
    const episodeRow = check(
      await db
        .from('survivor_episodes')
        .upsert(
          {
            season_id: seasonId,
            episode_number: episode.episodeNumber,
            status: 'scored',
          },
          { onConflict: 'season_id,episode_number' },
        )
        .select('id')
        .single(),
      `episode ${episode.episodeNumber}`,
    ) as { id: string };
    episodeIdByNumber.set(episode.episodeNumber, episodeRow.id);

    // Options are the castaways still in the game when the form opened, which is exactly what the
    // real forms offered. Usually that is the episode's own week; the finale is the exception,
    // hence `optionsAsOfEpisode` (see scripts/import-sheet.ts).
    const asOf = episode.optionsAsOfEpisode ?? episode.episodeNumber;
    const survivors = castaways.filter(
      (c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= asOf,
    );

    for (const question of episode.questions) {
      const meta = questionMeta(episode.episodeNumber, question.questionKey);
      const questionRow = check(
        await db
          .from('survivor_questions')
          .upsert(
            {
              episode_id: episodeRow.id,
              question_key: question.questionKey,
              scoring_key: question.scoringKey,
              prompt: meta.prompt,
              help_text: meta.helpText,
              input_type: meta.inputType,
              points: question.points,
              sort_order: question.sortOrder,
              is_required: meta.isRequired,
            },
            { onConflict: 'episode_id,question_key' },
          )
          .select('id')
          .single(),
        `question ${episode.episodeNumber}:${question.questionKey}`,
      ) as { id: string };
      questionIdByKey.set(`${episode.episodeNumber}:${question.questionKey}`, questionRow.id);

      const values =
        meta.optionSource === 'castaways'
          ? survivors.map((c) => c.shortName)
          : meta.optionSource === 'tribes'
            ? [...new Set(survivors.map((c) => c.tribeLabel))]
            : ['Yes', 'No'];

      const options = await db.from('survivor_question_options').upsert(
        values.map((value, i) => ({
          question_id: questionRow.id,
          value,
          label: value,
          sort_order: i,
        })),
        { onConflict: 'question_id,value' },
      );
      if (options.error) throw new Error(`options ${question.questionKey}: ${options.error.message}`);
    }

    // -- answer key ------------------------------------------------------------------------------
    const answerKeyRows = Object.entries(episode.answerKey).flatMap(([scoringKey, list]) =>
      (list as string[]).map((value) => ({
        episode_id: episodeRow.id,
        scoring_key: scoringKey,
        value,
      })),
    );
    if (answerKeyRows.length > 0) {
      const written = await db
        .from('survivor_answer_key')
        .upsert(answerKeyRows, { onConflict: 'episode_id,scoring_key,value' });
      if (written.error) throw new Error(`answer key ${episode.episodeNumber}: ${written.error.message}`);
    }
  }
  console.log(`  ${episodes.length} episodes, ${questionIdByKey.size} questions`);

  // -- submissions -------------------------------------------------------------------------------
  const submissionRows = check(
    await db
      .from('survivor_submissions')
      .upsert(
        submissions.map((s) => {
          const userId = userIdByName.get(s.userName.toLowerCase());
          if (!userId) throw new Error(`Unknown participant: ${s.userName}`);
          const episodeId = episodeIdByNumber.get(s.episodeNumber);
          if (!episodeId) throw new Error(`Unknown episode: ${s.episodeNumber}`);
          return {
            episode_id: episodeId,
            user_id: userId,
            submitted_at: s.submittedAt ?? new Date().toISOString(),
          };
        }),
        { onConflict: 'episode_id,user_id' },
      )
      .select('id, episode_id, user_id'),
    'submissions',
  ) as { id: string; episode_id: string; user_id: string }[];

  const submissionIdByKey = new Map(
    submissionRows.map((s) => [`${s.episode_id}:${s.user_id}`, s.id]),
  );

  const answerRows = submissions.flatMap((s) => {
    const userId = userIdByName.get(s.userName.toLowerCase())!;
    const episodeId = episodeIdByNumber.get(s.episodeNumber)!;
    const submissionId = submissionIdByKey.get(`${episodeId}:${userId}`)!;
    return Object.entries(s.answers).map(([questionKey, value]) => {
      const questionId = questionIdByKey.get(`${s.episodeNumber}:${questionKey}`);
      if (!questionId) throw new Error(`No question ${s.episodeNumber}:${questionKey}`);
      return { submission_id: submissionId, question_id: questionId, value: value as string };
    });
  });

  for (let i = 0; i < answerRows.length; i += 500) {
    const written = await db
      .from('survivor_answers')
      .upsert(answerRows.slice(i, i + 500), { onConflict: 'submission_id,question_id' });
    if (written.error) throw new Error(`answers: ${written.error.message}`);
  }
  console.log(`  ${submissionRows.length} submissions, ${answerRows.length} answers`);

  // -- score, then prove it matches the spreadsheet ----------------------------------------------
  const questions = check(
    await db
      .from('survivor_questions')
      .select('id, episode_id, scoring_key, points, sort_order')
      .in('episode_id', [...episodeIdByNumber.values()]),
    'verify/questions',
  ) as { id: string; episode_id: string; scoring_key: ScoringKey; points: number; sort_order: number }[];

  const answerKey = check(
    await db
      .from('survivor_answer_key')
      .select('episode_id, scoring_key, value')
      .in('episode_id', [...episodeIdByNumber.values()]),
    'verify/answerKey',
  ) as { episode_id: string; scoring_key: ScoringKey; value: string }[];

  const storedAnswers = check(
    await db
      .from('survivor_answers')
      .select('submission_id, question_id, value')
      .in('submission_id', submissionRows.map((s) => s.id)),
    'verify/answers',
  ) as { submission_id: string; question_id: string; value: string }[];

  const result = scoreSeason({
    episodes: [...episodeIdByNumber.entries()].map(([episodeNumber, id]) => ({ id, episodeNumber })),
    questions: questions.map((q) => ({
      id: q.id,
      episodeId: q.episode_id,
      scoringKey: q.scoring_key,
      points: q.points,
      sortOrder: q.sort_order,
    })),
    answerKey: answerKey.map((a) => ({
      episodeId: a.episode_id,
      scoringKey: a.scoring_key,
      value: a.value,
    })),
    submissions: submissionRows.map((s) => ({
      id: s.id,
      episodeId: s.episode_id,
      userId: s.user_id,
    })),
    answers: storedAnswers.map((a) => ({
      submissionId: a.submission_id,
      questionId: a.question_id,
      value: a.value,
    })),
    seasonWinnerShortName: season.winnerShortName,
  });

  // Persist the scores.
  const clearedScores = await db
    .from('survivor_scores')
    .delete()
    .in('submission_id', submissionRows.map((s) => s.id));
  if (clearedScores.error) throw new Error(`scores/clear: ${clearedScores.error.message}`);

  for (let i = 0; i < result.rows.length; i += 500) {
    const written = await db.from('survivor_scores').insert(
      result.rows.slice(i, i + 500).map((r) => ({
        submission_id: r.submissionId,
        question_id: r.questionId,
        is_correct: r.isCorrect,
        points_awarded: r.pointsAwarded,
      })),
    );
    if (written.error) throw new Error(`scores/insert: ${written.error.message}`);
  }

  const nameById = new Map(userRows.map((u) => [u.id, u.display_name]));
  const totals = new Map(result.byUser.map((r) => [nameById.get(r.userId)!, r.total]));

  console.log('\nStandings (database vs spreadsheet):');
  const problems: string[] = [];
  for (const expected of expectedStandings) {
    const actual = totals.get(expected.name);
    const allowed = expected.total + (KNOWN_SHEET_DELTAS[expected.name] ?? 0);
    const note = KNOWN_SHEET_DELTAS[expected.name] ? '  (documented Ep 5 delta)' : '';
    const ok = actual === allowed;
    if (!ok) problems.push(`${expected.name}: expected ${allowed}, got ${actual}`);
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${expected.name.padEnd(10)} ${String(actual).padStart(4)}` +
        `   sheet ${String(expected.total).padStart(4)}${note}`,
    );
  }

  if (problems.length > 0) {
    console.error(`\nSeed verification failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\nSeed verified against the spreadsheet.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

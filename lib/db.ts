import 'server-only';
import { supabaseAdmin } from './supabase-server';
import { scoreSeason, withRanks, type LeaderboardRow } from './scoring';
import { generateForm, shapeFor } from './question-templates';
import { ConflictError, ValidationError } from './errors';
import { easternEveningUtc } from './format';
import type {
  Castaway,
  Episode,
  EpisodeStatus,
  SeasonStatus,
  Question,
  QuestionOption,
  QuestionScoringKey,
  Season,
} from './types';
import { CUSTOM_KEY_PREFIX } from './types';

/**
 * All database access lives here so the route handlers stay thin and the scoring engine stays
 * pure. Rows come back in snake_case from Postgres and are mapped to camelCase domain types at
 * this boundary; nothing above this file should see a snake_case key.
 */

// -- row shapes as they come out of Postgres ----------------------------------------------------

type SeasonRow = {
  id: string;
  number: number;
  name: string;
  status: Season['status'];
  merge_episode: number | null;
  finale_episode: number | null;
  starting_castaway_count: number;
  wiki_url: string | null;
  winner_short_name: string | null;
};

type CastawayRow = {
  id: string;
  season_id: string;
  short_name: string;
  full_name: string | null;
  tribe: string | null;
  tribe_label: string | null;
  tribe_color: string | null;
  eliminated_episode: number | null;
  finish_place: number | null;
  sort_order: number;
};

type EpisodeRow = {
  id: string;
  season_id: string;
  episode_number: number;
  title: string | null;
  air_date: string | null;
  wiki_episode_number: number | null;
  status: EpisodeStatus;
  locks_at: string | null;
};

type QuestionRow = {
  id: string;
  episode_id: string;
  question_key: string;
  scoring_key: QuestionScoringKey;
  prompt: string;
  help_text: string | null;
  input_type: Question['inputType'];
  points: number;
  sort_order: number;
  is_required: boolean;
};

type OptionRow = {
  id: string;
  question_id: string;
  value: string;
  label: string;
  sort_order: number;
};

const toSeason = (r: SeasonRow): Season => ({
  id: r.id,
  number: r.number,
  name: r.name,
  status: r.status,
  mergeEpisode: r.merge_episode,
  finaleEpisode: r.finale_episode,
  startingCastawayCount: r.starting_castaway_count,
  wikiUrl: r.wiki_url,
  winnerCastawayName: r.winner_short_name,
});

const toCastaway = (r: CastawayRow): Castaway & { sortOrder: number } => ({
  id: r.id,
  seasonId: r.season_id,
  shortName: r.short_name,
  fullName: r.full_name,
  tribe: r.tribe,
  tribeLabel: r.tribe_label,
  tribeColor: r.tribe_color,
  eliminatedEpisode: r.eliminated_episode,
  finishPlace: r.finish_place,
  sortOrder: r.sort_order,
});

const toEpisode = (r: EpisodeRow): Episode => ({
  id: r.id,
  seasonId: r.season_id,
  episodeNumber: r.episode_number,
  title: r.title,
  airDate: r.air_date,
  wikiEpisodeNumber: r.wiki_episode_number,
  status: r.status,
  locksAt: r.locks_at,
});

const toQuestion = (r: QuestionRow): Question => ({
  id: r.id,
  episodeId: r.episode_id,
  questionKey: r.question_key,
  scoringKey: r.scoring_key,
  prompt: r.prompt,
  helpText: r.help_text,
  inputType: r.input_type,
  points: r.points,
  sortOrder: r.sort_order,
  isRequired: r.is_required,
});

const toOption = (r: OptionRow): QuestionOption => ({
  id: r.id,
  questionId: r.question_id,
  value: r.value,
  label: r.label,
  sortOrder: r.sort_order,
});

/** Supabase returns `{ data, error }` everywhere; this keeps the call sites readable. */
function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no data returned`);
  return result.data;
}

// -- seasons ------------------------------------------------------------------------------------

export async function listSeasons(): Promise<Season[]> {
  const rows = unwrap(
    await supabaseAdmin().from('survivor_seasons').select('*').order('number', { ascending: false }),
    'listSeasons',
  ) as SeasonRow[];
  return rows.map(toSeason);
}

/** The season the site defaults to: the active one, else the most recent. */
export async function getCurrentSeason(): Promise<Season | null> {
  const seasons = await listSeasons();
  return seasons.find((s) => s.status === 'active') ?? seasons[0] ?? null;
}

export async function getSeasonByNumber(number: number): Promise<Season | null> {
  const rows = unwrap(
    await supabaseAdmin().from('survivor_seasons').select('*').eq('number', number).limit(1),
    'getSeasonByNumber',
  ) as SeasonRow[];
  return rows[0] ? toSeason(rows[0]) : null;
}

// -- castaways ----------------------------------------------------------------------------------

export async function listCastaways(seasonId: string) {
  const rows = unwrap(
    await supabaseAdmin()
      .from('survivor_castaways')
      .select('*')
      .eq('season_id', seasonId)
      .order('sort_order', { ascending: true }),
    'listCastaways',
  ) as CastawayRow[];
  return rows.map(toCastaway);
}

/**
 * Who is still playing when a given episode's form opens. Drives both the dropdown options and
 * the point values, so "remaining" has to mean *before* this episode's eliminations are recorded.
 */
export async function listSurvivors(seasonId: string, beforeEpisode: number) {
  const all = await listCastaways(seasonId);
  return all.filter(
    (c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= beforeEpisode,
  );
}

// -- episodes -----------------------------------------------------------------------------------

export async function listEpisodes(seasonId: string): Promise<Episode[]> {
  const rows = unwrap(
    await supabaseAdmin()
      .from('survivor_episodes')
      .select('*')
      .eq('season_id', seasonId)
      .order('episode_number', { ascending: true }),
    'listEpisodes',
  ) as EpisodeRow[];
  return rows.map(toEpisode);
}

export async function getEpisode(episodeId: string): Promise<Episode | null> {
  const rows = unwrap(
    await supabaseAdmin().from('survivor_episodes').select('*').eq('id', episodeId).limit(1),
    'getEpisode',
  ) as EpisodeRow[];
  return rows[0] ? toEpisode(rows[0]) : null;
}

/**
 * The episode /episodic-picks defaults to: the one taking picks, otherwise the most recent one
 * people can still look at. A season between episodes should show last week's form read-only
 * rather than an empty page.
 */
export async function getCurrentEpisode(seasonId: string): Promise<Episode | null> {
  const episodes = await listEpisodes(seasonId);
  return (
    episodes.find((e) => e.status === 'open') ??
    [...episodes].reverse().find((e) => e.status === 'locked' || e.status === 'scored') ??
    null
  );
}

export interface EpisodeForm {
  episode: Episode;
  questions: (Question & { options: QuestionOption[] })[];
}

export async function getEpisodeForm(episodeId: string): Promise<EpisodeForm | null> {
  const episode = await getEpisode(episodeId);
  if (!episode) return null;

  const questionRows = unwrap(
    await supabaseAdmin()
      .from('survivor_questions')
      .select('*')
      .eq('episode_id', episodeId)
      .order('sort_order', { ascending: true }),
    'getEpisodeForm/questions',
  ) as QuestionRow[];

  if (questionRows.length === 0) return { episode, questions: [] };

  const optionRows = unwrap(
    await supabaseAdmin()
      .from('survivor_question_options')
      .select('*')
      .in('question_id', questionRows.map((q) => q.id))
      .order('sort_order', { ascending: true }),
    'getEpisodeForm/options',
  ) as OptionRow[];

  const optionsByQuestion = new Map<string, QuestionOption[]>();
  for (const row of optionRows) {
    const list = optionsByQuestion.get(row.question_id);
    if (list) list.push(toOption(row));
    else optionsByQuestion.set(row.question_id, [toOption(row)]);
  }

  return {
    episode,
    questions: questionRows.map((q) => ({
      ...toQuestion(q),
      options: optionsByQuestion.get(q.id) ?? [],
    })),
  };
}

/** An episode takes picks only while it is open and before its lock time. */
export function isAcceptingPicks(episode: Episode, now = new Date()): boolean {
  if (episode.status !== 'open') return false;
  if (!episode.locksAt) return true;
  return now < new Date(episode.locksAt);
}

// -- users --------------------------------------------------------------------------------------

export interface PoolUser {
  id: string;
  displayName: string;
  email: string | null;
}

export async function listUsers(): Promise<PoolUser[]> {
  const rows = unwrap(
    await supabaseAdmin()
      .from('survivor_users')
      .select('id, display_name, email')
      .order('display_name', { ascending: true }),
    'listUsers',
  ) as { id: string; display_name: string; email: string | null }[];
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, email: r.email }));
}

/** Looks a participant up without creating one — used when someone is just checking their picks. */
export async function findUser(displayName: string): Promise<PoolUser | null> {
  const name = displayName.trim();
  if (!name) return null;
  const rows = unwrap(
    await supabaseAdmin()
      .from('survivor_users')
      .select('id, display_name, email')
      .eq('display_name', name)
      .limit(1),
    'findUser',
  ) as { id: string; display_name: string; email: string | null }[];
  return rows[0]
    ? { id: rows[0].id, displayName: rows[0].display_name, email: rows[0].email }
    : null;
}

/**
 * Names are the only identity in this pool, so a typo would quietly split someone's season in
 * two. `display_name` is citext + unique, which makes the insert a no-op collision when the name
 * already exists in any casing; we then read the canonical row back.
 */
export async function findOrCreateUser(displayName: string): Promise<PoolUser> {
  const name = displayName.trim();
  if (!name) throw new ValidationError('Enter your name to submit picks.');

  const existing = unwrap(
    await supabaseAdmin()
      .from('survivor_users')
      .select('id, display_name, email')
      .eq('display_name', name)
      .limit(1),
    'findOrCreateUser/select',
  ) as { id: string; display_name: string; email: string | null }[];

  if (existing[0]) {
    return { id: existing[0].id, displayName: existing[0].display_name, email: existing[0].email };
  }

  const created = unwrap(
    await supabaseAdmin()
      .from('survivor_users')
      .insert({ display_name: name })
      .select('id, display_name, email')
      .single(),
    'findOrCreateUser/insert',
  ) as { id: string; display_name: string; email: string | null };

  return { id: created.id, displayName: created.display_name, email: created.email };
}

// -- submissions --------------------------------------------------------------------------------

export async function getSubmission(episodeId: string, userId: string) {
  const rows = unwrap(
    await supabaseAdmin()
      .from('survivor_submissions')
      .select('id, episode_id, user_id, submitted_at')
      .eq('episode_id', episodeId)
      .eq('user_id', userId)
      .limit(1),
    'getSubmission',
  ) as { id: string; episode_id: string; user_id: string; submitted_at: string }[];
  if (!rows[0]) return null;

  const answers = unwrap(
    await supabaseAdmin()
      .from('survivor_answers')
      .select('question_id, value')
      .eq('submission_id', rows[0].id),
    'getSubmission/answers',
  ) as { question_id: string; value: string }[];

  return {
    id: rows[0].id,
    episodeId: rows[0].episode_id,
    userId: rows[0].user_id,
    submittedAt: rows[0].submitted_at,
    answers: Object.fromEntries(answers.map((a) => [a.question_id, a.value])),
  };
}

/**
 * Upserts a whole set of picks. Re-submitting before lock replaces the previous answers rather
 * than adding a second row, so the last thing someone chose is what counts.
 */
export async function saveSubmission(input: {
  episodeId: string;
  userId: string;
  answers: Record<string, string>;
}) {
  const db = supabaseAdmin();

  const submission = unwrap(
    await db
      .from('survivor_submissions')
      .upsert(
        { episode_id: input.episodeId, user_id: input.userId, submitted_at: new Date().toISOString() },
        { onConflict: 'episode_id,user_id' },
      )
      .select('id')
      .single(),
    'saveSubmission/upsert',
  ) as { id: string };

  const rows = Object.entries(input.answers)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([questionId, value]) => ({
      submission_id: submission.id,
      question_id: questionId,
      value,
    }));

  // Clear first: a question removed from the form should not leave a stale answer behind.
  const cleared = await db.from('survivor_answers').delete().eq('submission_id', submission.id);
  if (cleared.error) throw new Error(`saveSubmission/clear: ${cleared.error.message}`);

  if (rows.length > 0) {
    const inserted = await db.from('survivor_answers').insert(rows);
    if (inserted.error) throw new Error(`saveSubmission/answers: ${inserted.error.message}`);
  }

  return submission.id;
}

// -- scoring ------------------------------------------------------------------------------------

/**
 * Loads everything a season needs and hands it to the pure engine. Deliberately reads the whole
 * season rather than one episode: the season-winner sweep grades every week at once, so partial
 * scoring would be wrong the moment a finale lands.
 */
export async function computeSeasonScores(season: Season) {
  const db = supabaseAdmin();
  const episodes = await listEpisodes(season.id);
  if (episodes.length === 0) return { rows: [], byUser: [] as LeaderboardRow[] };

  const episodeIds = episodes.map((e) => e.id);

  const questions = unwrap(
    await db
      .from('survivor_questions')
      .select('id, episode_id, scoring_key, points, sort_order')
      .in('episode_id', episodeIds),
    'computeSeasonScores/questions',
  ) as { id: string; episode_id: string; scoring_key: QuestionScoringKey; points: number; sort_order: number }[];

  const answerKey = unwrap(
    await db
      .from('survivor_answer_key')
      .select('episode_id, scoring_key, value')
      .in('episode_id', episodeIds),
    'computeSeasonScores/answerKey',
  ) as { episode_id: string; scoring_key: QuestionScoringKey; value: string }[];

  const submissions = unwrap(
    await db
      .from('survivor_submissions')
      .select('id, episode_id, user_id')
      .in('episode_id', episodeIds),
    'computeSeasonScores/submissions',
  ) as { id: string; episode_id: string; user_id: string }[];

  const answers =
    submissions.length === 0
      ? []
      : ((unwrap(
          await db
            .from('survivor_answers')
            .select('submission_id, question_id, value')
            .in('submission_id', submissions.map((s) => s.id)),
          'computeSeasonScores/answers',
        ) as { submission_id: string; question_id: string; value: string }[]) ?? []);

  return scoreSeason({
    episodes: episodes.map((e) => ({ id: e.id, episodeNumber: e.episodeNumber })),
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
    submissions: submissions.map((s) => ({
      id: s.id,
      episodeId: s.episode_id,
      userId: s.user_id,
    })),
    answers: answers.map((a) => ({
      submissionId: a.submission_id,
      questionId: a.question_id,
      value: a.value,
    })),
    seasonWinnerShortName: season.winnerCastawayName,
  });
}

/** Recomputes and rewrites survivor_scores for a whole season. Safe to run repeatedly. */
export async function rescoreSeason(season: Season) {
  const db = supabaseAdmin();
  const result = await computeSeasonScores(season);

  const episodes = await listEpisodes(season.id);
  if (episodes.length > 0) {
    const submissionIds = (unwrap(
      await db
        .from('survivor_submissions')
        .select('id')
        .in('episode_id', episodes.map((e) => e.id)),
      'rescoreSeason/submissions',
    ) as { id: string }[]).map((s) => s.id);

    if (submissionIds.length > 0) {
      const cleared = await db.from('survivor_scores').delete().in('submission_id', submissionIds);
      if (cleared.error) throw new Error(`rescoreSeason/clear: ${cleared.error.message}`);
    }
  }

  if (result.rows.length > 0) {
    // Chunked: a full season is a few thousand rows and Supabase rejects very large payloads.
    const CHUNK = 500;
    for (let i = 0; i < result.rows.length; i += CHUNK) {
      const chunk = result.rows.slice(i, i + CHUNK).map((r) => ({
        submission_id: r.submissionId,
        question_id: r.questionId,
        is_correct: r.isCorrect,
        points_awarded: r.pointsAwarded,
      }));
      const inserted = await db.from('survivor_scores').insert(chunk);
      if (inserted.error) throw new Error(`rescoreSeason/insert: ${inserted.error.message}`);
    }
  }

  return result;
}

export interface LeaderboardEntry extends LeaderboardRow {
  rank: number;
  displayName: string;
}

export interface Leaderboard {
  season: Season;
  episodes: Episode[];
  entries: LeaderboardEntry[];
}

export async function getLeaderboard(season: Season): Promise<Leaderboard> {
  const [result, episodes, users] = await Promise.all([
    computeSeasonScores(season),
    listEpisodes(season.id),
    listUsers(),
  ]);

  const nameById = new Map(users.map((u) => [u.id, u.displayName]));

  return {
    season,
    // Only episodes that have been graded belong on the leaderboard grid.
    episodes: episodes.filter((e) => e.status === 'scored'),
    entries: withRanks(result.byUser).map((row) => ({
      ...row,
      displayName: nameById.get(row.userId) ?? 'Unknown',
    })),
  };
}

// -- admin writes -------------------------------------------------------------------------------

/**
 * Builds next week's draft form. Everything that changes week to week — the point values and the
 * dropdown options — falls out of who is still playing, which is why marking eliminations after
 * an episode is the step that makes the next one generate correctly.
 */
export async function generateNextEpisode(season: Season, opts?: {
  episodeNumber?: number;
  includeSecondVoteOut?: boolean;
  title?: string | null;
  airDate?: string | null;
  wikiEpisodeNumber?: number | null;
  locksAt?: string | null;
}) {
  const db = supabaseAdmin();
  const existing = await listEpisodes(season.id);
  const episodeNumber =
    opts?.episodeNumber ??
    (existing.length === 0 ? 1 : Math.max(...existing.map((e) => e.episodeNumber)) + 1);

  if (existing.some((e) => e.episodeNumber === episodeNumber)) {
    throw new ConflictError(`Episode ${episodeNumber} already exists.`);
  }

  const survivors = await listSurvivors(season.id, episodeNumber);
  if (survivors.length === 0) {
    throw new ValidationError(
      'No castaways are left to build a form from. Add the season roster first.',
    );
  }

  const shape = shapeFor(episodeNumber, season.mergeEpisode, season.finaleEpisode);
  const generated = generateForm({
    shape,
    survivors: survivors.map((c) => ({ shortName: c.shortName, tribeLabel: c.tribeLabel })),
    includeSecondVoteOut: opts?.includeSecondVoteOut,
  });

  const episode = unwrap(
    await db
      .from('survivor_episodes')
      .insert({
        season_id: season.id,
        episode_number: episodeNumber,
        title: opts?.title ?? null,
        air_date: opts?.airDate ?? null,
        wiki_episode_number: opts?.wikiEpisodeNumber ?? null,
        // Picks close when the episode starts, not when it ends. Derived here rather than in the
        // browser so the deadline is the same wherever the form was generated from.
        locks_at:
          opts?.locksAt ?? (opts?.airDate ? easternEveningUtc(opts.airDate) : null),
        status: 'draft',
      })
      .select('*')
      .single(),
    'generateNextEpisode/episode',
  ) as EpisodeRow;

  for (const question of generated) {
    const row = unwrap(
      await db
        .from('survivor_questions')
        .insert({
          episode_id: episode.id,
          question_key: question.questionKey,
          scoring_key: question.scoringKey,
          prompt: question.prompt,
          help_text: question.helpText,
          input_type: question.inputType,
          points: question.points,
          sort_order: question.sortOrder,
          is_required: question.isRequired,
        })
        .select('id')
        .single(),
      `generateNextEpisode/question ${question.questionKey}`,
    ) as { id: string };

    if (question.options.length > 0) {
      const inserted = await db.from('survivor_question_options').insert(
        question.options.map((o) => ({
          question_id: row.id,
          value: o.value,
          label: o.label,
          sort_order: o.sortOrder,
        })),
      );
      if (inserted.error) {
        throw new Error(`generateNextEpisode/options: ${inserted.error.message}`);
      }
    }
  }

  return { episode: toEpisode(episode), shape, remaining: survivors.length };
}

export async function updateEpisode(
  episodeId: string,
  patch: Partial<{
    title: string | null;
    airDate: string | null;
    wikiEpisodeNumber: number | null;
    locksAt: string | null;
    status: EpisodeStatus;
  }>,
) {
  const row: Record<string, unknown> = {};
  if ('title' in patch) row.title = patch.title;
  if ('airDate' in patch) row.air_date = patch.airDate;
  if ('wikiEpisodeNumber' in patch) row.wiki_episode_number = patch.wikiEpisodeNumber;
  if ('locksAt' in patch) row.locks_at = patch.locksAt;
  if ('status' in patch) row.status = patch.status;
  if (Object.keys(row).length === 0) return getEpisode(episodeId);

  const updated = unwrap(
    await supabaseAdmin().from('survivor_episodes').update(row).eq('id', episodeId).select('*').single(),
    'updateEpisode',
  ) as EpisodeRow;
  return toEpisode(updated);
}

export async function updateQuestion(
  questionId: string,
  patch: Partial<{ prompt: string; helpText: string | null; points: number; sortOrder: number; isRequired: boolean }>,
) {
  const row: Record<string, unknown> = {};
  if ('prompt' in patch) row.prompt = patch.prompt;
  if ('helpText' in patch) row.help_text = patch.helpText;
  if ('points' in patch) row.points = patch.points;
  if ('sortOrder' in patch) row.sort_order = patch.sortOrder;
  if ('isRequired' in patch) row.is_required = patch.isRequired;
  if (Object.keys(row).length === 0) return;

  const updated = await supabaseAdmin().from('survivor_questions').update(row).eq('id', questionId);
  if (updated.error) throw new Error(`updateQuestion: ${updated.error.message}`);
}

export type NewQuestionOptions =
  | { source: 'castaways' }
  | { source: 'yes_no' }
  | { source: 'custom'; values: string[] };

/**
 * Adds a one-off question to an episode. It gets its own `custom_…` scoring key derived from the
 * prompt, so its answer key is separate from every built-in bucket and from other custom
 * questions. Castaway options are snapshotted from whoever is still playing, like generated ones.
 */
export async function addQuestion(
  episode: Episode,
  existing: Pick<Question, 'questionKey' | 'sortOrder'>[],
  input: {
    prompt: string;
    helpText: string | null;
    points: number;
    isRequired: boolean;
    options: NewQuestionOptions;
  },
) {
  const db = supabaseAdmin();

  let labels: string[];
  if (input.options.source === 'castaways') {
    labels = (await listSurvivors(episode.seasonId, episode.episodeNumber)).map((c) => c.shortName);
  } else if (input.options.source === 'yes_no') {
    labels = ['Yes', 'No'];
  } else {
    labels = [...new Set(input.options.values.map((v) => v.trim()).filter(Boolean))];
  }
  if (labels.length < 2) throw new ValidationError('A question needs at least two options.');

  const slug =
    input.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40)
      .replace(/_+$/, '') || 'question';
  const taken = new Set(existing.map((q) => q.questionKey));
  let key = `${CUSTOM_KEY_PREFIX}${slug}`;
  for (let n = 2; taken.has(key); n++) key = `${CUSTOM_KEY_PREFIX}${slug}_${n}`;

  const row = unwrap(
    await db
      .from('survivor_questions')
      .insert({
        episode_id: episode.id,
        question_key: key,
        scoring_key: key,
        prompt: input.prompt,
        help_text: input.helpText,
        // Long lists read better as a dropdown; a handful of choices as buttons.
        input_type: input.options.source === 'castaways' ? 'select' : 'radio',
        points: input.points,
        sort_order: Math.max(-1, ...existing.map((q) => q.sortOrder)) + 1,
        is_required: input.isRequired,
      })
      .select('id')
      .single(),
    'addQuestion',
  ) as { id: string };

  const inserted = await db.from('survivor_question_options').insert(
    labels.map((label, i) => ({ question_id: row.id, value: label, label, sort_order: i })),
  );
  if (inserted.error) {
    await db.from('survivor_questions').delete().eq('id', row.id);
    throw new Error(`addQuestion/options: ${inserted.error.message}`);
  }
  return row.id;
}

export async function deleteQuestion(questionId: string) {
  const removed = await supabaseAdmin().from('survivor_questions').delete().eq('id', questionId);
  if (removed.error) throw new Error(`deleteQuestion: ${removed.error.message}`);
}

export async function getAnswerKey(episodeId: string) {
  const rows = unwrap(
    await supabaseAdmin()
      .from('survivor_answer_key')
      .select('scoring_key, value')
      .eq('episode_id', episodeId),
    'getAnswerKey',
  ) as { scoring_key: QuestionScoringKey; value: string }[];

  const grouped: Partial<Record<QuestionScoringKey, string[]>> = {};
  for (const row of rows) (grouped[row.scoring_key] ??= []).push(row.value);
  return grouped;
}

/**
 * Replaces an episode's answer key wholesale. Correcting a mistake has to be able to *remove* a
 * value, not just add one, so this clears first rather than upserting.
 */
export async function saveAnswerKey(
  episodeId: string,
  entries: Partial<Record<QuestionScoringKey, string[]>>,
) {
  const db = supabaseAdmin();
  const cleared = await db.from('survivor_answer_key').delete().eq('episode_id', episodeId);
  if (cleared.error) throw new Error(`saveAnswerKey/clear: ${cleared.error.message}`);

  const rows = Object.entries(entries).flatMap(([scoringKey, values]) =>
    (values ?? [])
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((value) => ({ episode_id: episodeId, scoring_key: scoringKey, value })),
  );
  if (rows.length === 0) return;

  const inserted = await db
    .from('survivor_answer_key')
    .upsert(rows, { onConflict: 'episode_id,scoring_key,value' });
  if (inserted.error) throw new Error(`saveAnswerKey/insert: ${inserted.error.message}`);
}

/**
 * Records who went home. This is what shrinks next week's dropdown and next week's point values,
 * so it is kept as its own explicit step rather than inferred from the answer key.
 */
export async function markEliminated(
  seasonId: string,
  episodeNumber: number,
  shortNames: string[],
) {
  const db = supabaseAdmin();
  const all = await listCastaways(seasonId);

  // Clearing first means un-eliminating someone is just a matter of re-saving without them.
  const previouslyMarked = all.filter((c) => c.eliminatedEpisode === episodeNumber);
  for (const castaway of previouslyMarked) {
    if (shortNames.includes(castaway.shortName)) continue;
    const cleared = await db
      .from('survivor_castaways')
      .update({ eliminated_episode: null, finish_place: null })
      .eq('id', castaway.id);
    if (cleared.error) throw new Error(`markEliminated/clear: ${cleared.error.message}`);
  }

  // Finish places count down from however many were still playing this week.
  const remainingBefore = all.filter(
    (c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= episodeNumber,
  ).length;

  let place = remainingBefore;
  for (const shortName of shortNames) {
    const castaway = all.find((c) => c.shortName === shortName);
    if (!castaway) throw new ValidationError(`No castaway named "${shortName}" in this season.`);
    const updated = await db
      .from('survivor_castaways')
      .update({ eliminated_episode: episodeNumber, finish_place: place })
      .eq('id', castaway.id);
    if (updated.error) throw new Error(`markEliminated: ${updated.error.message}`);
    place -= 1;
  }
}

export async function setSeasonWinner(seasonId: string, shortName: string | null) {
  const updated = unwrap(
    await supabaseAdmin()
      .from('survivor_seasons')
      .update({ winner_short_name: shortName, status: shortName ? 'complete' : 'active' })
      .eq('id', seasonId)
      .select('*')
      .single(),
    'setSeasonWinner',
  ) as SeasonRow;
  return toSeason(updated);
}

/** Everyone who has picked in this episode, for the admin's "who's still missing?" view. */
export async function listEpisodeSubmissions(episodeId: string) {
  const db = supabaseAdmin();
  const rows = unwrap(
    await db
      .from('survivor_submissions')
      .select('id, user_id, submitted_at')
      .eq('episode_id', episodeId)
      .order('submitted_at', { ascending: true }),
    'listEpisodeSubmissions',
  ) as { id: string; user_id: string; submitted_at: string }[];

  const users = await listUsers();
  const nameById = new Map(users.map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    displayName: nameById.get(r.user_id) ?? 'Unknown',
    submittedAt: r.submitted_at,
  }));
}

// -- season setup -------------------------------------------------------------------------------

export interface TribeInput {
  name: string;
  label: string;
  color: string | null;
}

export interface CastawayInput {
  shortName: string;
  fullName: string | null;
  tribe: string | null;
}

/**
 * Stands up a new season. The roster is the important part: it is simultaneously the dropdown
 * options and, through how many are left, the point values — so a season with no castaways cannot
 * generate a form at all, and that is caught here rather than at 8pm on a Wednesday.
 */
export async function createSeason(input: {
  number: number;
  name: string;
  wikiUrl?: string | null;
  mergeEpisode?: number | null;
  finaleEpisode?: number | null;
  tribes: TribeInput[];
  castaways: CastawayInput[];
  makeActive?: boolean;
}) {
  const db = supabaseAdmin();

  if (input.castaways.length === 0) {
    throw new ValidationError('A season needs at least one castaway.');
  }

  const duplicates = input.castaways
    .map((c) => c.shortName.trim().toLowerCase())
    .filter((name, i, all) => all.indexOf(name) !== i);
  if (duplicates.length > 0) {
    // Short names are how picks are matched, so two identical ones would make scoring ambiguous.
    throw new ValidationError(
      `Duplicate castaway names: ${[...new Set(duplicates)].join(', ')}. ` +
        'Short names are how picks are matched, so each has to be unique.',
    );
  }

  const existing = await getSeasonByNumber(input.number);
  if (existing) throw new ConflictError(`Season ${input.number} already exists.`);

  const tribeByName = new Map(input.tribes.map((t) => [t.name.toLowerCase(), t]));

  const season = unwrap(
    await db
      .from('survivor_seasons')
      .insert({
        number: input.number,
        name: input.name,
        status: input.makeActive === false ? 'upcoming' : 'active',
        merge_episode: input.mergeEpisode ?? null,
        finale_episode: input.finaleEpisode ?? null,
        starting_castaway_count: input.castaways.length,
        wiki_url: input.wikiUrl ?? null,
      })
      .select('*')
      .single(),
    'createSeason',
  ) as SeasonRow;

  const inserted = await db.from('survivor_castaways').insert(
    input.castaways.map((c, i) => {
      const tribe = c.tribe ? tribeByName.get(c.tribe.toLowerCase()) : undefined;
      return {
        season_id: season.id,
        short_name: c.shortName.trim(),
        full_name: c.fullName?.trim() || null,
        tribe: tribe?.name ?? c.tribe ?? null,
        tribe_label: tribe?.label ?? c.tribe ?? null,
        tribe_color: tribe?.color ?? null,
        sort_order: i,
      };
    }),
  );
  if (inserted.error) throw new Error(`createSeason/castaways: ${inserted.error.message}`);

  // Only one season can be the one the site defaults to.
  if (input.makeActive !== false) {
    const demoted = await db
      .from('survivor_seasons')
      .update({ status: 'complete' })
      .eq('status', 'active')
      .neq('id', season.id);
    if (demoted.error) throw new Error(`createSeason/demote: ${demoted.error.message}`);
  }

  return { season: toSeason(season), castaways: input.castaways.length };
}

export async function updateSeason(
  seasonId: string,
  patch: Partial<{
    name: string;
    status: SeasonStatus;
    mergeEpisode: number | null;
    finaleEpisode: number | null;
    wikiUrl: string | null;
  }>,
) {
  const row: Record<string, unknown> = {};
  if ('name' in patch) row.name = patch.name;
  if ('status' in patch) row.status = patch.status;
  if ('mergeEpisode' in patch) row.merge_episode = patch.mergeEpisode;
  if ('finaleEpisode' in patch) row.finale_episode = patch.finaleEpisode;
  if ('wikiUrl' in patch) row.wiki_url = patch.wikiUrl;
  if (Object.keys(row).length === 0) return null;

  const updated = unwrap(
    await supabaseAdmin().from('survivor_seasons').update(row).eq('id', seasonId).select('*').single(),
    'updateSeason',
  ) as SeasonRow;
  return toSeason(updated);
}

import 'server-only';
import { supabaseAdmin } from '../supabase-server';
import { ValidationError } from '../errors';
import {
  findOrCreateUser,
  generateNextEpisode,
  getEpisodeForm,
  getLeaderboard,
  getSeasonByNumber,
  isAcceptingPicks,
  listCastaways,
  listEpisodes,
  markEliminated,
  rescoreSeason,
  saveAnswerKey,
  saveSubmission,
  setSeasonWinner,
  updateEpisode,
  createSeason,
} from '../db';
import { isCustomKey, type Episode, type QuestionScoringKey, type Season, type ScoringKey } from '../types';
import { parseRecapText, type ParsedRecap } from './recap';
import { expectScores, type ExpectedParticipant } from './verify';
import {
  DEBUG_CASTAWAYS,
  DEBUG_FINALE_EPISODE,
  DEBUG_MERGE_EPISODE,
  DEBUG_PARTICIPANTS,
  DEBUG_SEASON_NAME,
  DEBUG_SEASON_NUMBER,
  DEBUG_TRIBES,
} from './config';

/**
 * The four debug operations. Each one drives the same `lib/db` functions the real admin screens
 * use — the point is to exercise the production path, not a parallel one, so a bug in generation
 * or scoring shows up here rather than being routed around.
 *
 * Two rules hold throughout:
 *
 * - Nothing touches a season other than number 999. In particular the debug season is created
 *   *inactive*, because `createSeason` demotes whatever is currently active, and quietly ending
 *   the real pool's season would be a far worse bug than anything this is meant to catch.
 * - Every row written is reachable from either the debug season or the fixed participant list,
 *   which is what makes cleanup total.
 */

// -- deterministic picks --------------------------------------------------------------------------

/**
 * Which option a given participant chooses for a given question.
 *
 * Deterministic on purpose: a debug run should produce the same leaderboard every time, so a
 * number that changes between runs is a real defect rather than the fixture reshuffling. Walking
 * participants and questions diagonally across the option list spreads the picks out, so each
 * question gets several different answers rather than everyone choosing the same name.
 */
const pickIndex = (participantIndex: number, questionIndex: number, optionCount: number) =>
  (participantIndex + questionIndex) % optionCount;

/**
 * The option debug mode will later declare to be the truth for a question.
 *
 * Offset so that a *different* participant is right on each question — that is what makes the
 * resulting leaderboard worth checking. With picks at `(p + q)` and truth at `(2q + 1)`, the
 * winner of question q is participant `q + 1`, so nobody sweeps and nobody is shut out.
 */
const truthIndex = (questionIndex: number, optionCount: number) =>
  (questionIndex * 2 + 1) % optionCount;

// -- season ---------------------------------------------------------------------------------------

export async function getDebugSeason(): Promise<Season | null> {
  return getSeasonByNumber(DEBUG_SEASON_NUMBER);
}

async function requireDebugSeason(): Promise<Season> {
  const season = await getDebugSeason();
  if (!season) {
    throw new ValidationError('There is no debug season yet. Press "Generate season" first.');
  }
  return season;
}

export interface GenerateSeasonResult {
  season: Season;
  castaways: number;
  replacedExisting: boolean;
}

/**
 * Stands up the debug season from scratch. An existing one is removed first rather than reused:
 * a half-scored season left over from a previous run would make the next run's numbers impossible
 * to reason about, and re-running is the normal way to use this.
 */
export async function generateDebugSeason(): Promise<GenerateSeasonResult> {
  const existing = await getDebugSeason();
  if (existing) await deleteDebugSeasonRows(existing.id);

  const { season } = await createSeason({
    number: DEBUG_SEASON_NUMBER,
    name: DEBUG_SEASON_NAME,
    mergeEpisode: DEBUG_MERGE_EPISODE,
    finaleEpisode: DEBUG_FINALE_EPISODE,
    tribes: DEBUG_TRIBES.map((t) => ({ name: t.name, label: t.label, color: t.color })),
    castaways: DEBUG_CASTAWAYS.map((c) => ({
      shortName: c.shortName,
      fullName: c.fullName,
      tribe: c.tribe,
    })),
    // Critical: leaves the real season active. The debug season is reachable by direct link only.
    makeActive: false,
  });

  return { season, castaways: DEBUG_CASTAWAYS.length, replacedExisting: !!existing };
}

// -- episode + submissions ------------------------------------------------------------------------

export interface GenerateEpisodeResult {
  episode: Episode;
  shape: string;
  remaining: number;
  questions: { id: string; questionKey: string; prompt: string; points: number; options: number }[];
  submissions: { displayName: string; answers: Record<string, string> }[];
  /** A recap the scoring step can be run against as-is; the admin can edit it first. */
  suggestedRecapText: string;
  totalPointsOnTable: number;
  formUrl: string;
}

/**
 * Generates the next debug episode, opens it for picks, and files a submission for every template
 * participant.
 *
 * The submissions go through `saveSubmission`, the same call the public form uses, and each chosen
 * value is checked against the question's own option list first — the same check
 * `POST /api/submissions` performs. If the generator ever produced an option that is not
 * selectable, this throws instead of quietly filing an unscoreable pick.
 */
export async function generateDebugEpisode(opts?: {
  includeSecondVoteOut?: boolean;
}): Promise<GenerateEpisodeResult> {
  const season = await requireDebugSeason();

  // Three days out, so the episode is genuinely open and the deadline formatting is exercised.
  const airDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { episode: draft, shape, remaining } = await generateNextEpisode(season, {
    airDate,
    title: null,
    includeSecondVoteOut: opts?.includeSecondVoteOut,
  });

  // The documented workflow, step by step, rather than jumping straight to `open`.
  await updateEpisode(draft.id, { status: 'approved' });
  const episode = await updateEpisode(draft.id, { status: 'open' });
  if (!episode) throw new Error('Debug episode vanished while opening it.');

  const form = await getEpisodeForm(episode.id);
  if (!form || form.questions.length === 0) {
    throw new Error('The generated debug form has no questions.');
  }
  if (!isAcceptingPicks(episode)) {
    throw new Error('The generated debug episode is not accepting picks; check its lock time.');
  }

  const submissions: GenerateEpisodeResult['submissions'] = [];

  for (const [participantIndex, displayName] of DEBUG_PARTICIPANTS.entries()) {
    const answers: Record<string, string> = {};

    form.questions.forEach((question, questionIndex) => {
      if (question.options.length === 0) return;
      const option = question.options[pickIndex(participantIndex, questionIndex, question.options.length)];
      if (!question.options.some((o) => o.value === option.value)) {
        throw new Error(`Debug pick "${option.value}" is not an option for "${question.prompt}".`);
      }
      answers[question.id] = option.value;
    });

    const missing = form.questions.filter((q) => q.isRequired && !answers[q.id]);
    if (missing.length > 0) {
      throw new Error(
        `Debug form has required questions with no options: ${missing.map((q) => q.prompt).join(', ')}`,
      );
    }

    const user = await findOrCreateUser(displayName);
    await saveSubmission({ episodeId: episode.id, userId: user.id, answers });
    submissions.push({ displayName, answers });
  }

  return {
    episode,
    shape,
    remaining,
    questions: form.questions.map((q) => ({
      id: q.id,
      questionKey: q.questionKey,
      prompt: q.prompt,
      points: q.points,
      options: q.options.length,
    })),
    submissions,
    suggestedRecapText: buildRecapText(form.questions),
    totalPointsOnTable: form.questions.reduce((sum, q) => sum + q.points, 0),
    formUrl: `/episodic-picks?episode=${episode.id}`,
  };
}

/** Writes the "truth" for each question out as the kind of prose the parser has to cope with. */
function buildRecapText(
  questions: { questionKey: string; scoringKey: QuestionScoringKey; options: { value: string }[] }[],
): string {
  const LABELS: Record<ScoringKey, string> = {
    losing_tribe: 'Losing tribe',
    win_immunity: 'Immunity winner',
    play_advantage: 'Advantage played',
    play_idol: 'Idol played',
    play_sitd: 'Shot in the dark',
    voted_out: 'Voted out',
    hidden_idol: 'Idol found',
    season_winner: 'Season winner',
  };

  const lines: string[] = ['Debug episode recap', ''];
  const seen = new Set<QuestionScoringKey>();

  questions.forEach((question, index) => {
    if (question.options.length === 0) return;
    // A second vote-out slot shares its scoring key with the first; one line covers both.
    if (seen.has(question.scoringKey)) return;
    // Left out on purpose: the season winner is a season-level fact, declared separately below.
    if (question.scoringKey === 'season_winner') return;
    // The recap parser only knows the built-in labels; custom questions are graded by hand.
    if (isCustomKey(question.scoringKey)) return;
    seen.add(question.scoringKey);
    lines.push(
      `${LABELS[question.scoringKey]}: ${question.options[truthIndex(index, question.options.length)].value}`,
    );
  });

  lines.push(
    '',
    '# Uncomment to end the season and grade every week\'s season-winner pick at once:',
    `# Season winner: ${questions.find((q) => q.scoringKey === 'season_winner')?.options[0]?.value ?? 'Ada'}`,
  );
  return lines.join('\n');
}

// -- scoring --------------------------------------------------------------------------------------

export interface ScoreResult {
  episode: Episode;
  parsed: ParsedRecap;
  expected: ExpectedParticipant[];
  actual: { displayName: string; episodePoints: number; seasonTotal: number }[];
  /** Empty when the pipeline agrees with the independent check — that is the pass condition. */
  mismatches: { displayName: string; expected: number; actual: number }[];
  seasonWinnerApplied: string | null;
  leaderboardUrl: string;
}

/**
 * Scores the most recent debug episode from a block of recap text.
 *
 * The sequence is exactly the admin's: record the answer key, record who went home (which is what
 * shrinks next week's dropdown and its point values), move the episode to scored, and re-run the
 * season. The result is then compared against `expectScores`, which derives the same numbers
 * independently — so this reports agreement or disagreement, not just "it ran".
 */
export async function scoreDebugEpisode(recapText: string): Promise<ScoreResult> {
  const season = await requireDebugSeason();

  const episodes = await listEpisodes(season.id);
  const target = [...episodes].reverse().find((e) => e.status !== 'draft') ?? episodes.at(-1);
  if (!target) {
    throw new ValidationError('There is no debug episode to score. Generate a form first.');
  }

  const castaways = await listCastaways(season.id);
  const tribeLabels = [...new Set(castaways.map((c) => c.tribeLabel).filter(Boolean))] as string[];

  const parsed = parseRecapText(recapText, {
    castaways: castaways.map((c) => ({ shortName: c.shortName, fullName: c.fullName })),
    tribeLabels,
  });

  if (Object.keys(parsed.answerKey).length === 0) {
    throw new ValidationError(
      'Nothing in that text was recognised as a result. Lines need to read like "Voted out: Ada".',
    );
  }

  const form = await getEpisodeForm(target.id);
  if (!form) throw new Error('The debug episode has no form.');

  // Declaring a winner is the season's biggest scoring event, so it is applied before the rescore
  // rather than left for a second pass. Never called with null: that would flip the debug season
  // to active and take the real season's place on the public pages.
  let seasonWinnerApplied: string | null = null;
  const declaredWinner = parsed.answerKey.season_winner?.[0] ?? null;
  if (declaredWinner) {
    await setSeasonWinner(season.id, declaredWinner);
    seasonWinnerApplied = declaredWinner;
  }

  const forKey: Partial<Record<ScoringKey, string[]>> = { ...parsed.answerKey };
  delete forKey.season_winner;
  await saveAnswerKey(target.id, forKey);

  if (parsed.eliminated.length > 0) {
    await markEliminated(season.id, target.episodeNumber, parsed.eliminated);
  }

  if (target.status === 'open') await updateEpisode(target.id, { status: 'locked' });
  const episode = (await updateEpisode(target.id, { status: 'scored' })) ?? target;

  const refreshed = (await getSeasonByNumber(DEBUG_SEASON_NUMBER)) ?? season;
  await rescoreSeason(refreshed);

  // -- independent check --------------------------------------------------------------------------

  const db = supabaseAdmin();
  const submissionRows = (await db
    .from('survivor_submissions')
    .select('id, user_id')
    .eq('episode_id', target.id)).data as { id: string; user_id: string }[] | null;

  const submissions = submissionRows ?? [];
  const userIds = submissions.map((s) => s.user_id);

  const userRows = userIds.length
    ? ((await db.from('survivor_users').select('id, display_name').in('id', userIds)).data as
        | { id: string; display_name: string }[]
        | null) ?? []
    : [];
  const nameById = new Map(userRows.map((u) => [u.id, u.display_name]));

  const answerRows = submissions.length
    ? ((await db
        .from('survivor_answers')
        .select('submission_id, question_id, value')
        .in('submission_id', submissions.map((s) => s.id))).data as
        | { submission_id: string; question_id: string; value: string }[]
        | null) ?? []
    : [];

  const picks: Record<string, Record<string, string>> = {};
  for (const submission of submissions) {
    const name = nameById.get(submission.user_id) ?? submission.user_id;
    picks[name] = {};
  }
  for (const answer of answerRows) {
    const submission = submissions.find((s) => s.id === answer.submission_id);
    if (!submission) continue;
    const name = nameById.get(submission.user_id) ?? submission.user_id;
    (picks[name] ??= {})[answer.question_id] = answer.value;
  }

  const expected = expectScores({
    questions: form.questions.map((q) => ({
      id: q.id,
      questionKey: q.questionKey,
      scoringKey: q.scoringKey,
      points: q.points,
      sortOrder: q.sortOrder,
    })),
    picks,
    answerKey: forKey,
    seasonWinner: seasonWinnerApplied ?? refreshed.winnerCastawayName,
  });

  const scoreRows = submissions.length
    ? ((await db
        .from('survivor_scores')
        .select('submission_id, points_awarded')
        .in('submission_id', submissions.map((s) => s.id))).data as
        | { submission_id: string; points_awarded: number }[]
        | null) ?? []
    : [];

  const episodePointsByName = new Map<string, number>();
  for (const submission of submissions) {
    episodePointsByName.set(nameById.get(submission.user_id) ?? submission.user_id, 0);
  }
  for (const row of scoreRows) {
    const submission = submissions.find((s) => s.id === row.submission_id);
    if (!submission) continue;
    const name = nameById.get(submission.user_id) ?? submission.user_id;
    episodePointsByName.set(name, (episodePointsByName.get(name) ?? 0) + row.points_awarded);
  }

  const leaderboard = await getLeaderboard(refreshed);
  const seasonTotalByName = new Map(leaderboard.entries.map((e) => [e.displayName, e.total]));

  const actual = [...episodePointsByName.entries()].map(([displayName, episodePoints]) => ({
    displayName,
    episodePoints,
    seasonTotal: seasonTotalByName.get(displayName) ?? 0,
  }));

  const mismatches = expected
    .map((row) => ({
      displayName: row.displayName,
      expected: row.total,
      actual: episodePointsByName.get(row.displayName) ?? 0,
    }))
    .filter((row) => row.expected !== row.actual);

  return {
    episode,
    parsed,
    expected,
    actual: actual.sort((a, b) => b.episodePoints - a.episodePoints),
    mismatches,
    seasonWinnerApplied,
    leaderboardUrl: `/archive/season/${DEBUG_SEASON_NUMBER}`,
  };
}

// -- cleanup ----------------------------------------------------------------------------------------

/** Deletes a debug season. Everything below it cascades; this is also the reset path. */
async function deleteDebugSeasonRows(seasonId: string) {
  const removed = await supabaseAdmin().from('survivor_seasons').delete().eq('id', seasonId);
  if (removed.error) throw new Error(`debug cleanup/season: ${removed.error.message}`);
}

export interface CleanupResult {
  deleted: {
    seasons: number;
    castaways: number;
    episodes: number;
    questions: number;
    submissions: number;
    answers: number;
    scores: number;
    answerKeyRows: number;
    users: number;
  };
  /** Anything still present after the delete. A clean run reports an empty list. */
  remaining: string[];
}

/**
 * Removes every row debug mode created, and proves it.
 *
 * Deletion is by season id and by exact participant name — never by a name pattern. A
 * `LIKE 'Debug%'` would be one typo away from matching a real player, and this runs against the
 * same database the pool uses.
 */
export async function cleanupDebugData(): Promise<CleanupResult> {
  const db = supabaseAdmin();
  const season = await getDebugSeason();

  const counts = {
    seasons: 0,
    castaways: 0,
    episodes: 0,
    questions: 0,
    submissions: 0,
    answers: 0,
    scores: 0,
    answerKeyRows: 0,
    users: 0,
  };

  if (season) {
    // Counted before the delete, since the cascade makes them unreachable afterwards.
    const episodes = await listEpisodes(season.id);
    const episodeIds = episodes.map((e) => e.id);
    counts.seasons = 1;
    counts.episodes = episodes.length;
    counts.castaways = (await listCastaways(season.id)).length;

    if (episodeIds.length > 0) {
      const questionIds =
        ((await db.from('survivor_questions').select('id').in('episode_id', episodeIds)).data as
          | { id: string }[]
          | null) ?? [];
      counts.questions = questionIds.length;

      counts.answerKeyRows =
        (((await db.from('survivor_answer_key').select('id').in('episode_id', episodeIds)).data as
          | { id: string }[]
          | null) ?? []).length;

      const submissionIds =
        ((await db.from('survivor_submissions').select('id').in('episode_id', episodeIds)).data as
          | { id: string }[]
          | null) ?? [];
      counts.submissions = submissionIds.length;

      if (submissionIds.length > 0) {
        const ids = submissionIds.map((s) => s.id);
        counts.answers =
          (((await db.from('survivor_answers').select('id').in('submission_id', ids)).data as
            | { id: string }[]
            | null) ?? []).length;
        counts.scores =
          (((await db.from('survivor_scores').select('id').in('submission_id', ids)).data as
            | { id: string }[]
            | null) ?? []).length;
      }
    }

    await deleteDebugSeasonRows(season.id);
  }

  const debugUsers =
    ((await db
      .from('survivor_users')
      .select('id, display_name')
      .in('display_name', [...DEBUG_PARTICIPANTS])).data as
      | { id: string; display_name: string }[]
      | null) ?? [];

  if (debugUsers.length > 0) {
    const removed = await db
      .from('survivor_users')
      .delete()
      .in('id', debugUsers.map((u) => u.id));
    if (removed.error) throw new Error(`debug cleanup/users: ${removed.error.message}`);
    counts.users = debugUsers.length;
  }

  // Read back rather than trust the deletes: "it returned no error" is not the same as "it's gone".
  const remaining: string[] = [];

  const seasonLeft = await getDebugSeason();
  if (seasonLeft) remaining.push(`Season ${seasonLeft.number} still exists.`);

  const usersLeft =
    ((await db
      .from('survivor_users')
      .select('display_name')
      .in('display_name', [...DEBUG_PARTICIPANTS])).data as { display_name: string }[] | null) ?? [];
  if (usersLeft.length > 0) {
    remaining.push(`Debug participants still present: ${usersLeft.map((u) => u.display_name).join(', ')}.`);
  }

  return { deleted: counts, remaining };
}

/** What the panel shows on load: how much dummy data is currently sitting in the database. */
export interface DebugStatus {
  season: Season | null;
  episodes: { id: string; episodeNumber: number; status: string; questions: number }[];
  participants: { displayName: string; exists: boolean }[];
}

export async function debugStatus(): Promise<DebugStatus> {
  const season = await getDebugSeason();
  const db = supabaseAdmin();

  const users =
    ((await db
      .from('survivor_users')
      .select('display_name')
      .in('display_name', [...DEBUG_PARTICIPANTS])).data as { display_name: string }[] | null) ?? [];
  const present = new Set(users.map((u) => u.display_name.toLowerCase()));

  let episodes: DebugStatus['episodes'] = [];
  if (season) {
    const list = await listEpisodes(season.id);
    const counts = new Map<string, number>();
    if (list.length > 0) {
      const rows =
        ((await db
          .from('survivor_questions')
          .select('episode_id')
          .in('episode_id', list.map((e) => e.id))).data as { episode_id: string }[] | null) ?? [];
      for (const row of rows) counts.set(row.episode_id, (counts.get(row.episode_id) ?? 0) + 1);
    }
    episodes = list.map((e) => ({
      id: e.id,
      episodeNumber: e.episodeNumber,
      status: e.status,
      questions: counts.get(e.id) ?? 0,
    }));
  }

  return {
    season,
    episodes,
    participants: DEBUG_PARTICIPANTS.map((displayName) => ({
      displayName,
      exists: present.has(displayName.toLowerCase()),
    })),
  };
}

/** Re-exported so route handlers can reference the episode type without a second import path. */
export type { Episode };

import type { Answer, AnswerKeyEntry, Episode, Question, ScoringKey, Submission } from './types';
import { SCORING_KEYS } from './types';

/**
 * The scoring engine. Deliberately pure — no database, no fetch — so the whole of Season 50 can be
 * replayed from a fixture in a unit test and checked against the original spreadsheet's Standings
 * tab. Everything that touches Supabase lives in the API layer and hands data to this function.
 */

/** Answer-key values meaning "this didn't happen" — nobody scores against them. */
const NULL_ANSWERS = new Set(['n/a', 'na', 'none', '']);

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

export interface ScoreRow {
  submissionId: string;
  questionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface LeaderboardRow {
  userId: string;
  total: number;
  /** Points earned per category, e.g. how many points came from voted-out picks all season. */
  byCategory: Record<ScoringKey, number>;
  /** Points earned per episode number, keyed by episode number rather than id for display. */
  byEpisode: Record<number, number>;
  /** The retroactive season-winner sweep, broken out because it lands all at once at season end. */
  seasonWinnerPoints: number;
}

export interface ScoreSeasonInput {
  episodes: Pick<Episode, 'id' | 'episodeNumber'>[];
  questions: Pick<Question, 'id' | 'episodeId' | 'scoringKey' | 'points' | 'sortOrder'>[];
  answerKey: AnswerKeyEntry[];
  submissions: Pick<Submission, 'id' | 'episodeId' | 'userId'>[];
  answers: Answer[];
  /**
   * The eventual Sole Survivor's short name, or null while the season is still running. Every
   * week's "Who will win the season?" pick stays worth zero until this is known, then all of them
   * are graded at once — repeats allowed, each paying that week's rate.
   */
  seasonWinnerShortName: string | null;
}

export interface ScoreSeasonResult {
  rows: ScoreRow[];
  byUser: LeaderboardRow[];
}

const emptyCategories = (): Record<ScoringKey, number> =>
  Object.fromEntries(SCORING_KEYS.map((k) => [k, 0])) as Record<ScoringKey, number>;

export function scoreSeason(input: ScoreSeasonInput): ScoreSeasonResult {
  const { episodes, questions, answerKey, submissions, answers, seasonWinnerShortName } = input;

  const episodeNumberById = new Map(episodes.map((e) => [e.id, e.episodeNumber]));
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const submissionById = new Map(submissions.map((s) => [s.id, s]));

  // Accepted values per (episode, scoringKey). A bucket can hold several values: Ep 5 sent two
  // people home and Ep 6 had three immunity winners, and naming any one of them scores.
  const accepted = new Map<string, Set<string>>();
  for (const entry of answerKey) {
    const value = normalize(entry.value);
    if (NULL_ANSWERS.has(value)) continue;
    const bucket = `${entry.episodeId}::${entry.scoringKey}`;
    let set = accepted.get(bucket);
    if (!set) accepted.set(bucket, (set = new Set()));
    set.add(value);
  }

  // The season winner overrides whatever the answer key says: it is a season-level fact, and it
  // grades every episode's pick at once rather than being decided week by week.
  const winner = normalize(seasonWinnerShortName);
  const winnerKnown = winner !== '' && !NULL_ANSWERS.has(winner);

  const answersBySubmission = new Map<string, Answer[]>();
  for (const answer of answers) {
    const list = answersBySubmission.get(answer.submissionId);
    if (list) list.push(answer);
    else answersBySubmission.set(answer.submissionId, [answer]);
  }

  const rows: ScoreRow[] = [];
  const byUser = new Map<string, LeaderboardRow>();

  for (const submission of submissions) {
    const submissionAnswers = answersBySubmission.get(submission.id) ?? [];

    // Grade in the order the questions were asked, so that when a duplicate pick has to be
    // dropped it is always the later slot that loses out rather than whichever row the database
    // happened to return first.
    const ordered = [...submissionAnswers].sort((a, b) => {
      const qa = questionById.get(a.questionId);
      const qb = questionById.get(b.questionId);
      return (qa?.sortOrder ?? 0) - (qb?.sortOrder ?? 0) || a.questionId.localeCompare(b.questionId);
    });

    // Guards against a participant putting the same name in both voted-out slots and being paid
    // twice for one correct guess.
    const alreadyCredited = new Set<string>();

    for (const answer of ordered) {
      const question = questionById.get(answer.questionId);
      if (!question) continue;

      const value = normalize(answer.value);
      const isSeasonWinner = question.scoringKey === 'season_winner';

      let isCorrect: boolean;
      if (isSeasonWinner) {
        isCorrect = winnerKnown && value === winner;
      } else {
        const bucket = accepted.get(`${question.episodeId}::${question.scoringKey}`);
        isCorrect = !!bucket && bucket.has(value);
      }

      const dedupeKey = `${question.scoringKey}::${value}`;
      if (isCorrect && alreadyCredited.has(dedupeKey)) isCorrect = false;
      if (isCorrect) alreadyCredited.add(dedupeKey);

      const pointsAwarded = isCorrect ? question.points : 0;
      rows.push({
        submissionId: submission.id,
        questionId: question.id,
        isCorrect,
        pointsAwarded,
      });

      if (pointsAwarded === 0) continue;

      let row = byUser.get(submission.userId);
      if (!row) {
        row = {
          userId: submission.userId,
          total: 0,
          byCategory: emptyCategories(),
          byEpisode: {},
          seasonWinnerPoints: 0,
        };
        byUser.set(submission.userId, row);
      }

      const episodeNumber = episodeNumberById.get(submission.episodeId);
      row.total += pointsAwarded;
      row.byCategory[question.scoringKey] += pointsAwarded;
      if (episodeNumber !== undefined) {
        row.byEpisode[episodeNumber] = (row.byEpisode[episodeNumber] ?? 0) + pointsAwarded;
      }
      if (isSeasonWinner) row.seasonWinnerPoints += pointsAwarded;
    }
  }

  // Anyone who submitted but never scored still belongs on the leaderboard, on zero.
  for (const submission of submissions) {
    if (byUser.has(submission.userId)) continue;
    byUser.set(submission.userId, {
      userId: submission.userId,
      total: 0,
      byCategory: emptyCategories(),
      byEpisode: {},
      seasonWinnerPoints: 0,
    });
  }

  const ranked = [...byUser.values()].sort(
    (a, b) => b.total - a.total || a.userId.localeCompare(b.userId),
  );

  return { rows, byUser: ranked };
}

/** Dense ranking (ties share a place, the next place is not skipped). */
export function withRanks<T extends { total: number }>(rows: T[]): (T & { rank: number })[] {
  let rank = 0;
  let previousTotal: number | null = null;
  return rows.map((row) => {
    if (previousTotal === null || row.total !== previousTotal) {
      rank += 1;
      previousTotal = row.total;
    }
    return { ...row, rank };
  });
}

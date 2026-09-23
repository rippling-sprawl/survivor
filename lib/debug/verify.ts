import type { QuestionScoringKey } from '../types';

/**
 * An independent restatement of the scoring rules, used only by debug mode.
 *
 * This is deliberately a second implementation rather than a call into `lib/scoring.ts`. Checking
 * the pipeline's output against the same function that produced it proves nothing — it would
 * agree with itself even if the rules were wrong. Written separately and kept simple, a
 * disagreement between the two is a real signal, and it is the signal debug mode reports.
 *
 * It grades one episode, because that is what a debug run scores. Season-wide behaviour (the
 * winner sweep across every week) is left to the real engine.
 */

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** Answer-key values meaning "this did not happen" — the real engine ignores these too. */
const NOTHING = new Set(['n/a', 'na', 'none', '']);

export interface ExpectedLine {
  questionKey: string;
  scoringKey: QuestionScoringKey;
  pick: string | null;
  accepted: string[];
  correct: boolean;
  points: number;
}

export interface ExpectedParticipant {
  displayName: string;
  total: number;
  lines: ExpectedLine[];
}

export interface ExpectScoresInput {
  questions: {
    id: string;
    questionKey: string;
    scoringKey: QuestionScoringKey;
    points: number;
    sortOrder: number;
  }[];
  /** Picks keyed by participant display name, then by question id. */
  picks: Record<string, Record<string, string>>;
  answerKey: Partial<Record<QuestionScoringKey, string[]>>;
  /** Null while the season is still running, which keeps every season-winner pick at zero. */
  seasonWinner: string | null;
}

export function expectScores(input: ExpectScoresInput): ExpectedParticipant[] {
  const { questions, picks, answerKey, seasonWinner } = input;

  const accepted = new Map<string, Set<string>>();
  for (const [key, list] of Object.entries(answerKey)) {
    const values = (list ?? []).map(normalize).filter((v) => !NOTHING.has(v));
    if (values.length > 0) accepted.set(key, new Set(values));
  }

  const winner = normalize(seasonWinner);
  const winnerKnown = winner !== '' && !NOTHING.has(winner);

  const ordered = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);

  return Object.entries(picks).map(([displayName, byQuestion]) => {
    // Mirrors the real engine's rule that one correct name cannot be paid for twice in a week,
    // e.g. the same person entered in both slots of a double elimination.
    const credited = new Set<string>();
    let total = 0;

    const lines = ordered.map((question) => {
      const pick = byQuestion[question.id] ?? null;
      const value = normalize(pick);

      let correct =
        question.scoringKey === 'season_winner'
          ? winnerKnown && value === winner
          : (accepted.get(question.scoringKey)?.has(value) ?? false);

      const dedupeKey = `${question.scoringKey}::${value}`;
      if (correct && credited.has(dedupeKey)) correct = false;
      if (correct) credited.add(dedupeKey);

      const points = correct ? question.points : 0;
      total += points;

      return {
        questionKey: question.questionKey,
        scoringKey: question.scoringKey,
        pick,
        accepted:
          question.scoringKey === 'season_winner'
            ? winnerKnown
              ? [seasonWinner as string]
              : []
            : (answerKey[question.scoringKey] ?? []),
        correct,
        points,
      };
    });

    return { displayName, total, lines };
  });
}

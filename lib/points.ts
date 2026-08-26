import type { ScoringKey } from './types';

/**
 * Point values are not arbitrary — they are derived, which is what makes weekly form generation
 * automatic. Reverse-engineered from the Season 50 "Points Key" tab and confirmed against every
 * episode: the three variable keys are always worth the number of castaways still in the game
 * when the form opens, producing 24, 22, 21, 20, 19, 17, 14, 13, 11, 10, 9, 7, 5 across Eps 1-13.
 *
 * The intuition: correctly naming who goes home is harder the more people are left, so it pays
 * more early and decays as the field shrinks.
 */

/** Keys whose value equals the remaining-castaway count. */
const REMAINING_COUNT_KEYS: ReadonlySet<ScoringKey> = new Set<ScoringKey>([
  'voted_out',
  'win_immunity',
  'season_winner',
]);

/** Keys with a fixed value regardless of how many players are left. */
const FLAT_POINTS: Partial<Record<ScoringKey, number>> = {
  losing_tribe: 10,
  hidden_idol: 20,
  play_advantage: 5,
  play_idol: 5,
  play_sitd: 5,
};

/**
 * The finale breaks the pattern: with three people left, remaining-count scoring would make the
 * whole episode nearly worthless, so Season 50 asked only two questions at 10 points each.
 */
const FINALE_POINTS: Partial<Record<ScoringKey, number>> = {
  win_immunity: 10,
  hidden_idol: 10,
};

export interface PointsContext {
  /** Castaways still in the game when the form opens. */
  remaining: number;
  /** The finale is scored on its own table. */
  isFinale?: boolean;
}

export function pointsFor(key: ScoringKey, ctx: PointsContext): number {
  if (ctx.isFinale) return FINALE_POINTS[key] ?? 0;
  if (REMAINING_COUNT_KEYS.has(key)) return ctx.remaining;
  return FLAT_POINTS[key] ?? 0;
}

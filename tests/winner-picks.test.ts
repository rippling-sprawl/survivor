import { describe, expect, it } from 'vitest';
import type { EpisodePicks } from '../lib/db';
import type { Castaway } from '../lib/types';
import { winnerPickGrid } from '../lib/winner-picks';

function week(points: number, picks: Record<string, string | null>): EpisodePicks {
  return {
    episode: {} as EpisodePicks['episode'],
    questions: [
      { id: 'q1', scoringKey: 'voted_out', heading: 'Voted Out', points: 20 },
      { id: 'q2', scoringKey: 'season_winner', heading: 'Season Winner', points },
    ],
    users: Object.entries(picks).map(([name, label]) => ({
      userId: name,
      displayName: name,
      total: 0,
      picks: [
        { questionId: 'q1', label: 'Rob', isCorrect: false, pointsAwarded: 0, pending: false },
        { questionId: 'q2', label, isCorrect: false, pointsAwarded: 0, pending: true },
      ],
    })),
  };
}

const castaway = (shortName: string, eliminatedEpisode: number | null = null) =>
  ({ shortName, eliminatedEpisode }) as Castaway;

describe('winnerPickGrid', () => {
  it('sums each week’s rate per user and castaway', () => {
    const grid = winnerPickGrid(
      [
        week(20, { Ann: 'Kilby', Bo: 'Jelly' }),
        week(19, { Ann: 'Kilby', Bo: 'Kilby' }),
        week(18, { Ann: 'Jelly', Bo: null }),
      ],
      [castaway('Kilby'), castaway('Jelly', 2), castaway('Eric')],
    );

    expect(grid.columns).toEqual([
      { shortName: 'Kilby', eliminated: false, total: 58 },
      { shortName: 'Jelly', eliminated: true, total: 38 },
    ]);
    expect(grid.rows).toEqual([
      { userId: 'Ann', displayName: 'Ann', points: { Kilby: 39, Jelly: 18 } },
      { userId: 'Bo', displayName: 'Bo', points: { Jelly: 20, Kilby: 19 } },
    ]);
  });

  it('skips weeks without a season-winner question', () => {
    const finale = week(10, { Ann: 'Kilby' });
    finale.questions = finale.questions.slice(0, 1);
    expect(winnerPickGrid([finale], [])).toEqual({ columns: [], rows: [] });
  });
});

import type { EpisodePicks } from './db';
import type { Castaway } from './types';

export interface WinnerPickColumn {
  shortName: string;
  eliminated: boolean;
  /** Everyone's possible points on this castaway combined; orders the columns. */
  total: number;
}

export interface WinnerPickRow {
  userId: string;
  displayName: string;
  /** Possible points per castaway: the sum of each week's rate in which this user named them. */
  points: Record<string, number>;
}

export interface WinnerPickGrid {
  columns: WinnerPickColumn[];
  rows: WinnerPickRow[];
}

/**
 * Who each participant has backed to win, weighted by what those picks would pay if that castaway
 * takes the season. Built from scored weeks only, so an open week's picks stay private.
 *
 * Only castaways somebody actually named get a column; a roster of twenty mostly-empty columns
 * would bury the interesting ones.
 */
export function winnerPickGrid(episodePicks: EpisodePicks[], castaways: Castaway[]): WinnerPickGrid {
  const rowsById = new Map<string, WinnerPickRow>();
  const totals = new Map<string, number>();

  for (const { questions, users } of episodePicks) {
    const index = questions.findIndex((q) => q.scoringKey === 'season_winner');
    if (index === -1) continue;
    const { points } = questions[index];

    for (const user of users) {
      const pick = user.picks[index]?.label;
      if (!pick) continue;
      let row = rowsById.get(user.userId);
      if (!row) {
        row = { userId: user.userId, displayName: user.displayName, points: {} };
        rowsById.set(user.userId, row);
      }
      row.points[pick] = (row.points[pick] ?? 0) + points;
      totals.set(pick, (totals.get(pick) ?? 0) + points);
    }
  }

  const byName = new Map(castaways.map((c) => [c.shortName, c]));
  const columns = [...totals]
    .map(([shortName, total]) => ({
      shortName,
      eliminated: byName.get(shortName)?.eliminatedEpisode != null,
      total,
    }))
    .sort((a, b) => b.total - a.total || a.shortName.localeCompare(b.shortName));

  const rows = [...rowsById.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { columns, rows };
}

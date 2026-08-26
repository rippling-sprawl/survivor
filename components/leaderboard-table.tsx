import type { Leaderboard } from '@/lib/db';
import { CATEGORY_LABELS, SCORING_KEYS } from '@/lib/types';

/**
 * The standings grid, carrying the same information the spreadsheet's Standings tab did: a total,
 * a column per scored episode, and the category subtotals that show *how* someone earned it.
 *
 * It is wide by nature. Rather than hiding columns on small screens, the two identity columns are
 * pinned and the rest scrolls sideways, so a phone can still reach every number.
 */
export function LeaderboardTable({ leaderboard }: { leaderboard: Leaderboard }) {
  const { entries, episodes } = leaderboard;

  if (entries.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        No picks have been submitted yet.
      </p>
    );
  }

  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th className="col-name">Name</th>
            <th className="col-total divider">Total</th>
            {episodes.map((episode) => (
              <th key={episode.id} className={episode.episodeNumber === 1 ? 'divider' : undefined}>
                Ep {episode.episodeNumber}
              </th>
            ))}
            {SCORING_KEYS.map((key, i) => (
              <th key={key} className={i === 0 ? 'divider' : undefined}>
                {CATEGORY_LABELS[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.userId} className={entry.rank === 1 ? 'rank-1' : undefined}>
              <td className="col-rank">{entry.rank}</td>
              <td className="col-name">{entry.displayName}</td>
              <td className="col-total divider">{entry.total}</td>
              {episodes.map((episode, i) => {
                const points = entry.byEpisode[episode.episodeNumber] ?? 0;
                return (
                  <td
                    key={episode.id}
                    className={`${i === 0 ? 'divider ' : ''}${points === 0 ? 'zero' : ''}`}
                  >
                    {points}
                  </td>
                );
              })}
              {SCORING_KEYS.map((key, i) => {
                const points = entry.byCategory[key] ?? 0;
                return (
                  <td
                    key={key}
                    className={`${i === 0 ? 'divider ' : ''}${points === 0 ? 'zero' : ''}`}
                  >
                    {points}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

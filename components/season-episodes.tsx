import type { EpisodePicks } from '@/lib/db';
import type { Episode } from '@/lib/types';
import { StatusBadge } from '@/components/ui';
import { formatAirDate } from '@/lib/format';

/** Every episode in a season with its status, and — once scored — who picked what. */
export function SeasonEpisodes({
  episodes,
  episodePicks,
}: {
  episodes: Episode[];
  episodePicks: EpisodePicks[];
}) {
  const picksByEpisode = new Map(episodePicks.map((p) => [p.episode.id, p]));

  return (
    <section className="card stack">
      <h2>Episodes</h2>
      <ul className="list">
        {episodes.map((episode) => {
          const picks = picksByEpisode.get(episode.id);
          return (
            <li key={episode.id} className="list__item">
              <span>
                <strong>Episode {episode.episodeNumber}</strong>
                {episode.title ? ` — ${episode.title}` : ''}
                {episode.airDate && (
                  <span className="muted small"> &middot; {formatAirDate(episode.airDate)}</span>
                )}
              </span>
              <StatusBadge status={episode.status} />
              {picks && picks.users.length > 0 && <EpisodePicksTable picks={picks} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Who picked what in one scored episode, with each pick marked as paid out or not. */
function EpisodePicksTable({ picks }: { picks: EpisodePicks }) {
  return (
    <details className="episode-picks">
      <summary className="muted small">
        Picks ({picks.users.length} {picks.users.length === 1 ? 'player' : 'players'})
      </summary>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th className="col-name">Name</th>
              <th className="col-total divider">Pts</th>
              {picks.questions.map((question, i) => (
                <th key={question.id} className={i === 0 ? 'divider' : undefined}>
                  {question.heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {picks.users.map((user) => (
              <tr key={user.userId}>
                <td className="col-name">{user.displayName}</td>
                <td className={`col-total divider${user.total === 0 ? ' zero' : ''}`}>{user.total}</td>
                {user.picks.map((pick, i) => (
                  <td
                    key={pick.questionId}
                    className={`pick${i === 0 ? ' divider' : ''}${
                      pick.isCorrect ? ' pick--correct' : pick.pending ? ' pick--pending' : ' zero'
                    }`}
                  >
                    {pick.label ?? '—'}
                    {pick.isCorrect && <span className="points"> +{pick.pointsAwarded}</span>}
                    {pick.pending && <span className="small"> (pending)</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getLeaderboard,
  getScoredEpisodePicks,
  getSeasonByNumber,
  listCastaways,
  listEpisodes,
  type EpisodePicks,
} from '@/lib/db';
import { LeaderboardTable } from '@/components/leaderboard-table';
import { SetupNotice } from '@/components/setup-notice';
import { StatusBadge } from '@/components/ui';
import { formatAirDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SeasonArchivePage({
  params,
}: {
  params: Promise<{ seasonNumber: string }>;
}) {
  const { seasonNumber } = await params;
  const number = Number(seasonNumber);
  if (!Number.isInteger(number)) notFound();

  try {
    const season = await getSeasonByNumber(number);
    if (!season) notFound();

    const [leaderboard, episodes, castaways, episodePicks] = await Promise.all([
      getLeaderboard(season),
      listEpisodes(season.id),
      listCastaways(season.id),
      getScoredEpisodePicks(season),
    ]);
    const picksByEpisode = new Map(episodePicks.map((p) => [p.episode.id, p]));

    const champion = castaways.find((c) => c.shortName === season.winnerCastawayName);
    const winner = leaderboard.entries[0];

    return (
      <div className="page stack">
        <header className="stack" style={{ gap: '0.4rem' }}>
          <p className="muted small" style={{ margin: 0 }}>
            <Link href="/archive">&larr; Archive</Link>
          </p>
          <h1>{season.name}</h1>
          <div className="row">
            {champion && (
              <span className="badge badge--correct">
                Sole Survivor: {champion.fullName ?? champion.shortName}
              </span>
            )}
            {winner && (
              <span className="badge">
                {season.status === 'active' ? 'Pool leader' : 'Pool winner'}: {winner.displayName} &middot; {winner.total} pts
              </span>
            )}
          </div>
        </header>

        <LeaderboardTable leaderboard={leaderboard} />

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

      </div>
    );
  } catch (error) {
    return <SetupNotice error={error} />;
  }
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

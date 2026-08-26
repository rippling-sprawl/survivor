import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeaderboard, getSeasonByNumber, listCastaways, listEpisodes } from '@/lib/db';
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

    const [leaderboard, episodes, castaways] = await Promise.all([
      getLeaderboard(season),
      listEpisodes(season.id),
      listCastaways(season.id),
    ]);

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
                Pool winner: {winner.displayName} &middot; {winner.total} pts
              </span>
            )}
          </div>
        </header>

        <LeaderboardTable leaderboard={leaderboard} />

        <section className="card stack">
          <h2>Episodes</h2>
          <ul className="list">
            {episodes.map((episode) => (
              <li key={episode.id} className="list__item">
                <span>
                  <strong>Episode {episode.episodeNumber}</strong>
                  {episode.title ? ` — ${episode.title}` : ''}
                  {episode.airDate && (
                    <span className="muted small"> &middot; {formatAirDate(episode.airDate)}</span>
                  )}
                </span>
                <StatusBadge status={episode.status} />
              </li>
            ))}
          </ul>
        </section>

        <section className="card stack">
          <h2>Finish order</h2>
          <ul className="list">
            {[...castaways]
              .sort((a, b) => (a.finishPlace ?? 99) - (b.finishPlace ?? 99))
              .map((castaway) => (
                <li key={castaway.id} className="list__item">
                  <span>
                    <strong>{castaway.shortName}</strong>
                    <span className="muted small">
                      {' '}
                      {castaway.fullName} &middot; {castaway.tribeLabel}
                    </span>
                  </span>
                  <span className="muted small">
                    {castaway.eliminatedEpisode
                      ? `Out Ep ${castaway.eliminatedEpisode}`
                      : 'Sole Survivor'}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    );
  } catch (error) {
    return <SetupNotice error={error} />;
  }
}

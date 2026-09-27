import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getLeaderboard,
  getScoredEpisodePicks,
  getSeasonByNumber,
  listCastaways,
  listEpisodes,
} from '@/lib/db';
import { LeaderboardTable } from '@/components/leaderboard-table';
import { SeasonEpisodes } from '@/components/season-episodes';
import { SetupNotice } from '@/components/setup-notice';

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

        <SeasonEpisodes episodes={episodes} episodePicks={episodePicks} />
      </div>
    );
  } catch (error) {
    return <SetupNotice error={error} />;
  }
}

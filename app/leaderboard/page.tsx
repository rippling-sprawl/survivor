import Link from 'next/link';
import { getCurrentSeason, getLeaderboard } from '@/lib/db';
import { LeaderboardTable } from '@/components/leaderboard-table';
import { SetupNotice } from '@/components/setup-notice';
import { Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Leaderboard · Survivor Pick'em" };

export default async function LeaderboardPage() {
  try {
    const season = await getCurrentSeason();
    if (!season) {
      return (
        <div className="page stack">
          <h1>Leaderboard</h1>
          <Empty>No seasons have been set up yet.</Empty>
        </div>
      );
    }

    const leaderboard = await getLeaderboard(season);

    return (
      <div className="page stack">
        <header className="stack" style={{ gap: '0.4rem' }}>
          <h1>Leaderboard</h1>
          <p className="muted" style={{ margin: 0 }}>
            {season.name}
            {leaderboard.episodes.length > 0
              ? ` — through Episode ${Math.max(...leaderboard.episodes.map((e) => e.episodeNumber))}`
              : ' — no episodes scored yet'}
          </p>
        </header>

        {season.winnerCastawayName ? (
          <div className="notice notice--ok">
            <strong>{season.winnerCastawayName}</strong> won the season, so every week&rsquo;s
            season-winner pick has been graded.
          </div>
        ) : (
          <div className="notice">
            Season-winner picks are worth nothing until the finale, then every week you named the
            winner pays out at that week&rsquo;s rate.
          </div>
        )}

        <LeaderboardTable leaderboard={leaderboard} />

        <p className="muted small" style={{ margin: 0 }}>
          <Link href="/archive">Past seasons</Link>
        </p>
      </div>
    );
  } catch (error) {
    return <SetupNotice error={error} />;
  }
}

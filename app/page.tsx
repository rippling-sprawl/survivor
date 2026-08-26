import Link from 'next/link';
import { getCurrentEpisode, getCurrentSeason, isAcceptingPicks } from '@/lib/db';
import { SetupNotice } from '@/components/setup-notice';
import { StatusBadge } from '@/components/ui';
import { formatDeadline } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  try {
    const season = await getCurrentSeason();
    const episode = season ? await getCurrentEpisode(season.id) : null;
    const open = episode ? isAcceptingPicks(episode) : false;
    const deadline = formatDeadline(episode?.locksAt ?? null);

    return (
      <div className="page stack" style={{ gap: '2rem' }}>
        <header className="stack" style={{ gap: '0.75rem' }}>
          <p className="badge" style={{ alignSelf: 'flex-start' }}>
            Outwit &middot; Outplay &middot; Outlast
          </p>
          <h1>Survivor Pick&rsquo;em</h1>
          <p className="muted" style={{ maxWidth: '52ch', margin: 0 }}>
            Call the vote-out, the immunity win and the idol before each episode airs. Points shrink
            as the field does, so an early read is worth more than a late one.
          </p>
        </header>

        <div className="grid-2">
          <section className="card card--raised stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>This week</h2>
              {episode && <StatusBadge status={episode.status} />}
            </div>
            {episode ? (
              <>
                <p style={{ margin: 0 }}>
                  <strong style={{ fontSize: '1.15rem' }}>Episode {episode.episodeNumber}</strong>
                  {episode.title ? ` — ${episode.title}` : ''}
                </p>
                <p className="muted small" style={{ margin: 0 }}>
                  {open
                    ? deadline
                      ? `Picks close ${deadline}.`
                      : 'Picks are open.'
                    : 'Picks are closed — you can still see what everyone chose.'}
                </p>
                <Link href="/episodic-picks" className="btn btn--primary" style={{ alignSelf: 'flex-start' }}>
                  {open ? 'Make your picks' : 'View the form'}
                </Link>
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No episode is open yet. Check back before the next one airs.
              </p>
            )}
          </section>

          <section className="card stack">
            <h2>Standings</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {season
                ? `${season.name} — every episode, every category, running total.`
                : 'No season set up yet.'}
            </p>
            <Link href="/leaderboard" className="btn" style={{ alignSelf: 'flex-start' }}>
              View leaderboard
            </Link>
          </section>
        </div>

        <section className="card stack">
          <h3>How scoring works</h3>
          <ul className="bullets">
            <li>Each week you pick the vote-out, the immunity win, the idol find and more.</li>
            <li>
              <strong>Vote-out, immunity and season winner</strong> are worth the number of players
              still in the game — early calls pay more.
            </li>
            <li>
              <strong>Fixed values:</strong> idol found 20, losing tribe 10, idol or advantage
              played 5.
            </li>
            <li>
              <strong>Season winner banks every week</strong> — when the Sole Survivor is crowned,
              every week you named them pays out at once.
            </li>
            <li>The finale is scored on its own: immunity and idol, 10 points each.</li>
          </ul>
          <p className="muted small" style={{ margin: 0 }}>
            <Link href="/archive">Past seasons</Link>
          </p>
        </section>
      </div>
    );
  } catch (error) {
    return <SetupNotice error={error} />;
  }
}

import Link from 'next/link';
import { getCurrentEpisode, getCurrentSeason, isAcceptingPicks } from '@/lib/db';
import { SetupNotice } from '@/components/setup-notice';
import { StatusBadge } from '@/components/ui';
import { formatDeadline } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * A short note about the running season, keyed by season number so it drops off by itself when
 * the next one starts.
 */
const SEASON_NOTES: Record<number, { body: string; castUrl: string }> = {
  51: {
    body:
      'This season kicks off "the open era" — anything that has ever happened on Survivor can come ' +
      'back at any time, without warning. Expect chaos, and expect the weekly questions to change ' +
      'often to keep up. The tribes haven\u2019t been revealed yet, so there\u2019s no tribe ' +
      'question this week.',
    castUrl: '/season/51/castaways',
  },
};

export default async function HomePage() {
  try {
    const season = await getCurrentSeason();
    const episode = season ? await getCurrentEpisode(season.id) : null;
    const open = episode ? isAcceptingPicks(episode) : false;
    const deadline = formatDeadline(episode?.locksAt ?? null);
    const note = season ? SEASON_NOTES[season.number] : undefined;

    return (
      <div className="page stack" style={{ gap: '2rem' }}>
        {/* <header className="stack" style={{ gap: '0.75rem' }}>
          <p className="badge" style={{ alignSelf: 'flex-start' }}>
            Outwit &middot; Outplay &middot; Outlast
          </p>
        </header> */}

        {season && note && (
          <section className="card stack">
            <h2>{season.name}</h2>
            <p style={{ maxWidth: '65ch', margin: 0 }}>{note.body}</p>
            <Link href={note.castUrl} className="btn" style={{ alignSelf: 'flex-start' }}>
              Learn about the castaways
            </Link>
          </section>
        )}

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
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No episode is open yet. Check back before the next one airs.
            </p>
          )}
          <div className="row">
            {episode && (
              <Link href="/episodic-picks" className="btn btn--primary">
                {open ? 'Make your picks' : 'View the form'}
              </Link>
            )}
            {season && (
              <Link href="/leaderboard" className="btn">
                View leaderboard
              </Link>
            )}
          </div>
        </section>

        <section className="card stack">
          <h3>How scoring works</h3>
          <p className="muted" style={{ margin: 0 }}>
            Call the vote-out, the immunity win and the idol before each episode airs. Points shrink
            as the field does, so an early read is worth more than a late one.
          </p>
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

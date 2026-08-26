import Link from 'next/link';
import { getCurrentEpisode, getCurrentSeason, getEpisodeForm, isAcceptingPicks } from '@/lib/db';
import { PicksForm } from './picks-form';
import { SetupNotice } from '@/components/setup-notice';
import { Empty, StatusBadge } from '@/components/ui';
import { formatDeadline } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Make your picks · Survivor Pick'em" };

export default async function EpisodicPicksPage({
  searchParams,
}: {
  searchParams: Promise<{ episode?: string }>;
}) {
  try {
    const { episode: requested } = await searchParams;
    const season = await getCurrentSeason();
    if (!season) {
      return (
        <div className="page stack">
          <h1>Make your picks</h1>
          <Empty>No seasons have been set up yet.</Empty>
        </div>
      );
    }

    // Defaults to the current episode; an explicit id lets someone revisit a past week's form.
    const episode = requested
      ? (await getEpisodeForm(requested))?.episode ?? null
      : await getCurrentEpisode(season.id);

    if (!episode) {
      return (
        <div className="page stack">
          <h1>Make your picks</h1>
          <Empty>
            No episode is open right now. Watch for the email when next week&rsquo;s form goes live.
          </Empty>
        </div>
      );
    }

    const form = await getEpisodeForm(episode.id);
    const questions = form?.questions ?? [];
    const accepting = isAcceptingPicks(episode);
    const deadline = formatDeadline(episode.locksAt);
    const total = questions.reduce((sum, q) => sum + q.points, 0);

    return (
      <div className="page stack">
        <header className="stack" style={{ gap: '0.5rem' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h1>Episode {episode.episodeNumber}</h1>
            <StatusBadge status={episode.status} />
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {season.name}
            {episode.title ? ` — ${episode.title}` : ''}
            {' · '}
            <strong>{total} points</strong> on the table
            {deadline && accepting ? ` · closes ${deadline}` : ''}
          </p>
        </header>

        {questions.length === 0 ? (
          <Empty>This form has no questions yet.</Empty>
        ) : (
          <PicksForm episode={episode} questions={questions} acceptingPicks={accepting} />
        )}

        <p className="muted small" style={{ margin: 0 }}>
          <Link href="/leaderboard">See the standings</Link>
        </p>
      </div>
    );
  } catch (error) {
    return <SetupNotice error={error} />;
  }
}

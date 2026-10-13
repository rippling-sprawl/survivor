import Link from 'next/link';
import {
  getCurrentEpisode,
  getCurrentSeason,
  getEpisodeForm,
  isAcceptingPicks,
  listCastaways,
} from '@/lib/db';
import { PicksForm } from './picks-form';
import { SetupNotice } from '@/components/setup-notice';
import { Empty, StatusBadge } from '@/components/ui';
import { formatDeadline } from '@/lib/format';
import { acceptsLateEntries } from '@/lib/late-codes';
import { castFor } from '@/lib/cast';
import { advantagesHeld } from '@/lib/fandom';

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

    const [form, castaways] = await Promise.all([
      getEpisodeForm(episode.id),
      listCastaways(season.id),
    ]);
    const questions = form?.questions ?? [];
    const accepting = isAcceptingPicks(episode);
    // Only while picks are open: it is information for making picks, and once the episode has
    // aired the list has moved on from what anyone knew when they chose.
    const advantages =
      accepting && season.wikiUrl
        ? await advantagesHeld(
            season.wikiUrl,
            castaways.map((c) => ({ shortName: c.shortName, fullName: c.fullName })),
          )
        : null;
    const deadline = formatDeadline(episode.locksAt);
    const total = questions.reduce((sum, q) => sum + q.points, 0);
    const castImages = Object.fromEntries(
      castFor(season.number)?.castaways.map((c) => [c.shortName, c.image]) ?? [],
    );
    const castTribes = Object.fromEntries(
      castaways.map((c) => [
        c.shortName,
        { key: c.tribe ?? '', label: c.tribeLabel ?? c.tribe, color: c.tribeColor },
      ]),
    );

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
            <strong>{total} points</strong> on the table<br/>
            {deadline && accepting ? `Locks ${deadline}` : ''}
          </p>
        </header>

        {episode.notes.map((note, index) => (
          <div key={index} className="notice stack" style={{ gap: '0.35rem' }}>
            <strong>{note.heading}</strong>
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{note.body}</p>
          </div>
        ))}

        {questions.length === 0 ? (
          <Empty>This form has no questions yet.</Empty>
        ) : (
          <PicksForm
            episode={episode}
            questions={questions}
            acceptingPicks={accepting}
            lateEntryAllowed={!accepting && acceptsLateEntries(episode)}
            castImages={castImages}
            castTribes={castTribes}
            advantagesHeld={advantages}
          />
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

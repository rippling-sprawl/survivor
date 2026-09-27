import Image from 'next/image';
import Link from 'next/link';
import {
  getCurrentEpisode,
  getCurrentSeason,
  isAcceptingPicks,
  listCastaways,
  listEpisodes,
} from '@/lib/db';
import { SetupNotice } from '@/components/setup-notice';
import { StatusBadge } from '@/components/ui';
import { castFor } from '@/lib/cast';
import { formatAirDate, formatDeadline } from '@/lib/format';
import type { Castaway, Episode, Season } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  try {
    const season = await getCurrentSeason();
    const [episode, episodes, castaways] = season
      ? await Promise.all([
          getCurrentEpisode(season.id),
          listEpisodes(season.id),
          listCastaways(season.id),
        ])
      : [null, [], []];
    const open = episode ? isAcceptingPicks(episode) : false;
    const deadline = formatDeadline(episode?.locksAt ?? null);
    const upcoming = season && episode ? nextEpisode(season, episode, episodes) : null;
    const upcomingAirDate = formatAirDate(upcoming?.airDate ?? null);

    return (
      <div className="page stack" style={{ gap: '2rem' }}>
        {/* <header className="stack" style={{ gap: '0.75rem' }}>
          <p className="badge" style={{ alignSelf: 'flex-start' }}>
            Outwit &middot; Outplay &middot; Outlast
          </p>
        </header> */}

        <section className="card card--raised stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>This week</h2>
            {upcoming ? (
              <span className="badge badge--draft">Upcoming</span>
            ) : (
              episode && <StatusBadge status={episode.status} />
            )}
          </div>
          {upcoming && episode ? (
            <>
              <p style={{ margin: 0 }}>
                <strong style={{ fontSize: '1.15rem' }}>Episode {upcoming.episodeNumber}</strong>
                {upcoming.title ? ` — ${upcoming.title}` : ''}
              </p>
              <p className="muted small" style={{ margin: 0 }}>
                {upcomingAirDate ? `Airs ${upcomingAirDate}. ` : ''}Picks open before it airs.
                Episode {episode.episodeNumber} has been scored.
              </p>
            </>
          ) : episode ? (
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
                {open
                  ? 'Make your picks'
                  : upcoming
                    ? `Ep. ${episode.episodeNumber} picks`
                    : 'View Picks'}
              </Link>
            )}
            {season && (
              <Link href="/leaderboard" className="btn">
                Leaderboard
              </Link>
            )}
          </div>
        </section>

        {season && castaways.length > 0 && <CastSection season={season} castaways={castaways} />}

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

/**
 * Once an episode is scored the next one hasn't been built yet, so it is shown as upcoming: the
 * draft if the admin has started one, otherwise a placeholder a week after the last air date.
 */
function nextEpisode(
  season: Season,
  current: Episode,
  episodes: Episode[],
): Pick<Episode, 'episodeNumber' | 'title' | 'airDate'> | null {
  if (current.status !== 'scored') return null;
  if (season.status !== 'active' || current.episodeNumber === season.finaleEpisode) return null;

  const number = current.episodeNumber + 1;
  const existing = episodes.find((e) => e.episodeNumber === number);
  if (existing) return existing;

  let airDate: string | null = null;
  if (current.airDate) {
    const next = new Date(`${current.airDate}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    airDate = next.toISOString().slice(0, 10);
  }
  return { episodeNumber: number, title: null, airDate };
}

/** Who is still playing, grouped by tribe, then everyone voted out in the order they left. */
function CastSection({ season, castaways }: { season: Season; castaways: Castaway[] }) {
  const cast = castFor(season.number);
  const imageByName = new Map(cast?.castaways.map((c) => [c.shortName, c.image]) ?? []);

  const remaining = castaways.filter((c) => c.eliminatedEpisode === null);
  const eliminated = castaways
    .filter((c) => c.eliminatedEpisode !== null)
    .sort((a, b) => (a.eliminatedEpisode ?? 0) - (b.eliminatedEpisode ?? 0));

  const tribes = new Map<string, { label: string | null; color: string | null; members: Castaway[] }>();
  for (const castaway of remaining) {
    const key = castaway.tribe ?? '';
    let tribe = tribes.get(key);
    if (!tribe) {
      tribes.set(key, (tribe = { label: castaway.tribeLabel ?? castaway.tribe, color: castaway.tribeColor, members: [] }));
    }
    tribe.members.push(castaway);
  }

  return (
    <>
      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Tribes</h2>
          {cast && (
            <Link href={`/season/${season.number}/castaways`} className="btn btn--sm">
              Learn about the castaways
            </Link>
          )}
        </div>
        {[...tribes.values()].map((tribe) => (
          <div key={tribe.label ?? ''} className="stack" style={{ gap: '0.75rem' }}>
            {tribe.label ? (
              <h3 className="tribe-name" style={{ borderColor: tribe.color ?? undefined }}>
                {tribe.label}
              </h3>
            ) : (
              tribes.size === 1 && (
                <p className="muted small" style={{ margin: 0 }}>
                  Tribes haven&rsquo;t been announced yet.
                </p>
              )
            )}
            <CastGrid castaways={tribe.members} imageByName={imageByName} />
          </div>
        ))}
      </section>

      {eliminated.length > 0 && (
        <section className="card stack">
          <h2>Eliminated</h2>
          <CastGrid castaways={eliminated} imageByName={imageByName} eliminated />
        </section>
      )}
    </>
  );
}

function CastGrid({
  castaways,
  imageByName,
  eliminated = false,
}: {
  castaways: Castaway[];
  imageByName: Map<string, string>;
  eliminated?: boolean;
}) {
  return (
    <ul className={`cast-grid${eliminated ? ' cast-grid--out' : ''}`}>
      {castaways.map((castaway) => {
        const image = imageByName.get(castaway.shortName);
        return (
          <li key={castaway.id}>
            {image ? (
              <Image
                src={image}
                alt={castaway.fullName ?? castaway.shortName}
                width={768}
                height={512}
                sizes="160px"
              />
            ) : (
              <span className="cast-grid__placeholder" aria-hidden="true" />
            )}
            <span className="cast-grid__name">{castaway.shortName}</span>
            {eliminated && (
              <span className="muted small">Out Ep {castaway.eliminatedEpisode}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

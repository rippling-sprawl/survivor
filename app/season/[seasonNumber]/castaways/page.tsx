import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { castFor, seasonsWithCast } from '@/lib/cast';

export function generateStaticParams() {
  return seasonsWithCast().map((n) => ({ seasonNumber: String(n) }));
}

export const dynamicParams = false;

export default async function CastawaysPage({
  params,
}: {
  params: Promise<{ seasonNumber: string }>;
}) {
  const { seasonNumber } = await params;
  const cast = castFor(Number(seasonNumber));
  if (!cast) notFound();

  return (
    <div className="page stack">
      <header className="stack" style={{ gap: '0.4rem' }}>
        <p className="muted small" style={{ margin: 0 }}>
          <Link href="/">&larr; Home</Link>
        </p>
        <h1>Season {seasonNumber} castaways</h1>
        <p className="muted" style={{ margin: 0 }}>
          {cast.castaways.length} new players. Bios and photos from{' '}
          <a href={cast.source} target="_blank" rel="noopener noreferrer">
            Paramount+
          </a>{' '}
          (photos: CBS).
        </p>
      </header>

      <div className="stack">
        {cast.castaways.map((castaway, i) => (
          <article key={castaway.shortName} className="card cast-card">
            <div className="cast-card__photo">
              <Image
                src={castaway.image}
                alt={castaway.name}
                width={768}
                height={512}
                sizes="(max-width: 480px) 100vw, 400px"
                priority={i < 2}
              />
            </div>
            <div className="stack cast-card__info">
              <div>
                <h2>{castaway.name}</h2>
                <p className="muted small" style={{ margin: '0.25rem 0 0' }}>
                  {[castaway.age && `Age ${castaway.age}`, castaway.occupation]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <dl className="cast-card__facts small">
                {castaway.hometown && (
                  <>
                    <dt>Hometown</dt>
                    <dd>{castaway.hometown}</dd>
                  </>
                )}
                {castaway.residence && castaway.residence !== castaway.hometown && (
                  <>
                    <dt>Lives in</dt>
                    <dd>{castaway.residence}</dd>
                  </>
                )}
              </dl>
              {castaway.bio.map((paragraph, j) => (
                <p key={j} style={{ margin: 0 }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

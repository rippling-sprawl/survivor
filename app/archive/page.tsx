import Link from 'next/link';
import { listSeasons } from '@/lib/db';
import { SetupNotice } from '@/components/setup-notice';
import { Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Archive · Survivor Pick'em" };

export default async function ArchivePage() {
  try {
    const seasons = await listSeasons();

    return (
      <div className="page stack">
        <h1>Archive</h1>
        {seasons.length === 0 ? (
          <Empty>No seasons yet.</Empty>
        ) : (
          <ul className="list">
            {seasons.map((season) => (
              <li key={season.id} className="list__item">
                <span>
                  <Link href={`/archive/season/${season.number}`}>{season.name}</Link>
                  {season.winnerCastawayName && (
                    <span className="muted small"> — won by {season.winnerCastawayName}</span>
                  )}
                </span>
                <span className={`badge ${season.status === 'active' ? 'badge--open' : ''}`}>
                  {season.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } catch (error) {
    return <SetupNotice error={error} />;
  }
}

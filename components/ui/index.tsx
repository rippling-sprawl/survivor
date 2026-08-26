import type { EpisodeStatus } from '@/lib/types';

/**
 * A handful of shared presentational pieces. Everything visual lives in globals.css so these stay
 * thin — the point is consistency, not a component framework.
 */

export function Card({
  title,
  aside,
  raised,
  children,
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  raised?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={raised ? 'card card--raised' : 'card'}>
      {(title || aside) && (
        <div className="card__title">
          {title ? <h2>{title}</h2> : <span />}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS_LABELS: Record<EpisodeStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  open: 'Open for picks',
  locked: 'Locked',
  scored: 'Scored',
};

const STATUS_CLASS: Record<EpisodeStatus, string> = {
  draft: 'badge--draft',
  approved: 'badge--draft',
  open: 'badge--open',
  locked: 'badge--locked',
  scored: 'badge--scored',
};

export function StatusBadge({ status }: { status: EpisodeStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'ok';
  children: React.ReactNode;
}) {
  const cls = tone === 'error' ? 'notice notice--error' : tone === 'ok' ? 'notice notice--ok' : 'notice';
  return <div className={cls}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card">
      <p className="muted" style={{ margin: 0 }}>
        {children}
      </p>
    </div>
  );
}

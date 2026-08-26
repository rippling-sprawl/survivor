'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui';
import { formatAirDate } from '@/lib/format';
import type { Castaway, Episode, Season } from '@/lib/types';

interface Overview {
  season: Season;
  seasons: Season[];
  episodes: Episode[];
  castaways: Castaway[];
  next: {
    episodeNumber: number;
    shape: 'pre_merge' | 'post_merge' | 'finale';
    remaining: number;
    survivors: string[];
    samplePoints: Record<string, number>;
  };
}

const SHAPE_LABELS = {
  pre_merge: 'Pre-merge (tribes)',
  post_merge: 'Post-merge (individual)',
  finale: 'Finale',
} as const;

/**
 * The weekly admin screen. The list is secondary; the important part is the generate panel, which
 * shows what next week's form *would* be — its shape, its point values, and who is still eligible —
 * before anything is created, so a wrong roster is caught before participants ever see it.
 */
export function FormsManager() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doubleElimination, setDoubleElimination] = useState(false);
  const [airDate, setAirDate] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/overview');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load.');
      setData(body);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/episodes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The server derives the pick deadline from the air date (8:00pm ET, DST included).
        body: JSON.stringify({
          includeSecondVoteOut: doubleElimination,
          airDate: airDate || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not generate.');
      setDoubleElimination(false);
      setAirDate('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate.');
    } finally {
      setBusy(false);
    }
  }

  async function rescore() {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/rescore', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not rescore.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rescore.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="card">Loading…</div>;

  const { season, episodes, next } = data;
  const openEpisode = episodes.find((e) => e.status === 'open');

  return (
    <div className="stack">
      {error && <div className="notice notice--error">{error}</div>}

      <section className="card card--raised stack">
        <div className="card__title">
          <h2>Next: Episode {next.episodeNumber}</h2>
          <span className="badge">{SHAPE_LABELS[next.shape]}</span>
        </div>

        <p className="muted small" style={{ margin: 0 }}>
          {next.remaining} castaways still in the game, so the vote-out, immunity and
          season-winner questions are worth <strong>{next.samplePoints.voted_out}</strong> points
          each. Finding an idol is worth <strong>{next.samplePoints.hidden_idol}</strong>.
        </p>

        <details>
          <summary className="muted small" style={{ cursor: 'pointer' }}>
            Who will appear in the dropdowns ({next.survivors.length})
          </summary>
          <p className="small" style={{ marginTop: '0.5rem' }}>
            {next.survivors.join(', ')}
          </p>
        </details>

        <div className="row">
          <div className="field" style={{ flex: '1 1 12rem' }}>
            <label className="field__label small" htmlFor="airDate">
              Air date (sets the pick deadline to 8:00pm ET)
            </label>
            <input
              id="airDate"
              className="input"
              type="date"
              value={airDate}
              onChange={(e) => setAirDate(e.target.value)}
            />
          </div>
          <label className="choice" style={{ alignSelf: 'flex-end' }}>
            <input
              type="checkbox"
              checked={doubleElimination}
              onChange={(e) => setDoubleElimination(e.target.checked)}
            />
            Double elimination
          </label>
        </div>

        {openEpisode && (
          <div className="notice">
            Episode {openEpisode.episodeNumber} is still open for picks. Generating the next one is
            fine — it starts as a draft and nobody sees it until you open it.
          </div>
        )}

        <div className="row">
          <button className="btn btn--primary" onClick={generate} disabled={busy}>
            {busy ? 'Working…' : `Generate Episode ${next.episodeNumber}`}
          </button>
          <button className="btn btn--ghost" onClick={rescore} disabled={busy}>
            Re-run scoring
          </button>
        </div>
      </section>

      <section className="card stack">
        <div className="card__title">
          <h2>{season.name}</h2>
          <span className="muted small">{episodes.length} episodes</span>
        </div>

        {episodes.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No episodes yet — generate the first one above.
          </p>
        ) : (
          <ul className="list">
            {[...episodes].reverse().map((episode) => (
              <li key={episode.id} className="list__item">
                <span>
                  <Link href={`/admin/forms/${episode.id}`}>
                    <strong>Episode {episode.episodeNumber}</strong>
                  </Link>
                  {episode.title ? ` — ${episode.title}` : ''}
                  {episode.airDate && (
                    <span className="muted small"> &middot; {formatAirDate(episode.airDate)}</span>
                  )}
                </span>
                <span className="row">
                  <StatusBadge status={episode.status} />
                  <Link className="btn btn--ghost btn--sm" href={`/admin/forms/${episode.id}/results`}>
                    Results
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

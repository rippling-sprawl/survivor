'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Castaway, Season } from '@/lib/types';

interface SeasonDetail {
  season: Season;
  castaways: Castaway[];
}

/**
 * Season setup. Rosters are entered as text rather than a row-by-row builder because that is how
 * they arrive — a cast list gets published and you paste it once, at the start of a season, and
 * then never touch it again.
 *
 * The short name is the load-bearing field: it is the value stored in every pick, so it has to be
 * whatever the group actually calls that player ("Tiff", not "Tiffany").
 */
const TRIBE_PLACEHOLDER = `Cila | Cila (Orange) | #F26B21
Kalo | Kalo (Teal) | #1C8C8C
Vatu | Vatu (Magenta) | #B5297F`;

const ROSTER_PLACEHOLDER = `Aubry | Aubry Bracco | Kalo
Tiff | Tiffany Ervin | Kalo
Ozzy | Oscar "Ozzy" Lusth | Vatu
Q | Quintavius "Q" Burdette | Vatu`;

function parseTribes(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, label, color] = line.split('|').map((p) => p.trim());
      return { name, label: label || name, color: color || null };
    })
    .filter((t) => t.name);
}

function parseRoster(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [shortName, fullName, tribe] = line.split('|').map((p) => p.trim());
      return { shortName, fullName: fullName || null, tribe: tribe || null };
    })
    .filter((c) => c.shortName);
}

export function SeasonsManager() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [detail, setDetail] = useState<SeasonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [wikiUrl, setWikiUrl] = useState('');
  const [mergeEpisode, setMergeEpisode] = useState('');
  const [finaleEpisode, setFinaleEpisode] = useState('');
  const [tribesText, setTribesText] = useState('');
  const [rosterText, setRosterText] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/seasons');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load seasons.');
      setSeasons(body.seasons);
      const active = body.seasons.find((s: Season) => s.status === 'active') ?? body.seasons[0];
      if (active) {
        const d = await fetch(`/api/admin/seasons/${active.id}`);
        const dj = await d.json();
        if (d.ok) setDetail(dj);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load seasons.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roster = parseRoster(rosterText);
  const tribes = parseTribes(tribesText);
  const unknownTribes = [
    ...new Set(
      roster
        .map((c) => c.tribe)
        .filter((t): t is string => !!t)
        .filter((t) => !tribes.some((tribe) => tribe.name.toLowerCase() === t.toLowerCase())),
    ),
  ];

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: Number(number),
          name,
          wikiUrl: wikiUrl || null,
          mergeEpisode: mergeEpisode ? Number(mergeEpisode) : null,
          finaleEpisode: finaleEpisode ? Number(finaleEpisode) : null,
          tribes,
          castaways: roster,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not create the season.');
      setMessage(
        `Season ${body.season.number} created with ${body.castaways} castaways, and it is now the active season.`,
      );
      setNumber('');
      setName('');
      setWikiUrl('');
      setMergeEpisode('');
      setFinaleEpisode('');
      setTribesText('');
      setRosterText('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the season.');
    } finally {
      setBusy(false);
    }
  }

  async function declareWinner(shortName: string) {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/seasons/${detail.season.id}/winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortName: shortName || null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not set the winner.');
      setMessage(
        shortName
          ? `${shortName} is the Sole Survivor. Every week's season-winner pick has been graded.`
          : 'Winner cleared — season-winner picks are back to zero.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not set the winner.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && <div className="notice notice--error">{error}</div>}
      {message && <div className="notice notice--ok">{message}</div>}

      {detail && (
        <section className="card stack">
          <div className="card__title">
            <h2>{detail.season.name}</h2>
            <span className="badge">{detail.season.status}</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {detail.castaways.length} castaways &middot;{' '}
            {detail.castaways.filter((c) => c.eliminatedEpisode === null).length} still in &middot;
            merge at Ep {detail.season.mergeEpisode ?? '—'} &middot; finale Ep{' '}
            {detail.season.finaleEpisode ?? '—'}
          </p>

          <div className="field" style={{ maxWidth: '24rem' }}>
            <label className="field__label">Sole Survivor</label>
            <span className="field__help">
              Setting this grades every week&rsquo;s season-winner pick at once, at that
              week&rsquo;s rate. It is the biggest single scoring event of the season.
            </span>
            <select
              className="select"
              value={detail.season.winnerCastawayName ?? ''}
              disabled={busy}
              onChange={(e) => declareWinner(e.target.value)}
            >
              <option value="">Not decided yet</option>
              {detail.castaways.map((c) => (
                <option key={c.id} value={c.shortName}>
                  {c.shortName}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <form className="card card--raised stack" onSubmit={create}>
        <h2>New season</h2>

        <div className="row">
          <div className="field" style={{ flex: '0 1 8rem' }}>
            <label className="field__label small">Number</label>
            <input
              className="input"
              type="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="51"
            />
          </div>
          <div className="field" style={{ flex: '2 1 18rem' }}>
            <label className="field__label small">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Survivor 51"
            />
          </div>
        </div>

        <div className="row">
          <div className="field" style={{ flex: '0 1 9rem' }}>
            <label className="field__label small">Merge episode</label>
            <input
              className="input"
              type="number"
              value={mergeEpisode}
              onChange={(e) => setMergeEpisode(e.target.value)}
              placeholder="6"
            />
          </div>
          <div className="field" style={{ flex: '0 1 9rem' }}>
            <label className="field__label small">Finale episode</label>
            <input
              className="input"
              type="number"
              value={finaleEpisode}
              onChange={(e) => setFinaleEpisode(e.target.value)}
              placeholder="14"
            />
          </div>
          <div className="field" style={{ flex: '2 1 18rem' }}>
            <label className="field__label small">Wikipedia URL</label>
            <input
              className="input"
              value={wikiUrl}
              onChange={(e) => setWikiUrl(e.target.value)}
              placeholder="https://en.wikipedia.org/wiki/Survivor_51"
            />
          </div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          The merge episode switches the form from tribal questions to individual ones. Both can be
          left blank now and filled in once the season shows its hand.
        </p>

        <div className="field">
          <label className="field__label small">Tribes — one per line: name | display label | colour</label>
          <textarea
            className="input"
            rows={4}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
            value={tribesText}
            onChange={(e) => setTribesText(e.target.value)}
            placeholder={TRIBE_PLACEHOLDER}
          />
        </div>

        <div className="field">
          <label className="field__label small">
            Roster — one per line: short name | full name | tribe
          </label>
          <span className="field__help">
            The short name is what gets stored in every pick, so use what the group actually says
            — &ldquo;Tiff&rdquo;, not &ldquo;Tiffany&rdquo;.
          </span>
          <textarea
            className="input"
            rows={10}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
            value={rosterText}
            onChange={(e) => setRosterText(e.target.value)}
            placeholder={ROSTER_PLACEHOLDER}
          />
        </div>

        {roster.length > 0 && (
          <p className="small" style={{ margin: 0 }}>
            <strong>{roster.length} castaways</strong> across {tribes.length || '—'} tribes. Week
            one&rsquo;s vote-out question will be worth{' '}
            <span className="points">{roster.length} points</span>.
          </p>
        )}

        {unknownTribes.length > 0 && (
          <div className="notice notice--error">
            These tribes are used in the roster but not defined above:{' '}
            <strong>{unknownTribes.join(', ')}</strong>. The losing-tribe question needs them.
          </div>
        )}

        <button
          className="btn btn--primary"
          type="submit"
          disabled={busy || roster.length === 0 || unknownTribes.length > 0}
          style={{ alignSelf: 'flex-start' }}
        >
          {busy ? 'Creating…' : 'Create season'}
        </button>
      </form>

      <section className="card stack">
        <h2>All seasons</h2>
        <ul className="list">
          {seasons.map((season) => (
            <li key={season.id} className="list__item">
              <span>
                <strong>{season.name}</strong>
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
      </section>
    </div>
  );
}

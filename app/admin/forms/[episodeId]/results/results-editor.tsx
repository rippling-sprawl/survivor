'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui';
import { CATEGORY_LABELS, type ScoringKey } from '@/lib/types';
import type { Episode, Question, QuestionOption } from '@/lib/types';

type FormQuestion = Question & { options: QuestionOption[] };

interface EpisodeDetail {
  episode: Episode;
  questions: FormQuestion[];
  answerKey: Partial<Record<ScoringKey, string[]>>;
  submissions: { id: string; displayName: string }[];
}

interface WikiPreview {
  wikiUrl: string;
  episodes: { episodeNumber: number; title: string | null; raw: Record<string, string> }[];
  selected: { episodeNumber: number; title: string | null; raw: Record<string, string> } | null;
  suggestions: { scoringKey: string; values: string[]; note: string }[];
  caveat: string;
}

/**
 * Results entry. Wikipedia fills in what it can and the admin does the rest — which is not a
 * shortcoming to design around but the actual shape of the problem. The episode table knows who
 * went home and who won immunity; it has nothing to say about who *found* an idol, or whether an
 * advantage was played, and it numbers its episodes differently besides.
 *
 * So: suggestions on the left, the raw wiki row visible, and nothing applied without a click.
 */
export function ResultsEditor({ episodeId }: { episodeId: string }) {
  const [data, setData] = useState<EpisodeDetail | null>(null);
  const [wiki, setWiki] = useState<WikiPreview | null>(null);
  const [wikiError, setWikiError] = useState<string | null>(null);
  const [wikiEpisode, setWikiEpisode] = useState('');
  const [entries, setEntries] = useState<Partial<Record<ScoringKey, string[]>>>({});
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/episodes/${episodeId}`);
      const body = (await response.json()) as EpisodeDetail & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not load this episode.');
      setData(body);
      setEntries(body.answerKey ?? {});
      setWikiEpisode(String(body.episode.wikiEpisodeNumber ?? body.episode.episodeNumber));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this episode.');
    }
  }, [episodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadWiki() {
    setWikiError(null);
    try {
      const response = await fetch(
        `/api/admin/wiki-preview?episodeId=${episodeId}&wikiEpisode=${encodeURIComponent(wikiEpisode)}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not read Wikipedia.');
      setWiki(body);
    } catch (cause) {
      setWikiError(cause instanceof Error ? cause.message : 'Could not read Wikipedia.');
    }
  }

  /** The scoring keys this episode actually asked about — nothing else needs an answer. */
  const keys = data
    ? ([...new Set(data.questions.map((q) => q.scoringKey))] as ScoringKey[])
    : [];

  const optionsFor = (key: ScoringKey) => {
    const question = data?.questions.find((q) => q.scoringKey === key);
    return question?.options ?? [];
  };

  function toggleValue(key: ScoringKey, value: string) {
    setEntries((prev) => {
      const current = prev[key] ?? [];
      return {
        ...prev,
        [key]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  }

  async function save(score: boolean) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/episodes/${episodeId}/answer-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerKey: entries, eliminated, score }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not save.');
      setMessage(
        score
          ? 'Results saved and the season has been re-scored.'
          : 'Results saved as a draft — nothing has been scored yet.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="card">Loading…</div>;

  const { episode } = data;
  const castawayOptions = optionsFor('voted_out').map((o) => o.value);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Episode {episode.episodeNumber} results</h1>
        <StatusBadge status={episode.status} />
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {message && <div className="notice notice--ok">{message}</div>}

      <section className="card stack">
        <div className="card__title">
          <h2>Wikipedia assist</h2>
          <button className="btn btn--sm btn--ghost" onClick={loadWiki} disabled={busy}>
            Fetch
          </button>
        </div>

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '0 1 12rem' }}>
            <label className="field__label small">Wikipedia episode number</label>
            <input
              className="input"
              type="number"
              value={wikiEpisode}
              onChange={(e) => setWikiEpisode(e.target.value)}
            />
          </div>
          <p className="muted small" style={{ margin: 0, flex: '1 1 18rem' }}>
            Wikipedia numbers episodes its own way — Season 50 drifted by one as soon as an episode
            aired with no tribal council. Check the row below is the week you mean.
          </p>
        </div>

        {wikiError && <div className="notice notice--error">{wikiError}</div>}

        {wiki && (
          <div className="stack" style={{ gap: '0.75rem' }}>
            <p className="muted small" style={{ margin: 0 }}>
              {wiki.caveat}
            </p>

            {wiki.selected ? (
              <>
                <div className="notice">
                  <strong>
                    Wiki Ep {wiki.selected.episodeNumber}
                    {wiki.selected.title ? ` — ${wiki.selected.title}` : ''}
                  </strong>
                  <div className="small muted" style={{ marginTop: '0.4rem' }}>
                    {Object.entries(wiki.selected.raw)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                  </div>
                </div>

                {wiki.suggestions.length === 0 ? (
                  <p className="muted small" style={{ margin: 0 }}>
                    Nothing could be suggested from that row.
                  </p>
                ) : (
                  <ul className="list">
                    {wiki.suggestions.map((suggestion) => (
                      <li key={suggestion.scoringKey} className="list__item">
                        <span>
                          <strong>
                            {CATEGORY_LABELS[suggestion.scoringKey as ScoringKey] ??
                              suggestion.scoringKey}
                          </strong>
                          : {suggestion.values.join(', ')}
                          <div className="muted small">{suggestion.note}</div>
                        </span>
                        <button
                          className="btn btn--sm"
                          type="button"
                          onClick={() =>
                            setEntries((prev) => ({
                              ...prev,
                              [suggestion.scoringKey as ScoringKey]: suggestion.values,
                            }))
                          }
                        >
                          Apply
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                No wiki row numbered {wikiEpisode}. Parsed:{' '}
                {wiki.episodes.map((e) => e.episodeNumber).join(', ')}.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Answer key</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Pick every correct answer. A week with two eliminations or three immunity winners takes
          more than one — naming any of them scores.
        </p>

        {keys.map((key) => {
          const options = optionsFor(key);
          const selected = entries[key] ?? [];
          return (
            <div key={key} className="field">
              <span className="field__label">{CATEGORY_LABELS[key]}</span>
              <div className="choices">
                {options.map((option) => (
                  <label
                    key={option.id}
                    className={`choice ${selected.includes(option.value) ? 'choice--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(option.value)}
                      onChange={() => toggleValue(key, option.value)}
                    />
                    {option.label}
                  </label>
                ))}
                <label className={`choice ${selected.includes('n/a') ? 'choice--selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.includes('n/a')}
                    onChange={() => toggleValue(key, 'n/a')}
                  />
                  Didn&rsquo;t happen
                </label>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card stack">
        <h2>Who went home</h2>
        <p className="muted small" style={{ margin: 0 }}>
          This is what shrinks next week&rsquo;s dropdowns and sets next week&rsquo;s point values,
          so it matters even when it looks redundant. Order them as they left.
        </p>
        <div className="choices">
          {castawayOptions.map((shortName) => (
            <label
              key={shortName}
              className={`choice ${eliminated.includes(shortName) ? 'choice--selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={eliminated.includes(shortName)}
                onChange={() =>
                  setEliminated((prev) =>
                    prev.includes(shortName)
                      ? prev.filter((n) => n !== shortName)
                      : [...prev, shortName],
                  )
                }
              />
              {shortName}
            </label>
          ))}
        </div>
        {eliminated.length > 0 && (
          <p className="small" style={{ margin: 0 }}>
            Leaving, in order: <strong>{eliminated.join(' → ')}</strong>
          </p>
        )}
      </section>

      <div className="row">
        <button className="btn btn--primary" onClick={() => save(true)} disabled={busy}>
          {busy ? 'Working…' : 'Save and score the season'}
        </button>
        <button className="btn btn--ghost" onClick={() => save(false)} disabled={busy}>
          Save without scoring
        </button>
        <Link className="btn btn--ghost" href={`/admin/forms/${episodeId}`}>
          Back to the form
        </Link>
      </div>
    </div>
  );
}

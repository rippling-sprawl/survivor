'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Notice } from '@/components/ui';

/**
 * The debug control panel: four buttons that walk a complete season through the app end to end,
 * and a fifth that takes it all back out again.
 *
 * Types are declared locally rather than imported from `lib/debug/runner`, which is `server-only`.
 * They describe the JSON these endpoints return, so a shape change on the server shows up here as
 * a type error rather than as an undefined at runtime.
 */

interface Gate {
  environmentAllows: boolean;
  cookiePresent: boolean;
  configured: boolean;
  enabled: boolean;
}

interface DebugStatus {
  season: { id: string; number: number; name: string; status: string; winnerCastawayName: string | null } | null;
  episodes: { id: string; episodeNumber: number; status: string; questions: number }[];
  participants: { displayName: string; exists: boolean }[];
}

interface EpisodeResult {
  episode: { id: string; episodeNumber: number; status: string };
  shape: string;
  remaining: number;
  questions: { id: string; questionKey: string; prompt: string; points: number; options: number }[];
  submissions: { displayName: string; answers: Record<string, string> }[];
  suggestedRecapText: string;
  totalPointsOnTable: number;
  formUrl: string;
}

interface ScoreResult {
  episode: { episodeNumber: number; status: string };
  parsed: {
    answerKey: Record<string, string[]>;
    eliminated: string[];
    unrecognizedLabels: string[];
    unmatchedValues: { label: string; value: string }[];
  };
  expected: {
    displayName: string;
    total: number;
    lines: {
      questionKey: string;
      pick: string | null;
      accepted: string[];
      correct: boolean;
      points: number;
    }[];
  }[];
  actual: { displayName: string; episodePoints: number; seasonTotal: number }[];
  mismatches: { displayName: string; expected: number; actual: number }[];
  seasonWinnerApplied: string | null;
  leaderboardUrl: string;
}

interface CleanupResult {
  deleted: Record<string, number>;
  remaining: string[];
}

const DELETED_LABELS: Record<string, string> = {
  seasons: 'Seasons',
  castaways: 'Castaways',
  episodes: 'Episodes',
  questions: 'Questions',
  submissions: 'Submissions',
  answers: 'Answers',
  scores: 'Score rows',
  answerKeyRows: 'Answer-key rows',
  users: 'Participants',
};

export function DebugPanel() {
  const [gate, setGate] = useState<Gate | null>(null);
  const [status, setStatus] = useState<DebugStatus | null>(null);
  const [seasonNumber, setSeasonNumber] = useState<number>(999);

  const [recap, setRecap] = useState('');
  const [doubleElimination, setDoubleElimination] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [episodeResult, setEpisodeResult] = useState<EpisodeResult | null>(null);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/debug');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not read debug status.');
      setGate(body.gate);
      setStatus(body.status);
      setSeasonNumber(body.seasonNumber);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read debug status.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every button funnels through here so failures surface the same way and nothing double-fires. */
  async function run(
    key: string,
    url: string,
    body: unknown,
    onDone: (payload: Record<string, unknown>) => void,
  ) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'That did not work.');
      onDone(payload);
      if (payload.status !== undefined) setStatus(payload.status as DebugStatus);
      if (payload.gate !== undefined) setGate(payload.gate as Gate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  const arm = () =>
    run('arm', '/api/admin/debug', { action: 'arm' }, () => {
      setNote('Debug mode is armed for this browser for the next two hours.');
      void load();
    });

  const disarm = () =>
    run('disarm', '/api/admin/debug', { action: 'disarm' }, () => {
      setNote('Debug mode disarmed. The dummy data is untouched — clean it up before you go.');
      setStatus(null);
    });

  const generateSeason = () =>
    run('season', '/api/admin/debug/season', {}, (payload) => {
      setEpisodeResult(null);
      setScoreResult(null);
      setCleanupResult(null);
      setRecap('');
      setNote(
        payload.replacedExisting
          ? `Replaced the previous debug season. ${payload.castaways} castaways loaded.`
          : `Debug season created with ${payload.castaways} castaways.`,
      );
    });

  const generateEpisode = () =>
    run(
      'episode',
      '/api/admin/debug/episode',
      { includeSecondVoteOut: doubleElimination },
      (payload) => {
        const result = payload as unknown as EpisodeResult;
        setEpisodeResult(result);
        setScoreResult(null);
        setRecap(result.suggestedRecapText);
        setDoubleElimination(false);
        setNote(
          `Episode ${result.episode.episodeNumber} is open, with ${result.submissions.length} dummy submissions filed.`,
        );
      },
    );

  const score = () =>
    run('score', '/api/admin/debug/score', { text: recap }, (payload) => {
      const result = payload as unknown as ScoreResult;
      setScoreResult(result);
      setNote(
        result.mismatches.length === 0
          ? 'Scoring agrees with the independent check on every participant.'
          : `${result.mismatches.length} participant(s) scored differently than expected — see below.`,
      );
    });

  const cleanup = () => {
    if (!window.confirm('Delete the debug season, its episodes, and all debug participants?')) return;
    return run('cleanup', '/api/admin/debug/cleanup', {}, (payload) => {
      const result = payload as unknown as CleanupResult;
      setCleanupResult(result);
      setEpisodeResult(null);
      setScoreResult(null);
      setRecap('');
      setNote(
        result.remaining.length === 0
          ? 'Database is clean — no debug rows remain.'
          : 'Cleanup ran but some rows are still present.',
      );
    });
  };

  if (!gate) return <div className="card">Loading…</div>;

  const armed = gate.enabled;
  const working = busy !== null;

  return (
    <div className="stack">
      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice tone={scoreResult?.mismatches.length ? 'error' : 'ok'}>{note}</Notice>}

      {/* -- the gate ------------------------------------------------------------------------- */}
      <section className="card stack">
        <div className="card__title">
          <h2>Arming</h2>
          <span className={`badge ${armed ? 'badge--open' : 'badge--draft'}`}>
            {armed ? 'Armed' : 'Not armed'}
          </span>
        </div>

        <p className="muted small" style={{ margin: 0 }}>
          Debug mode needs three things at once: an environment that permits it, a signed cookie in
          this browser, and an admin session. Everything it writes goes into season{' '}
          <strong>{seasonNumber}</strong> and a fixed list of participants, which is what lets the
          cleanup step remove all of it and prove that it did.
        </p>

        <ul className="bullets small">
          <li>Environment allows debug mode: <strong>{gate.environmentAllows ? 'yes' : 'no'}</strong></li>
          <li>SESSION_SECRET configured: <strong>{gate.configured ? 'yes' : 'no'}</strong></li>
          <li>Debug cookie present: <strong>{gate.cookiePresent ? 'yes' : 'no'}</strong></li>
        </ul>

        <div className="row">
          {armed ? (
            <button className="btn btn--ghost" onClick={disarm} disabled={working}>
              {busy === 'disarm' ? 'Working…' : 'Disarm debug mode'}
            </button>
          ) : (
            <button className="btn btn--primary" onClick={arm} disabled={working || !gate.configured}>
              {busy === 'arm' ? 'Working…' : 'Arm debug mode'}
            </button>
          )}
        </div>
      </section>

      {!armed && (
        <Notice>Arm debug mode to enable the buttons below.</Notice>
      )}

      {/* -- current dummy data --------------------------------------------------------------- */}
      {armed && (
        <section className="card stack">
          <div className="card__title">
            <h2>Dummy data in the database</h2>
            {status?.season && <span className="badge">Season {status.season.number}</span>}
          </div>

          {status?.season ? (
            <>
              <p className="small" style={{ margin: 0 }}>
                <strong>{status.season.name}</strong>{' '}
                <span className="muted">
                  ({status.season.status}
                  {status.season.winnerCastawayName
                    ? `, won by ${status.season.winnerCastawayName}`
                    : ''}
                  )
                </span>
              </p>
              {status.episodes.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>No episodes yet.</p>
              ) : (
                <ul className="list">
                  {status.episodes.map((episode) => (
                    <li key={episode.id} className="list__item">
                      <span>
                        <strong>Episode {episode.episodeNumber}</strong>{' '}
                        <span className="muted small">{episode.questions} questions</span>
                      </span>
                      <span className="row">
                        <span className="badge">{episode.status}</span>
                        <Link
                          className="btn btn--ghost btn--sm"
                          href={`/episodic-picks?episode=${episode.id}`}
                        >
                          View form
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              No debug season exists right now.
            </p>
          )}

          <p className="muted small" style={{ margin: 0 }}>
            Participants present:{' '}
            {status?.participants.filter((p) => p.exists).length ?? 0} of{' '}
            {status?.participants.length ?? 0}
            {status?.participants.some((p) => p.exists) &&
              ` — ${status.participants.filter((p) => p.exists).map((p) => p.displayName).join(', ')}`}
          </p>

          {status?.season && (
            <p className="muted small" style={{ margin: 0 }}>
              <Link href={`/archive/season/${status.season.number}`}>
                Open the debug leaderboard
              </Link>{' '}
              — the debug season is deliberately left inactive, so it never displaces the real one
              on the public pages.
            </p>
          )}
        </section>
      )}

      {/* -- steps 1 and 2 --------------------------------------------------------------------- */}
      {armed && (
        <section className="card card--raised stack">
          <h2>1 &middot; Season and form</h2>

          <p className="muted small" style={{ margin: 0 }}>
            Generating a season replaces any previous debug run. Generating a form creates the next
            episode, walks it draft &rarr; approved &rarr; open, and files a submission for every
            template participant — deterministically, so the same run always produces the same
            picks.
          </p>

          <div className="row">
            <button className="btn btn--primary" onClick={generateSeason} disabled={working}>
              {busy === 'season' ? 'Working…' : 'Generate season'}
            </button>
            <button
              className="btn btn--primary"
              onClick={generateEpisode}
              disabled={working || !status?.season}
            >
              {busy === 'episode' ? 'Working…' : 'Generate episodic form'}
            </button>
            <label className="choice">
              <input
                type="checkbox"
                checked={doubleElimination}
                onChange={(e) => setDoubleElimination(e.target.checked)}
                disabled={working}
              />
              Double elimination
            </label>
          </div>

          {episodeResult && (
            <div className="stack" style={{ gap: '0.5rem' }}>
              <p className="small" style={{ margin: 0 }}>
                Episode {episodeResult.episode.episodeNumber} &middot; {episodeResult.shape} &middot;{' '}
                {episodeResult.remaining} castaways left &middot;{' '}
                <strong>{episodeResult.totalPointsOnTable} points</strong> on the table
              </p>
              <ul className="list">
                {episodeResult.questions.map((question) => (
                  <li key={question.id} className="list__item">
                    <span className="small">{question.prompt}</span>
                    <span className="muted small">
                      {question.points} pts &middot; {question.options} options
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted small" style={{ margin: 0 }}>
                <Link href={episodeResult.formUrl}>Open this form as a participant would see it</Link>
              </p>
            </div>
          )}
        </section>
      )}

      {/* -- step 3 ---------------------------------------------------------------------------- */}
      {armed && (
        <section className="card card--raised stack">
          <h2>2 &middot; Score from recap text</h2>

          <p className="muted small" style={{ margin: 0 }}>
            The text below is parsed into an answer key, matched against this season&rsquo;s roster,
            and used to grade the dummy submissions. Edit it freely — anything it cannot recognise
            is reported rather than guessed at. Adding a <code>Season winner:</code> line ends the
            season and grades every week&rsquo;s winner pick at once.
          </p>

          <div className="field">
            <label className="field__label small" htmlFor="recap">
              Dummy episode recap
            </label>
            <textarea
              id="recap"
              className="input"
              rows={10}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              value={recap}
              onChange={(e) => setRecap(e.target.value)}
              placeholder={'Voted out: Ada\nLosing tribe: Dbugu\nIdol found: Eli'}
            />
          </div>

          <div className="row">
            <button
              className="btn btn--primary"
              onClick={score}
              disabled={working || !recap.trim()}
            >
              {busy === 'score' ? 'Working…' : 'Score dummy entries'}
            </button>
          </div>

          {scoreResult && <ScoreReport result={scoreResult} />}
        </section>
      )}

      {/* -- step 4 ---------------------------------------------------------------------------- */}
      {armed && (
        <section className="card stack">
          <h2>3 &middot; Clean up</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Deletes the debug season — which cascades to its episodes, questions, submissions,
            answers and scores — and the debug participants, then reads the database back to
            confirm nothing is left. It only ever targets season {seasonNumber} and the fixed
            participant names, so real pool data cannot be caught up in it.
          </p>

          <div className="row">
            <button className="btn btn--ghost" onClick={cleanup} disabled={working}>
              {busy === 'cleanup' ? 'Working…' : 'Clean database'}
            </button>
          </div>

          {cleanupResult && (
            <div className="stack" style={{ gap: '0.5rem' }}>
              <ul className="list">
                {Object.entries(cleanupResult.deleted).map(([key, count]) => (
                  <li key={key} className="list__item">
                    <span className="small">{DELETED_LABELS[key] ?? key}</span>
                    <span className="muted small">{count} deleted</span>
                  </li>
                ))}
              </ul>
              {cleanupResult.remaining.length === 0 ? (
                <Notice tone="ok">Verified: no debug rows remain.</Notice>
              ) : (
                <Notice tone="error">
                  {cleanupResult.remaining.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </Notice>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * The scoring read-out. The number that matters is the comparison: `expected` is computed by a
 * second, independent implementation of the rules, so agreement is evidence and disagreement is a
 * bug in one of the two.
 */
function ScoreReport({ result }: { result: ScoreResult }) {
  const { parsed } = result;

  return (
    <div className="stack" style={{ gap: '0.75rem' }}>
      {result.mismatches.length === 0 ? (
        <Notice tone="ok">
          Stored scores match the independent check for all {result.expected.length} participants.
        </Notice>
      ) : (
        <Notice tone="error">
          {result.mismatches.map((m) => (
            <div key={m.displayName}>
              {m.displayName}: expected {m.expected}, database has {m.actual}
            </div>
          ))}
        </Notice>
      )}

      <div>
        <h3 className="small">Answer key read from the text</h3>
        <ul className="bullets small">
          {Object.entries(parsed.answerKey).map(([key, values]) => (
            <li key={key}>
              <strong>{key}</strong>: {values.length > 0 ? values.join(', ') : '(nothing)'}
            </li>
          ))}
          {parsed.eliminated.length > 0 && (
            <li>
              <strong>eliminated</strong>: {parsed.eliminated.join(', ')}
            </li>
          )}
          {result.seasonWinnerApplied && (
            <li>
              <strong>season winner</strong>: {result.seasonWinnerApplied}
            </li>
          )}
        </ul>
      </div>

      {(parsed.unrecognizedLabels.length > 0 || parsed.unmatchedValues.length > 0) && (
        <Notice>
          {parsed.unrecognizedLabels.length > 0 && (
            <div>Labels not recognised: {parsed.unrecognizedLabels.join(', ')}</div>
          )}
          {parsed.unmatchedValues.length > 0 && (
            <div>
              Values not on the roster:{' '}
              {parsed.unmatchedValues.map((v) => `${v.value} (${v.label})`).join(', ')}
            </div>
          )}
        </Notice>
      )}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Participant</th>
              <th>Expected</th>
              <th>Stored</th>
              <th>Season total</th>
            </tr>
          </thead>
          <tbody>
            {result.expected.map((row) => {
              const actual = result.actual.find((a) => a.displayName === row.displayName);
              const agrees = (actual?.episodePoints ?? 0) === row.total;
              return (
                <tr key={row.displayName}>
                  <td>{row.displayName}</td>
                  <td>{row.total}</td>
                  <td style={agrees ? undefined : { fontWeight: 700, color: 'var(--sunset)' }}>
                    {actual?.episodePoints ?? 0}
                  </td>
                  <td className="muted">{actual?.seasonTotal ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details>
        <summary className="muted small" style={{ cursor: 'pointer' }}>
          Pick-by-pick breakdown
        </summary>
        <div className="stack" style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
          {result.expected.map((row) => (
            <div key={row.displayName}>
              <strong className="small">
                {row.displayName} — {row.total} pts
              </strong>
              <ul className="bullets small">
                {row.lines.map((line) => (
                  <li key={line.questionKey}>
                    {line.questionKey}: picked <strong>{line.pick ?? '—'}</strong>, key says{' '}
                    {line.accepted.length > 0 ? line.accepted.join(' / ') : '—'} &rarr;{' '}
                    {line.correct ? `+${line.points}` : '0'}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

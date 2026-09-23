'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui';
import type { Episode, EpisodeStatus, Question, QuestionOption } from '@/lib/types';

type FormQuestion = Question & { options: QuestionOption[] };

interface EpisodeDetail {
  episode: Episode;
  questions: FormQuestion[];
  answerKey: Record<string, string[]>;
  submissions: { id: string; displayName: string; submittedAt: string }[];
}

type OptionSource = 'castaways' | 'yes_no' | 'custom';

const EMPTY_NEW_QUESTION = {
  prompt: '',
  helpText: '',
  points: '10',
  source: 'castaways' as OptionSource,
  values: '',
};

/**
 * Review-and-approve for one week's form. Everything generated is editable — the generator gets
 * the shape and the maths right, but only the admin knows that this week is a double elimination
 * or that an idol was already flushed.
 */
export function FormEditor({ episodeId }: { episodeId: string }) {
  const [data, setData] = useState<EpisodeDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { prompt: string; helpText: string; points: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(EMPTY_NEW_QUESTION);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/episodes/${episodeId}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load this episode.');
      setData(body);
      setDrafts(
        Object.fromEntries(
          (body.questions as FormQuestion[]).map((q) => [
            q.id,
            { prompt: q.prompt, helpText: q.helpText ?? '', points: String(q.points) },
          ]),
        ),
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this episode.');
    }
  }, [episodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveQuestions() {
    if (!data) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updates = data.questions
        .filter((q) => {
          const draft = drafts[q.id];
          return (
            draft &&
            (draft.prompt !== q.prompt ||
              draft.helpText !== (q.helpText ?? '') ||
              Number(draft.points) !== q.points)
          );
        })
        .map((q) => ({
          id: q.id,
          prompt: drafts[q.id].prompt,
          helpText: drafts[q.id].helpText || null,
          points: Number(drafts[q.id].points),
        }));

      if (updates.length === 0) {
        setMessage('Nothing changed.');
        return;
      }

      const response = await fetch(`/api/admin/episodes/${episodeId}/questions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not save.');
      setMessage(`Saved ${updates.length} question${updates.length === 1 ? '' : 's'}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion(questionId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/episodes/${episodeId}/questions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: [questionId] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not remove.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove.');
    } finally {
      setBusy(false);
    }
  }

  async function addQuestion() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const options =
        adding.source === 'custom'
          ? { source: 'custom', values: adding.values.split(/[\n,]/) }
          : { source: adding.source };
      const response = await fetch(`/api/admin/episodes/${episodeId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: adding.prompt,
          helpText: adding.helpText || null,
          points: Number(adding.points),
          options,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not add the question.');
      setAdding(EMPTY_NEW_QUESTION);
      setMessage('Question added.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the question.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: EpisodeStatus) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/episodes/${episodeId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not change status.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change status.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="card">Loading…</div>;

  const { episode, questions, submissions } = data;
  const total = questions.reduce((sum, q) => sum + q.points, 0);
  const editable = episode.status !== 'scored';

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Episode {episode.episodeNumber}</h1>
        <StatusBadge status={episode.status} />
      </div>

      <p className="muted small" style={{ margin: 0 }}>
        {questions.length} questions &middot; {total} points on the table &middot;{' '}
        {submissions.length} submitted
      </p>

      {error && <div className="notice notice--error">{error}</div>}
      {message && <div className="notice notice--ok">{message}</div>}

      <section className="card stack">
        <h2>Workflow</h2>
        <div className="row">
          {episode.status === 'draft' && (
            <button className="btn btn--primary" onClick={() => setStatus('approved')} disabled={busy}>
              Approve questions
            </button>
          )}
          {episode.status === 'approved' && (
            <>
              <button className="btn btn--primary" onClick={() => setStatus('open')} disabled={busy}>
                Open for picks
              </button>
              <button className="btn btn--ghost" onClick={() => setStatus('draft')} disabled={busy}>
                Back to draft
              </button>
            </>
          )}
          {episode.status === 'open' && (
            <button className="btn" onClick={() => setStatus('locked')} disabled={busy}>
              Lock picks
            </button>
          )}
          {episode.status === 'locked' && (
            <>
              <Link className="btn btn--primary" href={`/admin/forms/${episodeId}/results`}>
                Enter results
              </Link>
              <button className="btn btn--ghost" onClick={() => setStatus('open')} disabled={busy}>
                Reopen picks
              </button>
            </>
          )}
          {episode.status === 'scored' && (
            <>
              <Link className="btn btn--ghost" href={`/admin/forms/${episodeId}/results`}>
                Edit results
              </Link>
              <button className="btn btn--ghost" onClick={() => setStatus('locked')} disabled={busy}>
                Unlock to edit questions
              </button>
            </>
          )}
        </div>

        {episode.status === 'approved' && (
          <p className="muted small" style={{ margin: 0 }}>
            Opening publishes the form at <code>/episodic-picks</code>. That is the link to email
            round.
          </p>
        )}
      </section>

      <section className="card stack">
        <div className="card__title">
          <h2>Questions</h2>
          {editable && (
            <button className="btn btn--sm" onClick={saveQuestions} disabled={busy}>
              Save changes
            </button>
          )}
        </div>

        {!editable && (
          <div className="notice">
            This episode is scored. Unlock it above before editing questions — changing points now
            would silently rewrite the standings.
          </div>
        )}

        <div className="stack">
          {questions.map((question) => {
            const draft = drafts[question.id];
            if (!draft) return null;
            return (
              <div
                key={question.id}
                className="stack"
                style={{
                  gap: '0.6rem',
                  padding: '1rem',
                  border: '1px solid var(--hairline-soft)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="badge">{question.scoringKey}</span>
                  {editable && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => removeQuestion(question.id)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="field">
                  <label className="field__label small">Prompt</label>
                  <input
                    className="input"
                    value={draft.prompt}
                    disabled={!editable}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [question.id]: { ...prev[question.id], prompt: e.target.value },
                      }))
                    }
                  />
                </div>

                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <div className="field" style={{ flex: '2 1 16rem' }}>
                    <label className="field__label small">Help text</label>
                    <input
                      className="input"
                      value={draft.helpText}
                      disabled={!editable}
                      placeholder="Optional"
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [question.id]: { ...prev[question.id], helpText: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="field" style={{ flex: '0 1 7rem' }}>
                    <label className="field__label small">Points</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={draft.points}
                      disabled={!editable}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [question.id]: { ...prev[question.id], points: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>

                <details>
                  <summary className="muted small" style={{ cursor: 'pointer' }}>
                    {question.options.length} options
                  </summary>
                  <p className="small" style={{ marginTop: '0.4rem' }}>
                    {question.options.map((o) => o.label).join(', ')}
                  </p>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      {editable && (
        <section className="card stack">
          <h2>Add a question</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Added questions are scored on their own and count toward a Bonus column on the
            leaderboard.
          </p>

          <div className="field">
            <label className="field__label small">Prompt</label>
            <input
              className="input"
              value={adding.prompt}
              placeholder="Will anyone quit?"
              onChange={(e) => setAdding((prev) => ({ ...prev, prompt: e.target.value }))}
            />
          </div>

          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '2 1 16rem' }}>
              <label className="field__label small">Help text</label>
              <input
                className="input"
                value={adding.helpText}
                placeholder="Optional"
                onChange={(e) => setAdding((prev) => ({ ...prev, helpText: e.target.value }))}
              />
            </div>
            <div className="field" style={{ flex: '0 1 7rem' }}>
              <label className="field__label small">Points</label>
              <input
                className="input"
                type="number"
                min={0}
                value={adding.points}
                onChange={(e) => setAdding((prev) => ({ ...prev, points: e.target.value }))}
              />
            </div>
          </div>

          <div className="field">
            <span className="field__label small">Answers</span>
            <div className="choices">
              {(
                [
                  ['castaways', 'Castaways still playing'],
                  ['yes_no', 'Yes / No'],
                  ['custom', 'My own list'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`choice ${adding.source === value ? 'choice--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="new-question-source"
                    checked={adding.source === value}
                    onChange={() => setAdding((prev) => ({ ...prev, source: value }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {adding.source === 'custom' && (
            <div className="field">
              <label className="field__label small">Options, one per line or comma-separated</label>
              <textarea
                className="input"
                rows={4}
                value={adding.values}
                onChange={(e) => setAdding((prev) => ({ ...prev, values: e.target.value }))}
              />
            </div>
          )}

          <div className="row">
            <button
              className="btn btn--primary btn--sm"
              onClick={addQuestion}
              disabled={busy || !adding.prompt.trim()}
            >
              Add question
            </button>
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>Submissions ({submissions.length})</h2>
        {submissions.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nobody has picked yet.
          </p>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            {submissions.map((s) => s.displayName).join(', ')}
          </p>
        )}
      </section>
    </div>
  );
}

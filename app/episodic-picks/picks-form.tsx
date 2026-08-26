'use client';

import { useEffect, useState } from 'react';
import type { Episode, Question, QuestionOption } from '@/lib/types';
import { formatDeadline } from '@/lib/format';

type FormQuestion = Question & { options: QuestionOption[] };

/**
 * The participant flow, in two steps: say who you are, then pick. No password by design — this is
 * a pool between people who know each other, and a login screen is the thing most likely to stop
 * someone bothering.
 *
 * Names are remembered locally so nobody retypes theirs every week, and an existing submission is
 * loaded back in so reopening the form shows what you already chose rather than a blank slate.
 */
export function PicksForm({
  episode,
  questions,
  acceptingPicks,
}: {
  episode: Episode;
  questions: FormQuestion[];
  acceptingPicks: boolean;
}) {
  const [name, setName] = useState('');
  const [identified, setIdentified] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const remembered = window.localStorage.getItem('survivor.name');
    if (remembered) setName(remembered);
  }, []);

  async function identify(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter your name to continue.');
      return;
    }

    setError(null);
    setStatus('loading');
    try {
      const response = await fetch(
        `/api/submissions?episodeId=${encodeURIComponent(episode.id)}&name=${encodeURIComponent(trimmed)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not look you up.');

      if (data.submission?.answers) {
        setAnswers(data.submission.answers);
        setSavedAt(data.submission.submittedAt ?? null);
      }
      window.localStorage.setItem('survivor.name', trimmed);
      setIdentified(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not look you up.');
    } finally {
      setStatus('idle');
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const missing = questions.filter((q) => q.isRequired && !answers[q.id]);
    if (missing.length > 0) {
      setError(`Still to answer: ${missing.map((q) => q.prompt).join(', ')}`);
      return;
    }

    setStatus('saving');
    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: episode.id, name: name.trim(), answers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save your picks.');

      setSavedAt(data.submission?.submittedAt ?? new Date().toISOString());
      setStatus('saved');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your picks.');
      setStatus('idle');
    }
  }

  const deadline = formatDeadline(episode.locksAt);

  if (!identified) {
    return (
      <form className="card card--raised stack" onSubmit={identify}>
        <h2>Who&rsquo;s playing?</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Just your name — no password. Use the same one each week so your points add up.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shannon"
            autoComplete="name"
            maxLength={60}
          />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <button className="btn btn--primary" type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Checking…' : 'Continue'}
        </button>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card card--raised row" style={{ justifyContent: 'space-between' }}>
        <span>
          Playing as <strong>{name.trim()}</strong>
          {savedAt && <span className="muted small"> &middot; picks saved</span>}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setIdentified(false);
            setAnswers({});
            setSavedAt(null);
            setStatus('idle');
          }}
        >
          Not you?
        </button>
      </div>

      {!acceptingPicks && (
        <div className="notice">
          Picks are closed for this episode. Below is what you submitted.
        </div>
      )}

      {questions.map((question) => (
        <fieldset
          key={question.id}
          className="card stack"
          style={{ border: '1px solid var(--hairline-soft)', margin: 0, gap: '0.75rem' }}
          disabled={!acceptingPicks}
        >
          <legend style={{ padding: '0 0.4rem' }}>
            <span className="points">{question.points} pts</span>
          </legend>
          <div className="field">
            <span className="field__label">{question.prompt}</span>
            {question.helpText && <span className="field__help">{question.helpText}</span>}
          </div>

          {question.inputType === 'radio' ? (
            <div className="choices">
              {question.options.map((option) => (
                <label
                  key={option.id}
                  className={`choice ${answers[question.id] === option.value ? 'choice--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={option.value}
                    checked={answers[question.id] === option.value}
                    onChange={() =>
                      setAnswers((prev) => ({ ...prev, [question.id]: option.value }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          ) : (
            <select
              className="select"
              value={answers[question.id] ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
            >
              <option value="">Choose…</option>
              {question.options.map((option) => (
                <option key={option.id} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </fieldset>
      ))}

      {error && <div className="notice notice--error">{error}</div>}
      {status === 'saved' && (
        <div className="notice notice--ok">
          Picks locked in. You can change them until {deadline ?? 'the episode airs'}.
        </div>
      )}

      {acceptingPicks && (
        <button className="btn btn--primary" type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : savedAt ? 'Update my picks' : 'Submit my picks'}
        </button>
      )}
    </form>
  );
}

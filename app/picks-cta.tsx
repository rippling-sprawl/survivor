'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDeadline } from '@/lib/format';

/**
 * The home page's picks button. Who's playing only lives in this browser's localStorage (see
 * PicksForm), so whether they've already submitted can only be checked client-side — until then it
 * renders as if they haven't.
 */
export function PicksCta({
  episodeId,
  label,
  open,
  showSavedNote,
  children,
}: {
  episodeId: string;
  /** What the button says when there is no saved submission to edit. */
  label: string;
  open: boolean;
  /** Off once the episode has been scored and the page is pointing at next week. */
  showSavedNote: boolean;
  children?: React.ReactNode;
}) {
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const name = window.localStorage.getItem('survivor.name');
    if (!name) return;

    let cancelled = false;
    fetch(`/api/submissions?episodeId=${encodeURIComponent(episodeId)}&name=${encodeURIComponent(name)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setSavedAt(data?.submission?.submittedAt ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  const saved = savedAt ? formatDeadline(savedAt) : null;

  return (
    <>
      {saved && showSavedNote && (
        <p className="muted small" style={{ margin: 0 }}>
          Your picks were last saved {saved}.
        </p>
      )}
      <div className="row">
        <Link href="/episodic-picks" className="btn btn--primary">
          {open && saved ? 'Edit picks' : label}
        </Link>
        {children}
      </div>
    </>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * `debugEnabled` is passed down from the server pages rather than read here: this is a client
 * component, so it cannot see ENABLE_DEBUG_MODE, and the link should be absent in a deployment
 * where debug mode is off rather than present and dead.
 */
export function AdminNav({
  children,
  debugEnabled = false,
}: {
  children?: React.ReactNode;
  debugEnabled?: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div className="row">
        <Link href="/admin/forms" className="btn btn--ghost btn--sm">
          Manage forms
        </Link>
        <Link href="/admin/seasons" className="btn btn--ghost btn--sm">
          Seasons
        </Link>
        {debugEnabled && (
          <Link href="/admin/debug" className="btn btn--ghost btn--sm">
            Debug
          </Link>
        )}
        {children}
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}

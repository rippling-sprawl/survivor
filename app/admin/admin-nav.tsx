'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function AdminNav({ children }: { children?: React.ReactNode }) {
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
        {children}
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}

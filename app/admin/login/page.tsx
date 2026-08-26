'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(
    params.get('error') === 'unconfigured'
      ? 'Admin is not configured yet — set ADMIN_PASSCODE and SESSION_SECRET in .env.local.'
      : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not sign in.');
      router.push(params.get('next') ?? '/admin/forms');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  return (
    <form className="card card--raised stack" onSubmit={submit} style={{ maxWidth: '26rem' }}>
      <h2>Admin</h2>
      <div className="field">
        <label className="field__label" htmlFor="passcode">
          Passcode
        </label>
        <input
          id="passcode"
          className="input"
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      {error && <div className="notice notice--error">{error}</div>}
      <button className="btn btn--primary" type="submit" disabled={busy}>
        {busy ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="page stack">
      <h1>Sign in</h1>
      <Suspense fallback={<div className="card">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

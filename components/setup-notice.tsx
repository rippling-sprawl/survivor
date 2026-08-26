/**
 * Shown instead of a stack trace when the app is running without a database. The first thing
 * anyone does with this repo is clone it before creating a Supabase project, and a page that
 * explains the next step is more useful than a 500.
 */
export function SetupNotice({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const isConfig = message.includes('not configured') || message.includes('Missing ');

  return (
    <div className="page stack">
      <h1>{isConfig ? 'Not set up yet' : 'Something went wrong'}</h1>
      {isConfig ? (
        <div className="card stack">
          <p style={{ margin: 0 }}>
            Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Supabase
            URL and service-role key, then apply{' '}
            <code>supabase/migrations/0001_survivor_schema.sql</code> in the Supabase SQL editor.
          </p>
          <p className="muted small" style={{ margin: 0 }}>
            Once that is done, <code>npm run seed</code> loads Season 50.
          </p>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {message}
          </p>
        </div>
      )}
    </div>
  );
}

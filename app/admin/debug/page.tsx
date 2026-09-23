import { AdminNav } from '../admin-nav';
import { isDebugEnvironment } from '@/lib/debug/config';
import { Notice } from '@/components/ui';
import { DebugPanel } from './debug-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Debug · Survivor Pick'em" };

/**
 * The debug screen. Gated twice over: this page will not render the panel at all outside an
 * environment that allows debug mode, and every endpoint the panel calls re-checks for itself —
 * a page-level check alone would be worth nothing to anything calling the API directly.
 */
export default function AdminDebugPage() {
  const enabled = isDebugEnvironment();

  return (
    <div className="page stack">
      <AdminNav debugEnabled={enabled} />
      <h1>Debug mode</h1>

      {enabled ? (
        <DebugPanel />
      ) : (
        <Notice tone="error">
          Debug mode is off in this environment. It is available automatically in development, or
          set <code>ENABLE_DEBUG_MODE=true</code> to allow it here.
        </Notice>
      )}
    </div>
  );
}

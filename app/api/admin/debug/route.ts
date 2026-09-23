import { cookies } from 'next/headers';
import { fail, handleError, ok } from '@/lib/api';
import { debugCookieOptions, createDebugToken, debugGateState } from '@/lib/debug/gate';
import { DEBUG_COOKIE, DEBUG_PARTICIPANTS, DEBUG_SEASON_NUMBER } from '@/lib/debug/config';
import { debugStatus } from '@/lib/debug/runner';

export const dynamic = 'force-dynamic';

/**
 * Debug mode's own status and arm/disarm switch.
 *
 * This is the one debug endpoint that does not require the debug cookie — it is how the cookie is
 * obtained. It is still behind the admin session, because proxy.ts gates everything under
 * /api/admin, and it still refuses to mint a token in an environment that disallows debug mode.
 */

export async function GET() {
  try {
    const gate = await debugGateState();
    return ok({
      gate,
      seasonNumber: DEBUG_SEASON_NUMBER,
      participants: [...DEBUG_PARTICIPANTS],
      // Only read the database once debug mode is actually armed.
      status: gate.enabled ? await debugStatus() : null,
    });
  } catch (error) {
    return handleError('GET /api/admin/debug', error);
  }
}

export async function POST(request: Request) {
  try {
    const { action } = (await request.json().catch(() => ({}))) as { action?: string };
    const store = await cookies();

    if (action === 'disarm') {
      store.delete(DEBUG_COOKIE);
      return ok({ gate: { ...(await debugGateState()), cookiePresent: false, enabled: false } });
    }

    if (action !== 'arm') return fail('action must be "arm" or "disarm".');

    const gate = await debugGateState();
    if (!gate.environmentAllows) {
      return fail(
        'Debug mode is off in this environment. Set ENABLE_DEBUG_MODE=true to allow it here.',
        403,
      );
    }
    const secret = process.env.SESSION_SECRET;
    if (!secret) return fail('Debug mode needs SESSION_SECRET set to sign its cookie.', 503);

    store.set({ ...debugCookieOptions, value: await createDebugToken(secret) });
    return ok({ gate: { ...gate, cookiePresent: true, enabled: true } });
  } catch (error) {
    return handleError('POST /api/admin/debug', error);
  }
}

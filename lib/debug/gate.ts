import { cookies } from 'next/headers';
import { sign, safeEqual } from '../admin-session';
import { ValidationError } from '../errors';
import { DEBUG_COOKIE, isDebugEnvironment } from './config';

/**
 * The debug-mode gate.
 *
 * Three independent things have to be true before any dummy data is written, and each one is
 * there to cover a different mistake:
 *
 * 1. The environment allows it (`isDebugEnvironment`) — stops a production deployment from
 *    exposing this at all unless someone deliberately turned it on.
 * 2. A signed debug cookie is present — stops a stray fetch, a bookmarked URL, or a browser tab
 *    left open from a week ago from firing a destructive endpoint by accident.
 * 3. An admin session — already enforced for everything under /api/admin by proxy.ts.
 *
 * The cookie is signed rather than a flag like `debug=1` so it cannot be conjured from the
 * browser console; the token is namespaced under a `debug.` payload prefix so it is not
 * interchangeable with an admin session token, even though both are signed with SESSION_SECRET.
 */

const MAX_AGE_SECONDS = 60 * 60 * 2;

export async function createDebugToken(secret: string): Promise<string> {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `debug.${expiresAt}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyDebugToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [role, expiresAt, signature] = parts;
  if (role !== 'debug') return false;

  const expected = await sign(`${role}.${expiresAt}`, secret);
  if (!safeEqual(signature, expected)) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && Date.now() < expiry;
}

export const debugCookieOptions = {
  name: DEBUG_COOKIE,
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === 'production',
};

export interface DebugGateState {
  /** The environment permits debug mode. */
  environmentAllows: boolean;
  /** A valid, unexpired debug cookie is on this request. */
  cookiePresent: boolean;
  /** Both of the above — debug endpoints will run. */
  enabled: boolean;
  /** Missing SESSION_SECRET means the cookie can be neither minted nor checked. */
  configured: boolean;
}

export async function debugGateState(): Promise<DebugGateState> {
  const secret = process.env.SESSION_SECRET;
  const environmentAllows = isDebugEnvironment();
  const store = await cookies();
  const cookiePresent = secret
    ? await verifyDebugToken(store.get(DEBUG_COOKIE)?.value, secret)
    : false;

  return {
    environmentAllows,
    cookiePresent,
    configured: !!secret,
    enabled: environmentAllows && cookiePresent,
  };
}

/**
 * Throws unless debug mode is fully armed. Every debug route calls this first; the messages are
 * deliberately specific because the person hitting them is the developer trying to turn it on.
 */
export async function assertDebugMode(): Promise<void> {
  const state = await debugGateState();

  if (!state.environmentAllows) {
    throw new ValidationError(
      'Debug mode is off in this environment. It runs in development automatically, or set ' +
        'ENABLE_DEBUG_MODE=true to allow it here.',
      403,
    );
  }
  if (!state.configured) {
    throw new ValidationError('Debug mode needs SESSION_SECRET set to sign its cookie.', 503);
  }
  if (!state.cookiePresent) {
    throw new ValidationError(
      'Debug mode is not armed for this browser. Press "Arm debug mode" first.',
      403,
    );
  }
}

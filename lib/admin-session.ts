/**
 * Admin sessions.
 *
 * Participants never log in — that is the whole appeal of the pool. The admin area is the only
 * thing that needs protecting, and it has exactly one user, so a shared passcode exchanged for a
 * signed cookie is the right amount of machinery. No user table, no password reset, no email.
 *
 * Uses Web Crypto rather than node:crypto so the identical code runs in middleware (edge runtime)
 * and in route handlers.
 */

const COOKIE_NAME = 'survivor_admin';
const MAX_AGE_SECONDS = 60 * 60 * 12;

export { COOKIE_NAME as ADMIN_COOKIE };

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

/** Length-independent compare, so a wrong token cannot be narrowed down by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string): Promise<string> {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `admin.${expiresAt}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [role, expiresAt, signature] = parts;
  if (role !== 'admin') return false;

  const expected = await sign(`${role}.${expiresAt}`, secret);
  if (!safeEqual(signature, expected)) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && Date.now() < expiry;
}

export const sessionCookieOptions = {
  name: COOKIE_NAME,
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === 'production',
};

/** Constant-time passcode check, same reasoning as the signature compare. */
export function passcodeMatches(supplied: string, expected: string): boolean {
  return safeEqual(supplied, expected);
}

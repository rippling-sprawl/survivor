import { safeEqual, sign } from './admin-session';
import type { Episode } from './types';

/**
 * Late-entry codes. The admin hands one to someone who missed the deadline but hasn't watched yet,
 * and it lets that person — and only that person, for that episode — submit after lock.
 *
 * Nothing is stored: a code is an HMAC of the episode and the player's name under the session
 * secret, so the server can re-derive it to check. Tying it to the name means a code passed along
 * to someone else is useless to them.
 */

// No 0/O, 1/I/L: these get read aloud and typed from a text message.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function lateCodeFor(episodeId: string, name: string, secret: string): Promise<string> {
  const signature = await sign(`late.${episodeId}.${normalizeName(name)}`, secret);
  let code = '';
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[signature.charCodeAt(i) % ALPHABET.length];
  return code;
}

export async function lateCodeMatches(
  episodeId: string,
  name: string,
  code: string,
  secret: string,
): Promise<boolean> {
  return safeEqual(normalizeCode(code), await lateCodeFor(episodeId, name, secret));
}

/**
 * Late codes work past the deadline but not past grading: once results are in, a "late" pick
 * would just be copying the answer key.
 */
export const acceptsLateEntries = (episode: Pick<Episode, 'status'>) =>
  episode.status === 'open' || episode.status === 'locked';

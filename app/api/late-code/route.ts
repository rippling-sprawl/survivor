import { getEpisode } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';
import { required } from '@/lib/env';
import { acceptsLateEntries, lateCodeMatches } from '@/lib/late-codes';

export const dynamic = 'force-dynamic';

/**
 * Lets the picks form check a late code before unlocking the questions, so a typo shows up
 * straight away rather than after someone has filled everything in. Submitting re-checks it.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      episodeId?: string;
      name?: string;
      code?: string;
    };
    if (!body.episodeId || !body.name?.trim() || !body.code?.trim()) {
      return fail('episodeId, name and code are all required.');
    }

    const episode = await getEpisode(body.episodeId);
    if (!episode) return fail('No such episode.', 404);
    if (!acceptsLateEntries(episode)) return fail('This episode has already been scored.', 409);

    const valid = await lateCodeMatches(episode.id, body.name, body.code, required('SESSION_SECRET'));
    if (!valid) return fail('That code doesn’t match your name for this episode.', 403);
    return ok({ valid: true });
  } catch (error) {
    return handleError('POST /api/late-code', error);
  }
}

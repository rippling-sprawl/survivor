import { getEpisode } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';
import { required } from '@/lib/env';
import { acceptsLateEntries, lateCodeFor } from '@/lib/late-codes';

export const dynamic = 'force-dynamic';

/** Mints the late-entry code for one player on this episode. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const episode = await getEpisode(id);
    if (!episode) return fail('No such episode.', 404);
    if (!acceptsLateEntries(episode)) {
      return fail('Late codes only work while an episode is open or locked, not once it is scored.', 409);
    }

    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = body.name?.trim();
    if (!name) return fail('Enter the player’s name exactly as they use it.');

    return ok({ name, code: await lateCodeFor(episode.id, name, required('SESSION_SECRET')) });
  } catch (error) {
    return handleError('POST /api/admin/episodes/[id]/late-code', error);
  }
}

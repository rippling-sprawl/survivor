import { getEpisodeForm, isAcceptingPicks } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const form = await getEpisodeForm(id);
    if (!form) return fail('No such episode.', 404);
    return ok({ ...form, acceptingPicks: isAcceptingPicks(form.episode) });
  } catch (error) {
    return handleError('GET /api/episodes/[id]', error);
  }
}

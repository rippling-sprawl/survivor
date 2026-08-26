import { getAnswerKey, getEpisodeForm, listEpisodeSubmissions, updateEpisode } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const form = await getEpisodeForm(id);
    if (!form) return fail('No such episode.', 404);
    const [answerKey, submissions] = await Promise.all([
      getAnswerKey(id),
      listEpisodeSubmissions(id),
    ]);
    return ok({ ...form, answerKey, submissions });
  } catch (error) {
    return handleError('GET /api/admin/episodes/[id]', error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    return ok({ episode: await updateEpisode(id, body) });
  } catch (error) {
    return handleError('PATCH /api/admin/episodes/[id]', error);
  }
}

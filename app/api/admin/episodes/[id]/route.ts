import {
  getAdminEpisodeForm,
  getAnswerKey,
  listEpisodeSubmissions,
  seedSpareQuestions,
  updateEpisode,
} from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';
import type { EpisodeNote } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let form = await getAdminEpisodeForm(id);
    if (!form) return fail('No such episode.', 404);
    // Episodes generated before spares existed get theirs the first time the admin opens them.
    if (await seedSpareQuestions(form)) form = (await getAdminEpisodeForm(id))!;
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
    if ('notes' in body) {
      if (!Array.isArray(body.notes)) return fail('Notes must be a list.');
      const notes: EpisodeNote[] = [];
      for (const note of body.notes) {
        const heading = typeof note?.heading === 'string' ? note.heading.trim() : '';
        const text = typeof note?.body === 'string' ? note.body.trim() : '';
        if (!heading && !text) continue;
        if (!heading || !text) return fail('Every note needs both a heading and a body.');
        notes.push({ heading, body: text });
      }
      body.notes = notes;
    }
    return ok({ episode: await updateEpisode(id, body) });
  } catch (error) {
    return handleError('PATCH /api/admin/episodes/[id]', error);
  }
}

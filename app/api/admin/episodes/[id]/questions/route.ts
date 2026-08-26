import { deleteQuestion, getEpisodeForm, updateQuestion } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Body {
  updates?: {
    id: string;
    prompt?: string;
    helpText?: string | null;
    points?: number;
    sortOrder?: number;
    isRequired?: boolean;
  }[];
  remove?: string[];
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const form = await getEpisodeForm(id);
    if (!form) return fail('No such episode.', 404);
    if (form.episode.status === 'scored') {
      return fail('This episode is already scored. Unlock it before editing questions.', 409);
    }

    const body = (await request.json()) as Body;
    const owned = new Set(form.questions.map((q) => q.id));

    for (const update of body.updates ?? []) {
      if (!owned.has(update.id)) return fail('That question is not part of this episode.', 400);
      if (update.points !== undefined && (!Number.isInteger(update.points) || update.points < 0)) {
        return fail('Points must be a whole number of zero or more.');
      }
      await updateQuestion(update.id, update);
    }

    for (const questionId of body.remove ?? []) {
      if (!owned.has(questionId)) return fail('That question is not part of this episode.', 400);
      await deleteQuestion(questionId);
    }

    return ok(await getEpisodeForm(id));
  } catch (error) {
    return handleError('PATCH /api/admin/episodes/[id]/questions', error);
  }
}

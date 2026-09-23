import { addQuestion, deleteQuestion, getEpisodeForm, updateQuestion, type NewQuestionOptions } from '@/lib/db';
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

interface AddBody {
  prompt?: string;
  helpText?: string | null;
  points?: number;
  isRequired?: boolean;
  options?: NewQuestionOptions;
}

/** Adds a one-off question with its own scoring key. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const form = await getEpisodeForm(id);
    if (!form) return fail('No such episode.', 404);
    if (form.episode.status === 'scored') {
      return fail('This episode is already scored. Unlock it before adding questions.', 409);
    }

    const body = (await request.json()) as AddBody;
    const prompt = body.prompt?.trim();
    if (!prompt) return fail('A question needs a prompt.');
    if (!Number.isInteger(body.points) || (body.points as number) < 0) {
      return fail('Points must be a whole number of zero or more.');
    }
    const source = body.options?.source;
    if (source !== 'castaways' && source !== 'yes_no' && source !== 'custom') {
      return fail('Choose where the answer options come from.');
    }
    if (source === 'custom' && !Array.isArray((body.options as { values?: unknown }).values)) {
      return fail('List the answer options.');
    }

    await addQuestion(form.episode, form.questions, {
      prompt,
      helpText: body.helpText?.trim() || null,
      points: body.points as number,
      isRequired: body.isRequired !== false,
      options: body.options as NewQuestionOptions,
    });

    return ok(await getEpisodeForm(id), { status: 201 });
  } catch (error) {
    return handleError('POST /api/admin/episodes/[id]/questions', error);
  }
}

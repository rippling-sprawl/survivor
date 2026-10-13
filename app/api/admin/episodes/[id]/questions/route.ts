import { addQuestion, getAdminEpisodeForm, updateQuestion, type NewQuestionOptions } from '@/lib/db';
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
  /** Moved to the inactive section rather than deleted, so a removal can be undone. */
  remove?: string[];
  /** Inactive questions to put back on the form. */
  activate?: string[];
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const form = await getAdminEpisodeForm(id);
    if (!form) return fail('No such episode.', 404);
    if (form.episode.status === 'scored') {
      return fail('This episode is already scored. Unlock it before editing questions.', 409);
    }

    const body = (await request.json()) as Body;
    const owned = new Set([...form.questions, ...form.inactiveQuestions].map((q) => q.id));

    for (const update of body.updates ?? []) {
      if (!owned.has(update.id)) return fail('That question is not part of this episode.', 400);
      if (update.points !== undefined && (!Number.isInteger(update.points) || update.points < 0)) {
        return fail('Points must be a whole number of zero or more.');
      }
      await updateQuestion(update.id, update);
    }

    for (const [ids, isActive] of [
      [body.remove ?? [], false],
      [body.activate ?? [], true],
    ] as const) {
      for (const questionId of ids) {
        if (!owned.has(questionId)) return fail('That question is not part of this episode.', 400);
        await updateQuestion(questionId, { isActive });
      }
    }

    return ok(await getAdminEpisodeForm(id));
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
    const form = await getAdminEpisodeForm(id);
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

    await addQuestion(form.episode, [...form.questions, ...form.inactiveQuestions], {
      prompt,
      helpText: body.helpText?.trim() || null,
      points: body.points as number,
      isRequired: body.isRequired !== false,
      options: body.options as NewQuestionOptions,
    });

    return ok(await getAdminEpisodeForm(id), { status: 201 });
  } catch (error) {
    return handleError('POST /api/admin/episodes/[id]/questions', error);
  }
}

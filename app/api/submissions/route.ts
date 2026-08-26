import {
  findOrCreateUser,
  getEpisodeForm,
  findUser,
  getSubmission,
  isAcceptingPicks,
  saveSubmission,
} from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface SubmitBody {
  episodeId?: string;
  name?: string;
  /** Keyed by question id. */
  answers?: Record<string, string>;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubmitBody;
    const name = body.name?.trim();

    if (!name) return fail('Enter your name to submit picks.');
    if (name.length > 60) return fail('That name is too long.');
    if (!body.episodeId) return fail('Missing episode.');

    const form = await getEpisodeForm(body.episodeId);
    if (!form) return fail('No such episode.', 404);

    // Re-checked here rather than trusted from the client: the deadline is the whole point.
    if (!isAcceptingPicks(form.episode)) {
      return fail('This episode is closed for picks.', 409);
    }

    // Only accept answers to questions this episode actually asked, and require the required ones.
    const answers: Record<string, string> = {};
    const missing: string[] = [];
    for (const question of form.questions) {
      const value = body.answers?.[question.id]?.trim();
      if (!value) {
        if (question.isRequired) missing.push(question.prompt);
        continue;
      }
      if (question.options.length > 0 && !question.options.some((o) => o.value === value)) {
        return fail(`"${value}" is not an option for "${question.prompt}".`);
      }
      answers[question.id] = value;
    }

    if (missing.length > 0) {
      return fail(`Still to answer: ${missing.join(', ')}`);
    }

    const user = await findOrCreateUser(name);
    await saveSubmission({ episodeId: form.episode.id, userId: user.id, answers });

    return ok({ saved: true, user, submission: await getSubmission(form.episode.id, user.id) });
  } catch (error) {
    return handleError('POST /api/submissions', error);
  }
}

/** Lets someone reopen the form and see what they already picked. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const episodeId = url.searchParams.get('episodeId');
    const name = url.searchParams.get('name')?.trim();
    if (!episodeId || !name) return fail('episodeId and name are both required.');

    // Deliberately does not create: typing a name to peek should not add a player to the pool.
    const user = await findUser(name);
    if (!user) return ok({ user: null, submission: null });
    return ok({ user, submission: await getSubmission(episodeId, user.id) });
  } catch (error) {
    return handleError('GET /api/submissions', error);
  }
}

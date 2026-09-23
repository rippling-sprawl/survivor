import { fail, handleError, ok } from '@/lib/api';
import { assertDebugMode } from '@/lib/debug/gate';
import { scoreDebugEpisode, debugStatus } from '@/lib/debug/runner';

export const dynamic = 'force-dynamic';

/**
 * "Score dummy entries" — reads a block of recap text, turns it into an answer key, and grades the
 * dummy submissions with it. The response carries both what the pipeline produced and what an
 * independent check expected, so the caller can see agreement rather than infer it.
 */
export async function POST(request: Request) {
  try {
    await assertDebugMode();
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    if (!body.text?.trim()) return fail('Paste some recap text to score from.');

    const result = await scoreDebugEpisode(body.text);
    return ok({ ...result, status: await debugStatus() });
  } catch (error) {
    return handleError('POST /api/admin/debug/score', error);
  }
}

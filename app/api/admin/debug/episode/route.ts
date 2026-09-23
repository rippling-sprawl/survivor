import { handleError, ok } from '@/lib/api';
import { assertDebugMode } from '@/lib/debug/gate';
import { generateDebugEpisode, debugStatus } from '@/lib/debug/runner';

export const dynamic = 'force-dynamic';

/**
 * "Generate episodic form" — builds the next week's form, opens it, and files a submission for
 * every template participant.
 */
export async function POST(request: Request) {
  try {
    await assertDebugMode();
    const body = (await request.json().catch(() => ({}))) as { includeSecondVoteOut?: boolean };
    const result = await generateDebugEpisode({
      includeSecondVoteOut: body.includeSecondVoteOut,
    });
    return ok({ ...result, status: await debugStatus() }, { status: 201 });
  } catch (error) {
    return handleError('POST /api/admin/debug/episode', error);
  }
}

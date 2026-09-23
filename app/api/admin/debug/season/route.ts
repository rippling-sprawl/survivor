import { handleError, ok } from '@/lib/api';
import { assertDebugMode } from '@/lib/debug/gate';
import { generateDebugSeason, debugStatus } from '@/lib/debug/runner';

export const dynamic = 'force-dynamic';

/** "Generate season" — creates the dummy season and roster, replacing any previous debug run. */
export async function POST() {
  try {
    await assertDebugMode();
    const result = await generateDebugSeason();
    return ok({ ...result, status: await debugStatus() }, { status: 201 });
  } catch (error) {
    return handleError('POST /api/admin/debug/season', error);
  }
}

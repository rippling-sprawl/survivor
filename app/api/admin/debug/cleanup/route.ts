import { handleError, ok } from '@/lib/api';
import { assertDebugMode } from '@/lib/debug/gate';
import { cleanupDebugData, debugStatus } from '@/lib/debug/runner';

export const dynamic = 'force-dynamic';

/**
 * "Clean database" — removes every row debug mode created and reports anything it could not.
 * Safe to press at any point, including twice: with nothing to remove it reports all zeroes.
 */
export async function POST() {
  try {
    await assertDebugMode();
    const result = await cleanupDebugData();
    return ok({ ...result, status: await debugStatus() });
  } catch (error) {
    return handleError('POST /api/admin/debug/cleanup', error);
  }
}

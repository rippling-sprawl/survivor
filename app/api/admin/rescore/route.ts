import { getCurrentSeason, getSeasonByNumber, rescoreSeason } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Manual re-run. Scoring is idempotent, so this is always safe to press. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { seasonNumber?: number };
    const season =
      body.seasonNumber !== undefined
        ? await getSeasonByNumber(body.seasonNumber)
        : await getCurrentSeason();
    if (!season) return fail('No season to score.', 404);

    const result = await rescoreSeason(season);
    return ok({ season: season.number, questionsScored: result.rows.length });
  } catch (error) {
    return handleError('POST /api/admin/rescore', error);
  }
}

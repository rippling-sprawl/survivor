import { getLeaderboard, getSeasonByNumber } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ number: string }> }) {
  try {
    const { number } = await params;
    const seasonNumber = Number(number);
    if (!Number.isInteger(seasonNumber)) return fail('Season must be a number.', 400);

    const season = await getSeasonByNumber(seasonNumber);
    if (!season) return fail(`No season ${seasonNumber}.`, 404);

    return ok(await getLeaderboard(season));
  } catch (error) {
    return handleError('GET /api/seasons/[number]/leaderboard', error);
  }
}

import { listCastaways, listSeasons, rescoreSeason, setSeasonWinner } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Declaring the Sole Survivor is the single biggest scoring event of the season: every week's
 * "who wins?" pick has been sitting at zero until now, and setting this grades all of them at
 * once, at each week's rate.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { shortName } = (await request.json()) as { shortName?: string | null };

    const season = (await listSeasons()).find((s) => s.id === id);
    if (!season) return fail('No such season.', 404);

    if (shortName) {
      const castaways = await listCastaways(id);
      if (!castaways.some((c) => c.shortName === shortName)) {
        return fail(`"${shortName}" is not a castaway this season.`);
      }
    }

    const updated = await setSeasonWinner(id, shortName ?? null);
    const result = await rescoreSeason(updated);
    return ok({ season: updated, scored: result.rows.length });
  } catch (error) {
    return handleError('POST season winner', error);
  }
}

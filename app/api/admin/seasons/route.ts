import { createSeason, listSeasons } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Body {
  number?: number;
  name?: string;
  wikiUrl?: string | null;
  mergeEpisode?: number | null;
  finaleEpisode?: number | null;
  tribes?: { name: string; label: string; color: string | null }[];
  castaways?: { shortName: string; fullName: string | null; tribe: string | null }[];
  makeActive?: boolean;
}

export async function GET() {
  try {
    return ok({ seasons: await listSeasons() });
  } catch (error) {
    return handleError('GET /api/admin/seasons', error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (!Number.isInteger(body.number)) return fail('A season number is required.');
    if (!body.name?.trim()) return fail('A season name is required.');
    if (!body.castaways || body.castaways.length === 0) {
      return fail('Add the castaway roster — it sets both the dropdowns and the point values.');
    }

    const result = await createSeason({
      number: body.number as number,
      name: body.name.trim(),
      wikiUrl: body.wikiUrl ?? null,
      mergeEpisode: body.mergeEpisode ?? null,
      finaleEpisode: body.finaleEpisode ?? null,
      tribes: body.tribes ?? [],
      castaways: body.castaways,
      makeActive: body.makeActive,
    });
    return ok(result, { status: 201 });
  } catch (error) {
    return handleError('POST /api/admin/seasons', error);
  }
}

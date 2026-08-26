import { listCastaways, listSeasons, updateSeason } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const season = (await listSeasons()).find((s) => s.id === id);
    if (!season) return fail('No such season.', 404);
    return ok({ season, castaways: await listCastaways(id) });
  } catch (error) {
    return handleError('GET /api/admin/seasons/[id]', error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const season = await updateSeason(id, await request.json());
    if (!season) return fail('Nothing to update.');
    return ok({ season });
  } catch (error) {
    return handleError('PATCH /api/admin/seasons/[id]', error);
  }
}

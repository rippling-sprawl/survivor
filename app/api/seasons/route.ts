import { listSeasons } from '@/lib/db';
import { handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok({ seasons: await listSeasons() });
  } catch (error) {
    return handleError('GET /api/seasons', error);
  }
}

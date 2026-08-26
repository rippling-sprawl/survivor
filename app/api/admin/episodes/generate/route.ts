import { generateNextEpisode, getCurrentSeason, getSeasonByNumber } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Body {
  seasonNumber?: number;
  episodeNumber?: number;
  includeSecondVoteOut?: boolean;
  title?: string | null;
  airDate?: string | null;
  wikiEpisodeNumber?: number | null;
  locksAt?: string | null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const season =
      body.seasonNumber !== undefined
        ? await getSeasonByNumber(body.seasonNumber)
        : await getCurrentSeason();
    if (!season) return fail('No season to add an episode to.', 404);

    const result = await generateNextEpisode(season, {
      episodeNumber: body.episodeNumber,
      includeSecondVoteOut: body.includeSecondVoteOut,
      title: body.title ?? null,
      airDate: body.airDate ?? null,
      wikiEpisodeNumber: body.wikiEpisodeNumber ?? null,
      locksAt: body.locksAt ?? null,
    });
    return ok(result, { status: 201 });
  } catch (error) {
    return handleError('POST /api/admin/episodes/generate', error);
  }
}

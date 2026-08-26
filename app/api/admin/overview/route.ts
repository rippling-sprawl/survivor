import { getCurrentSeason, listCastaways, listEpisodes, listSeasons } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';
import { shapeFor } from '@/lib/question-templates';
import { pointsFor } from '@/lib/points';

export const dynamic = 'force-dynamic';

/** Everything the admin forms list needs, including a preview of what "generate next" would do. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const seasonNumber = url.searchParams.get('season');
    const seasons = await listSeasons();
    const season = seasonNumber
      ? seasons.find((s) => s.number === Number(seasonNumber))
      : await getCurrentSeason();
    if (!season) return fail('No seasons have been set up yet.', 404);

    const [episodes, castaways] = await Promise.all([
      listEpisodes(season.id),
      listCastaways(season.id),
    ]);

    const nextEpisodeNumber =
      episodes.length === 0 ? 1 : Math.max(...episodes.map((e) => e.episodeNumber)) + 1;
    const remaining = castaways.filter(
      (c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= nextEpisodeNumber,
    );
    const shape = shapeFor(nextEpisodeNumber, season.mergeEpisode, season.finaleEpisode);
    const isFinale = shape === 'finale';

    return ok({
      season,
      seasons,
      episodes,
      castaways,
      next: {
        episodeNumber: nextEpisodeNumber,
        shape,
        remaining: remaining.length,
        survivors: remaining.map((c) => c.shortName),
        // Shown before generating so the admin can sanity-check the week's stakes.
        samplePoints: {
          voted_out: pointsFor('voted_out', { remaining: remaining.length, isFinale }),
          win_immunity: pointsFor('win_immunity', { remaining: remaining.length, isFinale }),
          hidden_idol: pointsFor('hidden_idol', { remaining: remaining.length, isFinale }),
        },
      },
    });
  } catch (error) {
    return handleError('GET /api/admin/overview', error);
  }
}

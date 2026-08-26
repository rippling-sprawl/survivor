import { getCurrentEpisode, getCurrentSeason, getEpisodeForm, isAcceptingPicks } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** What /episodic-picks lands on: the open form, or the most recent one to look back at. */
export async function GET() {
  try {
    const season = await getCurrentSeason();
    if (!season) return fail('No seasons have been set up yet.', 404);

    const episode = await getCurrentEpisode(season.id);
    if (!episode) return ok({ season, episode: null, questions: [], acceptingPicks: false });

    const form = await getEpisodeForm(episode.id);
    return ok({
      season,
      episode: form?.episode ?? episode,
      questions: form?.questions ?? [],
      acceptingPicks: isAcceptingPicks(episode),
    });
  } catch (error) {
    return handleError('GET /api/episodes/current', error);
  }
}

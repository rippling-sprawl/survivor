import {
  getAnswerKey,
  getEpisode,
  getSeasonByNumber,
  listSeasons,
  markEliminated,
  rescoreSeason,
  saveAnswerKey,
  updateEpisode,
} from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';
import { SCORING_KEYS, type ScoringKey } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Body {
  answerKey?: Partial<Record<ScoringKey, string[]>>;
  /** Short names of everyone who left this episode, in the order they went. */
  eliminated?: string[];
  /** Set false to save results without grading yet (e.g. half the answers are still unknown). */
  score?: boolean;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok({ answerKey: await getAnswerKey(id) });
  } catch (error) {
    return handleError('GET answer-key', error);
  }
}

/**
 * Saving results does three things in one step, because doing any of them without the others
 * leaves the pool in a wrong state: it records the answers, records who went home (which sets
 * next week's options and point values), and re-scores the whole season.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const episode = await getEpisode(id);
    if (!episode) return fail('No such episode.', 404);

    const body = (await request.json()) as Body;

    const entries: Partial<Record<ScoringKey, string[]>> = {};
    for (const [key, values] of Object.entries(body.answerKey ?? {})) {
      if (!SCORING_KEYS.includes(key as ScoringKey)) return fail(`Unknown answer key "${key}".`);
      entries[key as ScoringKey] = (values ?? []).filter((v) => typeof v === 'string');
    }

    const seasons = await listSeasons();
    const season = seasons.find((s) => s.id === episode.seasonId);
    if (!season) return fail('This episode has no season.', 500);

    await saveAnswerKey(id, entries);

    if (body.eliminated) {
      await markEliminated(season.id, episode.episodeNumber, body.eliminated);
    }

    if (body.score !== false) {
      if (episode.status !== 'scored') await updateEpisode(id, { status: 'scored' });
      // The whole season is re-scored, not just this episode: the season-winner sweep grades
      // every week at once, so partial scoring would go stale the moment a finale lands.
      const refreshed = (await getSeasonByNumber(season.number)) ?? season;
      await rescoreSeason(refreshed);
    }

    return ok({ answerKey: await getAnswerKey(id), scored: body.score !== false });
  } catch (error) {
    return handleError('PUT answer-key', error);
  }
}

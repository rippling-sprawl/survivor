import { getCurrentSeason, getEpisode, listCastaways } from '@/lib/db';
import { fetchWikiEpisodes, suggestAnswerKey } from '@/lib/wiki';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Suggestions only. Wikipedia's episode numbering does not track the pool's — Season 50 drifted
 * as soon as an episode aired without a tribal council — so the response includes every parsed
 * row and the raw table cells, and the admin decides which one this week actually was.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const episodeId = url.searchParams.get('episodeId');
    const wikiEpisodeParam = url.searchParams.get('wikiEpisode');

    const season = await getCurrentSeason();
    if (!season) return fail('No season configured.', 404);
    if (!season.wikiUrl) return fail('This season has no Wikipedia URL set.', 409);

    const episodes = await fetchWikiEpisodes(season.wikiUrl);
    if (episodes.length === 0) {
      return fail('Could not find an episode table on that Wikipedia page.', 502);
    }

    const castaways = await listCastaways(season.id);
    const tribeLabels = [
      ...new Set(castaways.map((c) => c.tribeLabel).filter((l): l is string => !!l)),
    ];
    const roster = castaways.map((c) => ({ shortName: c.shortName, fullName: c.fullName }));

    // Default the pairing to whatever the episode already records, else same-number.
    let wikiEpisodeNumber = wikiEpisodeParam ? Number(wikiEpisodeParam) : null;
    if (wikiEpisodeNumber === null && episodeId) {
      const episode = await getEpisode(episodeId);
      wikiEpisodeNumber = episode?.wikiEpisodeNumber ?? episode?.episodeNumber ?? null;
    }

    const match = episodes.find((e) => e.episodeNumber === wikiEpisodeNumber) ?? null;

    return ok({
      wikiUrl: season.wikiUrl,
      episodes,
      selected: match,
      suggestions: match ? suggestAnswerKey(match, tribeLabels, roster) : [],
      caveat:
        'One Wikipedia episode is not always one pool week — a two-hour premiere or a finale can ' +
        'cover two. Wikipedia also has nothing to say about who acquired an idol, or whether an ' +
        'advantage, idol or shot-in-the-dark was played; those are entered by hand.',
    });
  } catch (error) {
    return handleError('GET /api/admin/wiki-preview', error);
  }
}

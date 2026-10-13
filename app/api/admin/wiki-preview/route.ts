import { getCurrentSeason, getEpisode, listCastaways } from '@/lib/db';
import { corroborate, fetchWikiEpisodes, suggestAnswerKey } from '@/lib/wiki';
import { FANDOM_SOURCE, fandomPageUrl, fetchFandomEpisodes } from '@/lib/fandom';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Suggestions only. Wikipedia's episode numbering does not track the pool's — Season 50 drifted
 * as soon as an episode aired without a tribal council — so the response includes every parsed
 * row and the raw table cells, and the admin decides which one this week actually was.
 *
 * Fandom's season summary is read alongside and each suggestion says whether the two agree. Both
 * wikis number episodes by broadcast, so one number picks the row on each. Fandom is the second
 * opinion: if it cannot be reached, Wikipedia's suggestions still come back, marked uncorroborated.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const episodeId = url.searchParams.get('episodeId');
    const wikiEpisodeParam = url.searchParams.get('wikiEpisode');

    const season = await getCurrentSeason();
    if (!season) return fail('No season configured.', 404);
    if (!season.wikiUrl) return fail('This season has no Wikipedia URL set.', 409);

    const [episodes, fandom] = await Promise.all([
      fetchWikiEpisodes(season.wikiUrl),
      fetchFandomEpisodes(season.wikiUrl).then(
        (list) => ({ list, error: null }),
        (error: unknown) => ({
          list: [],
          error: error instanceof Error ? error.message : 'Could not read Fandom.',
        }),
      ),
    ]);
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
    const fandomMatch = fandom.list.find((e) => e.episodeNumber === wikiEpisodeNumber) ?? null;

    const suggestions = match
      ? corroborate(
          { source: 'Wikipedia', suggestions: suggestAnswerKey(match, tribeLabels, roster) },
          fandomMatch
            ? {
                source: FANDOM_SOURCE,
                suggestions: suggestAnswerKey(fandomMatch, tribeLabels, roster, FANDOM_SOURCE),
              }
            : null,
        )
      : [];

    return ok({
      wikiUrl: season.wikiUrl,
      fandomUrl: fandomPageUrl(season.wikiUrl),
      fandomError: fandom.error,
      episodes,
      selected: match,
      fandomSelected: fandomMatch,
      suggestions,
      caveat:
        'One wiki episode is not always one pool week — a two-hour premiere or a finale can ' +
        'cover two. Neither wiki\'s season summary says who acquired an idol, or whether an ' +
        'advantage, idol or shot-in-the-dark was played; those are entered by hand.',
    });
  } catch (error) {
    return handleError('GET /api/admin/wiki-preview', error);
  }
}

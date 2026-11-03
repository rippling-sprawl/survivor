import * as cheerio from 'cheerio';
import { unstable_cache } from 'next/cache';
import {
  findColumn,
  flattenHeaders,
  isBlank,
  parseWikiEpisodes,
  resolveContestantName,
  tablesInSection,
  toGrid,
  type CastawayName,
  type WikiEpisode,
} from './wiki';

/**
 * The Survivor Wiki on Fandom: the second source for the answer key, and the only one that keeps
 * a running list of who is holding which advantage.
 *
 * Its pages sit behind a Cloudflare challenge that a server fetch cannot pass, so this goes
 * through the MediaWiki API instead, which returns the same rendered article HTML. There is no
 * separate URL to configure: Fandom titles its season pages the way Wikipedia does
 * ("Survivor_51", "Survivor_50:_In_the_Hands_of_the_Fans"), so the title is read off the season's
 * Wikipedia URL.
 */

export const FANDOM_SOURCE = 'Fandom';

const FANDOM_ORIGIN = 'https://survivor.fandom.com';

/** "https://en.wikipedia.org/wiki/Survivor_51" → "Survivor_51". */
export function fandomTitleFor(wikiUrl: string): string | null {
  try {
    const title = new URL(wikiUrl).pathname.split('/wiki/')[1];
    return title ? decodeURIComponent(title) : null;
  } catch {
    return null;
  }
}

export function fandomPageUrl(wikiUrl: string): string | null {
  const title = fandomTitleFor(wikiUrl);
  return title ? `${FANDOM_ORIGIN}/wiki/${encodeURIComponent(title).replace(/%3A/g, ':')}` : null;
}

async function fetchFandomHtml(wikiUrl: string): Promise<string> {
  const title = fandomTitleFor(wikiUrl);
  if (!title) throw new Error('Could not work out the Fandom page from the Wikipedia URL.');

  const api = new URL('/api.php', FANDOM_ORIGIN);
  api.search = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'text',
    redirects: '1',
    format: 'json',
    formatversion: '2',
  }).toString();

  const response = await fetch(api, {
    headers: { 'User-Agent': 'survivor-pickem/1.0 (weekly pool scoring assistant)' },
    next: { revalidate: 600 },
  });
  if (!response.ok) throw new Error(`Fandom returned ${response.status}`);
  const body = (await response.json()) as {
    parse?: { text?: string };
    error?: { info?: string };
  };
  if (!body.parse?.text) throw new Error(body.error?.info ?? 'Fandom returned no page.');
  return body.parse.text;
}

export async function fetchFandomEpisodes(wikiUrl: string): Promise<WikiEpisode[]> {
  return parseWikiEpisodes(await fetchFandomHtml(wikiUrl));
}

// -- advantages -----------------------------------------------------------------------------------

export interface HeldAdvantage {
  /** As the page writes it; resolve to a short name with `resolveContestantName`. */
  name: string;
  /** "Hidden Immunity Idol", "Extra Vote"… Fandom's column also carries disadvantages. */
  advantages: string[];
}

export interface CastawayStatus {
  advantages: HeldAdvantage[];
  /** Players still in the game who have already played their Shot in the Dark. */
  shotInTheDarkUsed: string[];
}

/**
 * Reads the "(Dis)advantages On Hand" and "Shot in the Dark Status" columns of the Castaways
 * table, for players still in the game. Each advantage is a link whose text can wrap onto two
 * lines ("Hidden<br>Immunity Idol"), so line breaks inside links are flattened before line breaks
 * between advantages are split on.
 */
export function parseFandomCastaways(html: string): CastawayStatus {
  const $ = cheerio.load(html);
  const status: CastawayStatus = { advantages: [], shotInTheDarkUsed: [] };
  const seen = new Set<string>();

  (tablesInSection($, 'Castaways') ?? $('table.wikitable')).each((_, table) => {
    const $table = $(table);
    $table.find('small').remove(); // age, hometown and job, under each name
    $table.find('a br').replaceWith(' ');

    const grid = toGrid($, $table as unknown as cheerio.Cheerio<never>);
    const { headers, bodyStart } = flattenHeaders(grid);
    const advantageCol = findColumn(headers, ['advantage']);
    const shotCol = findColumn(headers, ['shot in the dark']);
    const finishCol = findColumn(headers, ['finish']);
    // "Contestant" spans a photo column and a name column; the name is whichever has text.
    const nameCols = headers.flatMap((header, col) => (header.includes('contestant') ? [col] : []));
    if ((advantageCol === -1 && shotCol === -1) || nameCols.length === 0) return;

    for (const row of grid.slice(bodyStart)) {
      if (!row) continue;
      const nameCell = nameCols.map((col) => row[col]).find((cell) => cell?.text.trim());
      // A notes row spans the whole table, so its one cell would read as name and everything else.
      if (!nameCell || nameCell === row[advantageCol] || nameCell === row[shotCol]) continue;
      const name = nameCell.text.split('•')[0].trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      // Anyone with a finish is out of the game, and whatever they held went with them.
      if (finishCol !== -1 && !isBlank(row[finishCol]?.text ?? '')) continue;

      const advantages = (row[advantageCol]?.text ?? '')
        .split('•')
        .map((part) => part.trim())
        .filter((part) => !isBlank(part));
      if (advantages.length > 0) status.advantages.push({ name, advantages });

      // An unplayed Shot reads "Active" (or "Unused"); a played one shows its scroll, "Safe" or
      // "Not Safe", beside a tick or cross image that carries no text.
      if (/\bsafe\b/i.test(row[shotCol]?.text ?? '')) status.shotInTheDarkUsed.push(name);
    }
  });

  return status;
}

/**
 * The picks page renders dynamically, which makes every fetch on it uncached, so the parsed list
 * is cached here instead — otherwise each visit would wait on Fandom. A failure throws and is not
 * cached, so the next visit tries again.
 */
const cachedCastawayStatus = unstable_cache(
  async (wikiUrl: string) => parseFandomCastaways(await fetchFandomHtml(wikiUrl)),
  ['fandom-castaway-status'],
  { revalidate: 600 },
);

/**
 * Who holds what, and who has spent their Shot in the Dark, by pool short name, for the top of the
 * picks form. Null when Fandom could not be read: the form is still perfectly usable without it,
 * so the section is simply left out.
 */
export async function castawayStatus(
  wikiUrl: string,
  castaways: CastawayName[],
): Promise<CastawayStatus | null> {
  try {
    const status = await cachedCastawayStatus(wikiUrl);
    const shortName = (name: string) => resolveContestantName(name, castaways) ?? name;
    return {
      advantages: status.advantages.map((h) => ({
        name: shortName(h.name),
        // Every idol is hidden; the short form fits under a name on a photo tile.
        advantages: h.advantages.map((a) => a.replace(/^hidden immunity idol/i, 'Immunity Idol')),
      })),
      shotInTheDarkUsed: status.shotInTheDarkUsed.map(shortName),
    };
  } catch (error) {
    console.error('castawayStatus', error);
    return null;
  }
}

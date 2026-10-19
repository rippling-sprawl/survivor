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

/**
 * Reads the "(Dis)advantages On Hand" column of the Castaways table, for players still in the
 * game. Each advantage is a link whose text can wrap onto two lines ("Hidden<br>Immunity Idol"),
 * so line breaks inside links are flattened before line breaks between advantages are split on.
 */
export function parseFandomAdvantages(html: string): HeldAdvantage[] {
  const $ = cheerio.load(html);
  const held: HeldAdvantage[] = [];

  (tablesInSection($, 'Castaways') ?? $('table.wikitable')).each((_, table) => {
    const $table = $(table);
    $table.find('small').remove(); // age, hometown and job, under each name
    $table.find('a br').replaceWith(' ');

    const grid = toGrid($, $table as unknown as cheerio.Cheerio<never>);
    const { headers, bodyStart } = flattenHeaders(grid);
    const advantageCol = findColumn(headers, ['advantage']);
    const finishCol = findColumn(headers, ['finish']);
    // "Contestant" spans a photo column and a name column; the name is whichever has text.
    const nameCols = headers.flatMap((header, col) => (header.includes('contestant') ? [col] : []));
    if (advantageCol === -1 || nameCols.length === 0) return;

    for (const row of grid.slice(bodyStart)) {
      if (!row) continue;
      const nameCell = nameCols.map((col) => row[col]).find((cell) => cell?.text.trim());
      // A notes row spans the whole table, so its one cell would read as both name and advantage.
      if (!nameCell || nameCell === row[advantageCol]) continue;
      const name = nameCell.text.split('•')[0].trim();
      if (!name || held.some((h) => h.name === name)) continue;
      // Anyone with a finish is out of the game, and whatever they held went with them.
      if (finishCol !== -1 && !isBlank(row[finishCol]?.text ?? '')) continue;

      const advantages = (row[advantageCol]?.text ?? '')
        .split('•')
        .map((part) => part.trim())
        .filter((part) => !isBlank(part));
      if (advantages.length > 0) held.push({ name, advantages });
    }
  });

  return held;
}

/**
 * The picks page renders dynamically, which makes every fetch on it uncached, so the parsed list
 * is cached here instead — otherwise each visit would wait on Fandom. A failure throws and is not
 * cached, so the next visit tries again.
 */
const cachedAdvantages = unstable_cache(
  async (wikiUrl: string) => parseFandomAdvantages(await fetchFandomHtml(wikiUrl)),
  ['fandom-advantages'],
  { revalidate: 600 },
);

/**
 * Who holds what, by pool short name, for the top of the picks form. Null when Fandom could not
 * be read: the form is still perfectly usable without it, so the section is simply left out.
 */
export async function advantagesHeld(
  wikiUrl: string,
  castaways: CastawayName[],
): Promise<HeldAdvantage[] | null> {
  try {
    const held = await cachedAdvantages(wikiUrl);
    return held.map((h) => ({
      name: resolveContestantName(h.name, castaways) ?? h.name,
      // Every idol is hidden; the short form fits under a name on a photo tile.
      advantages: h.advantages.map((a) => a.replace(/^hidden immunity idol/i, 'Immunity Idol')),
    }));
  } catch (error) {
    console.error('advantagesHeld', error);
    return null;
  }
}

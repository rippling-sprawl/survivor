import * as cheerio from 'cheerio';

/**
 * Reads the season-summary table off a season's Wikipedia page to *propose* an answer key.
 *
 * The table is harder to read than it looks. It has a two-row header where "Episode" spans three
 * sub-columns and "Challenge winner(s)" spans two, and its body uses rowspan heavily — a single
 * episode can occupy five <tr> elements because a two-hour premiere holds two immunity challenges
 * and two tribal councils. Naive cell-index reading silently shifts every column, which is why
 * this expands the whole thing into a proper grid before reading anything out of it.
 *
 * Two limits are worth being blunt about, and both are why nothing here is applied automatically:
 *
 * 1. Wikipedia's episode numbers are not the pool's. Season 50's premiere is one wiki episode but
 *    two pool weeks, so the numbering drifts from there on. An episode carries an explicit
 *    `wiki_episode_number` and the admin confirms the pairing.
 * 2. The table covers roughly half of what the form asks. Who *acquired* an idol, and whether an
 *    advantage, idol or shot-in-the-dark was played, are not in it and never will be.
 */

export interface WikiEpisode {
  episodeNumber: number;
  title: string | null;
  airDate: string | null;
  /** Tribes or individuals who won reward, verbatim. */
  rewardWinners: string[];
  immunityWinners: string[];
  /** Tribes that went to tribal council. */
  eliminatedTribes: string[];
  eliminated: string[];
  /** The grid rows behind this episode, so the admin can check the parse rather than trust it. */
  raw: Record<string, string>[];
}

const clean = (text: string) =>
  text
    .replace(/\[[^\]]*\]/g, '') // footnote markers
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Placeholder cell contents that carry no information. */
const isBlank = (value: string) =>
  value === '' || /^(none|n\/?a|—|–|-)$/i.test(value.trim());

/**
 * Cells hold names in several shapes: "Joe", "Joe & Tiffany", "Ozzy (Cila)" — where the bracket is
 * the player's tribe, not a second person — and survivor-auction style prose. Brackets are dropped
 * and separators split, without breaking a name apart.
 */
function splitNames(value: string): string[] {
  if (isBlank(value)) return [];
  return clean(value)
    .replace(/\([^)]*\)/g, ' ') // "(Cila)" is a tribe annotation, not a name
    .replace(/\band\b/gi, ',')
    .replace(/&/g, ',')
    .split(/[,;/•]+|\s{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !isBlank(part));
}

interface Cell {
  text: string;
  isHeader: boolean;
}

/**
 * Expands a <table> into a dense grid, resolving rowspan and colspan. Every logical cell is
 * written into each position it visually occupies, so column index means the same thing on every
 * row regardless of what spans into it from above.
 */
function toGrid($: cheerio.CheerioAPI, table: cheerio.Cheerio<never>): Cell[][] {
  const grid: Cell[][] = [];

  const put = (row: number, col: number, cell: Cell) => {
    (grid[row] ??= [])[col] = cell;
  };

  $(table)
    .find('tr')
    .each((rowIndex, tr) => {
      let col = 0;
      $(tr)
        .children('th, td')
        .each((_i, node) => {
          const $node = $(node);
          // <br> separates distinct values inside one cell; without this they run together.
          $node.find('br').replaceWith('•');
          const text = clean($node.text()).replace(/\s*•\s*/g, ' • ');
          const rowspan = Math.max(1, Number($node.attr('rowspan')) || 1);
          const colspan = Math.max(1, Number($node.attr('colspan')) || 1);
          const isHeader = (node as { tagName?: string }).tagName?.toLowerCase() === 'th';

          // Skip past any column already claimed by a rowspan from an earlier row.
          while (grid[rowIndex]?.[col] !== undefined) col += 1;

          for (let r = 0; r < rowspan; r += 1) {
            for (let c = 0; c < colspan; c += 1) {
              put(rowIndex + r, col + c, { text, isHeader });
            }
          }
          col += colspan;
        });
    });

  return grid;
}

/**
 * Flattens a multi-row header into one label per column, joining the tiers: the column under
 * "Eliminated" > "Player(s)" becomes "eliminated player(s)", which is specific enough to match on
 * while "player(s)" alone would not be.
 */
function flattenHeaders(grid: Cell[][]): { headers: string[]; bodyStart: number } {
  let bodyStart = 0;
  while (
    bodyStart < grid.length &&
    grid[bodyStart] &&
    grid[bodyStart].filter(Boolean).length > 0 &&
    grid[bodyStart].filter(Boolean).every((cell) => cell.isHeader)
  ) {
    bodyStart += 1;
  }
  if (bodyStart === 0) return { headers: [], bodyStart: 0 };

  const width = Math.max(...grid.slice(0, bodyStart).map((row) => row.length));
  const headers: string[] = [];
  for (let col = 0; col < width; col += 1) {
    const parts: string[] = [];
    for (let row = 0; row < bodyStart; row += 1) {
      const text = grid[row]?.[col]?.text;
      if (text && !parts.includes(text)) parts.push(text);
    }
    headers.push(parts.join(' ').toLowerCase());
  }
  return { headers, bodyStart };
}

const findColumn = (headers: string[], ...needles: string[][]) => {
  for (const group of needles) {
    const index = headers.findIndex((header) => group.every((needle) => header.includes(needle)));
    if (index !== -1) return index;
  }
  return -1;
};

export function parseWikiEpisodes(html: string): WikiEpisode[] {
  const $ = cheerio.load(html);
  const episodes: WikiEpisode[] = [];

  $('table.wikitable').each((_, table) => {
    const grid = toGrid($, $(table) as unknown as cheerio.Cheerio<never>);
    const { headers, bodyStart } = flattenHeaders(grid);
    if (headers.length === 0) return;

    const numberCol = findColumn(headers, ['no.'], ['episode', '#']);
    const eliminatedCol = findColumn(headers, ['eliminated', 'player'], ['voted out'], ['eliminated']);
    if (numberCol === -1 || eliminatedCol === -1) return;

    const titleCol = findColumn(headers, ['title']);
    const airDateCol = findColumn(headers, ['air date'], ['original']);
    const rewardCol = findColumn(headers, ['reward']);
    const immunityCol = findColumn(headers, ['immunity']);
    const tribeCol = findColumn(headers, ['eliminated', 'tribe']);

    // One episode occupies several grid rows, so rows are grouped by episode number rather than
    // read one-to-one.
    const byNumber = new Map<number, WikiEpisode>();

    for (let row = bodyStart; row < grid.length; row += 1) {
      const cells = grid[row];
      if (!cells) continue;

      const episodeNumber = Number((cells[numberCol]?.text.match(/\d+/) ?? [])[0]);
      if (!Number.isInteger(episodeNumber)) continue;

      let episode = byNumber.get(episodeNumber);
      if (!episode) {
        episode = {
          episodeNumber,
          title: titleCol === -1 ? null : cells[titleCol]?.text.replace(/^"|"$/g, '') || null,
          airDate: airDateCol === -1 ? null : cells[airDateCol]?.text || null,
          rewardWinners: [],
          immunityWinners: [],
          eliminatedTribes: [],
          eliminated: [],
          raw: [],
        };
        byNumber.set(episodeNumber, episode);
        episodes.push(episode);
      }

      const collect = (target: string[], col: number) => {
        if (col === -1) return;
        for (const name of splitNames(cells[col]?.text ?? '')) {
          if (!target.includes(name)) target.push(name);
        }
      };

      collect(episode.rewardWinners, rewardCol);
      collect(episode.immunityWinners, immunityCol);
      collect(episode.eliminatedTribes, tribeCol);
      collect(episode.eliminated, eliminatedCol);

      const raw: Record<string, string> = {};
      headers.forEach((header, col) => {
        const text = cells[col]?.text;
        if (header && text) raw[header] = text;
      });
      // Rowspans repeat identical content down the group; only keep genuinely new rows.
      const signature = JSON.stringify(raw);
      if (!episode.raw.some((existing) => JSON.stringify(existing) === signature)) {
        episode.raw.push(raw);
      }
    }
  });

  // A page can carry more than one table naming episodes; keep the first parse of each number.
  const seen = new Set<number>();
  return episodes.filter((e) => (seen.has(e.episodeNumber) ? false : seen.add(e.episodeNumber)));
}

export async function fetchWikiEpisodes(wikiUrl: string): Promise<WikiEpisode[]> {
  const response = await fetch(wikiUrl, {
    headers: { 'User-Agent': 'survivor-pickem/1.0 (weekly pool scoring assistant)' },
    next: { revalidate: 600 },
  });
  if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
  return parseWikiEpisodes(await response.text());
}

export interface AnswerKeySuggestion {
  scoringKey: string;
  values: string[];
  /** Why this is suggested, shown beside the field so the admin can sanity-check it. */
  note: string;
}

/**
 * Turns one wiki episode into suggested answer-key values.
 *
 * Note what is *not* claimed here. If the immunity cell names tribes, this is a pre-merge week and
 * the losing tribe is inferred by elimination — worth a human glance, since a week where two
 * tribes each lost a challenge produces two losers. If it names people, it is post-merge and the
 * immunity winner is read directly.
 */
export interface CastawayName {
  shortName: string;
  fullName?: string | null;
}

/**
 * Wikipedia writes "Tiffany" where the pool's dropdowns say "Tiff", and an applied suggestion that
 * does not match an option would score nobody while looking perfectly correct. Names are resolved
 * back to the season's own short names, and anything unrecognised is dropped rather than guessed.
 */
export function resolveCastawayName(
  name: string,
  castaways: CastawayName[],
): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  const exact = castaways.find((c) => c.shortName.toLowerCase() === needle);
  if (exact) return exact.shortName;

  const byFullName = castaways.find((c) => {
    const full = (c.fullName ?? '').toLowerCase();
    return full === needle || full.startsWith(`${needle} `);
  });
  if (byFullName) return byFullName.shortName;

  // "Tiff" vs "Tiffany" in either direction, but only when it is unambiguous.
  const prefixed = castaways.filter((c) => {
    const short = c.shortName.toLowerCase();
    return short.startsWith(needle) || needle.startsWith(short);
  });
  return prefixed.length === 1 ? prefixed[0].shortName : null;
}

export function suggestAnswerKey(
  episode: WikiEpisode,
  allTribeLabels: string[],
  castaways: CastawayName[] = [],
): AnswerKeySuggestion[] {
  const suggestions: AnswerKeySuggestion[] = [];

  /** Maps wiki spellings onto the season roster, keeping track of anything it could not place. */
  const resolveAll = (names: string[]) => {
    const resolved: string[] = [];
    const unmatched: string[] = [];
    for (const name of names) {
      const match = castaways.length > 0 ? resolveCastawayName(name, castaways) : name;
      if (match) {
        if (!resolved.includes(match)) resolved.push(match);
      } else {
        unmatched.push(name);
      }
    }
    return { resolved, unmatched };
  };

  const unmatchedNote = (unmatched: string[]) =>
    unmatched.length > 0 ? ` Could not match ${unmatched.join(', ')} to this season's roster.` : '';

  if (episode.eliminated.length > 0) {
    const { resolved, unmatched } = resolveAll(episode.eliminated);
    if (resolved.length > 0 || unmatched.length > 0) {
      suggestions.push({
        scoringKey: 'voted_out',
        values: resolved,
        note:
          `Wikipedia lists ${episode.eliminated.join(', ')} as eliminated.` +
          unmatchedNote(unmatched),
      });
    }
  }

  // Tribe labels are stored as "Cila (Orange)" but the table says "Cila".
  const tribeFor = (name: string) =>
    allTribeLabels.find((label) => label.toLowerCase().startsWith(`${name.toLowerCase()} `) ||
      label.toLowerCase() === name.toLowerCase());

  if (episode.eliminatedTribes.length > 0) {
    const losing = episode.eliminatedTribes.map(tribeFor).filter((l): l is string => !!l);
    if (losing.length > 0) {
      suggestions.push({
        scoringKey: 'losing_tribe',
        values: losing,
        note: `${episode.eliminatedTribes.join(' and ')} went to tribal council.`,
      });
    }
  }

  if (episode.immunityWinners.length > 0) {
    const asTribes = episode.immunityWinners.map(tribeFor).filter((l): l is string => !!l);
    const isTribalWeek = asTribes.length === episode.immunityWinners.length;

    if (isTribalWeek) {
      // Pre-merge: only useful if the eliminated-tribe column did not already say it outright.
      if (!suggestions.some((s) => s.scoringKey === 'losing_tribe')) {
        const losing = allTribeLabels.filter((label) => !asTribes.includes(label));
        suggestions.push({
          scoringKey: 'losing_tribe',
          values: losing,
          note: `${asTribes.join(' and ')} won immunity, so the loser is by elimination. Check this if a tribe was already out of the game.`,
        });
      }
    } else {
      const { resolved, unmatched } = resolveAll(episode.immunityWinners);
      suggestions.push({
        scoringKey: 'win_immunity',
        values: resolved,
        note:
          `Wikipedia lists ${episode.immunityWinners.join(', ')} as immunity winner(s).` +
          unmatchedNote(unmatched),
      });
    }
  }

  return suggestions;
}

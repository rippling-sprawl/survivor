import * as cheerio from 'cheerio';

/**
 * Reads the season-summary table off a season's wiki page to *propose* an answer key. Wikipedia and
 * the Survivor Wiki on Fandom (lib/fandom.ts) lay the table out differently but both go through
 * this parser, and their suggestions are cross-checked against each other by `corroborate`.
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
  /**
   * How each eliminated player left, where the page says — "3rd Voted Out", "Quit". A quit or an
   * evacuation is an elimination but not a vote, and the pool only scores votes.
   */
  exits: Record<string, string>;
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
export const isBlank = (value: string) =>
  value.trim() === '' || /^(none|n\/?a|tb[ad]|—|–|-)$/i.test(value.trim());

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

export interface Cell {
  text: string;
  isHeader: boolean;
  /** Background colour. Fandom marks a player's tribe only by shading their cell. */
  color: string | null;
}

/**
 * Expands a <table> into a dense grid, resolving rowspan and colspan. Every logical cell is
 * written into each position it visually occupies, so column index means the same thing on every
 * row regardless of what spans into it from above.
 */
export function toGrid($: cheerio.CheerioAPI, table: cheerio.Cheerio<never>): Cell[][] {
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
          // Footnote markers: Wikipedia's read "[a]", which clean() strips, but Fandom's are bare
          // digits that would otherwise turn "Lewis" into "Lewis1".
          $node.find('sup').remove();
          // <br> separates distinct values inside one cell; without this they run together.
          $node.find('br').replaceWith('•');
          const text = clean($node.text()).replace(/\s*•\s*/g, ' • ');
          const color = cellColor($node.attr('style'), $node.attr('bgcolor'));
          // parseInt, like a browser: Fandom has a header with colspan="3 class=".
          const rowspan = Math.max(1, parseInt($node.attr('rowspan') ?? '', 10) || 1);
          const colspan = Math.max(1, parseInt($node.attr('colspan') ?? '', 10) || 1);
          const isHeader = (node as { tagName?: string }).tagName?.toLowerCase() === 'th';

          // Skip past any column already claimed by a rowspan from an earlier row.
          while (grid[rowIndex]?.[col] !== undefined) col += 1;

          for (let r = 0; r < rowspan; r += 1) {
            for (let c = 0; c < colspan; c += 1) {
              put(rowIndex + r, col + c, { text, isHeader, color });
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
export function flattenHeaders(grid: Pick<Cell, 'text' | 'isHeader'>[][]): { headers: string[]; bodyStart: number } {
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

export const findColumn = (headers: string[], ...needles: string[][]) => {
  for (const group of needles) {
    const index = headers.findIndex((header) => group.every((needle) => header.includes(needle)));
    if (index !== -1) return index;
  }
  return -1;
};

/**
 * The wikitables under one section heading, or null when the page has no such heading. Matching
 * is case-insensitive because Wikipedia writes "Season_summary" and Fandom "Season_Summary".
 * Wikipedia wraps its <h2> in a div and Fandom puts the id on a span inside it; either way the
 * section runs until the next heading.
 */
export function tablesInSection($: cheerio.CheerioAPI, id: string) {
  const target = $('[id]')
    .filter((_, el) => $(el).attr('id')?.toLowerCase() === id.toLowerCase())
    .first();
  if (target.length === 0) return null;
  const h2 = target.closest('h2');
  const heading = h2.length > 0 ? h2 : target;
  const anchor = heading.parent().is('div.mw-heading') ? heading.parent() : heading;
  return anchor
    .nextUntil('h2, div.mw-heading')
    .find('table.wikitable')
    .addBack('table.wikitable');
}

export function parseWikiEpisodes(html: string): WikiEpisode[] {
  const $ = cheerio.load(html);
  const episodes: WikiEpisode[] = [];

  // The Season summary section is the one table that is about challenges and votes. A bare table
  // (as in the test fixture) has no headings at all, so fall back to every table on the page.
  const tables = tablesInSection($, 'Season_summary') ?? $('table.wikitable');

  tables.each((_, table) => {
    const grid = toGrid($, $(table) as unknown as cheerio.Cheerio<never>);
    const { headers, bodyStart } = flattenHeaders(grid);
    if (headers.length === 0) return;

    // Fandom heads its first two columns "Episode" with no "No." or "Title" beneath.
    const numberCol = findColumn(headers, ['no.'], ['episode', '#'], ['episode']);
    const eliminatedCol = findColumn(headers, ['eliminated', 'player'], ['voted out'], ['eliminated']);
    if (numberCol === -1 || eliminatedCol === -1) return;

    const namedTitleCol = findColumn(headers, ['title']);
    const titleCol =
      namedTitleCol !== -1 || headers[numberCol + 1] !== headers[numberCol]
        ? namedTitleCol
        : numberCol + 1;
    const airDateCol = findColumn(headers, ['air date'], ['original']);
    const rewardCol = findColumn(headers, ['reward']);
    const immunityCol = findColumn(headers, ['immunity']);
    const tribeCol = findColumn(headers, ['eliminated', 'tribe']);
    const finishCol = findColumn(headers, ['finish']);

    // Without a tribe column, a voted-out player's tribe is only their cell's colour. The
    // challenge columns name tribes in those same colours, which is the key to reading it.
    const tribeByColor = new Map<string, string>();
    if (tribeCol === -1) {
      for (const cells of grid.slice(bodyStart)) {
        for (const col of [rewardCol, immunityCol]) {
          const cell = col === -1 ? undefined : cells?.[col];
          const names = cell ? splitNames(cell.text) : [];
          if (cell?.color && names.length === 1 && !tribeByColor.has(cell.color)) {
            tribeByColor.set(cell.color, names[0]);
          }
        }
      }
    }

    // One episode occupies several grid rows, so rows are grouped by episode number rather than
    // read one-to-one.
    const byNumber = new Map<number, WikiEpisode>();

    for (let row = bodyStart; row < grid.length; row += 1) {
      const cells = grid[row];
      if (!cells) continue;

      // Anchored, so a trailing "Notes: ^1 …" row does not read as episode 1.
      const episodeNumber = Number((cells[numberCol]?.text.match(/^\d+/) ?? [])[0]);
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
          exits: {},
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

      const shadedTribe = tribeByColor.get(cells[eliminatedCol]?.color ?? '');
      if (shadedTribe && splitNames(cells[eliminatedCol]?.text ?? '').length > 0) {
        if (!episode.eliminatedTribes.includes(shadedTribe)) episode.eliminatedTribes.push(shadedTribe);
      }

      const finish = finishCol === -1 ? '' : (cells[finishCol]?.text.split('•')[0].trim() ?? '');
      if (finish && !isBlank(finish)) {
        for (const name of splitNames(cells[eliminatedCol]?.text ?? '')) episode.exits[name] ??= finish;
      }

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

  // Wikipedia's summary has no finish column, but its Contestants table does ("Quit").
  const contestants = parseWikiContestants(html);
  for (const episode of episodes) {
    for (const name of episode.eliminated) {
      if (episode.exits[name]) continue;
      const needle = name.toLowerCase();
      const matches = contestants.filter((c) => {
        const bare = withoutNickname(c.name);
        const nickname = c.name.match(/["“”]([^"“”]+)["“”]/)?.[1]?.toLowerCase();
        return bare === needle || bare.startsWith(`${needle} `) || nickname === needle;
      });
      if (matches.length === 1 && matches[0].placement) episode.exits[name] = matches[0].placement;
    }
  }

  // A page can carry more than one table naming episodes; keep the first parse of each number.
  const seen = new Set<number>();
  return episodes.filter((e) => (seen.has(e.episodeNumber) ? false : seen.add(e.episodeNumber)));
}

/** Quitting, an evacuation or a removal takes someone out of the game without anyone voting. */
const leftWithoutVote = (exit: string | undefined) =>
  !!exit && /quit|evacuat|medical|removed|ejected/i.test(exit);

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

/**
 * Turns one wiki episode into suggested answer-key values. `source` names the page in the notes.
 *
 * The losing tribe comes from the Immunity column: every tribe that did not win immunity lost.
 * The tribal-council column looks more direct but is not the same thing — a player who quits is
 * logged against their tribe there without that tribe having lost anything — so it is only a
 * fallback, and a cross-check when the two disagree. If the Immunity column names people rather
 * than tribes, this is a post-merge week and the immunity winner is read directly.
 */
export function suggestAnswerKey(
  episode: WikiEpisode,
  allTribeLabels: string[],
  castaways: CastawayName[] = [],
  source = 'Wikipedia',
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
    const notVoted = episode.eliminated.filter((name) => leftWithoutVote(episode.exits[name]));
    const voted = episode.eliminated.filter((name) => !notVoted.includes(name));
    const { resolved, unmatched } = resolveAll(voted);
    const notVotedNote = notVoted
      .map((name) => ` ${name} left without a vote (${episode.exits[name]}), so is left out.`)
      .join('');
    suggestions.push({
      scoringKey: 'voted_out',
      values: resolved,
      note:
        `${source} lists ${episode.eliminated.join(', ')} as eliminated.` +
        notVotedNote +
        unmatchedNote(unmatched),
    });
  }

  // Tribe labels are stored as "Cila (Orange)" but the table says "Cila".
  const tribeFor = (name: string) =>
    allTribeLabels.find((label) => label.toLowerCase().startsWith(`${name.toLowerCase()} `) ||
      label.toLowerCase() === name.toLowerCase());
  const tribesIn = (names: string[]) => [
    ...new Set(names.map(tribeFor).filter((l): l is string => !!l)),
  ];
  const sameSet = (a: string[], b: string[]) => [...a].sort().join('|') === [...b].sort().join('|');

  // Fandom lists an exiled player in the Immunity column beside the winning tribe, so a single
  // tribe among the names is enough to call it a tribal week.
  const immunityTribes = tribesIn(episode.immunityWinners);
  const tribalTribes = tribesIn(episode.eliminatedTribes);

  if (immunityTribes.length > 0) {
    const losing = allTribeLabels.filter((label) => !immunityTribes.includes(label));
    if (losing.length > 0) {
      const crossCheck =
        tribalTribes.length > 0 && !sameSet(tribalTribes, losing)
          ? ` Tribal council: ${episode.eliminatedTribes.join(' and ')} — a quit or evacuation lands there without a challenge loss.`
          : '';
      suggestions.push({
        scoringKey: 'losing_tribe',
        values: losing,
        note:
          `${source}: ${immunityTribes.join(' and ')} won immunity, so ${losing.join(' and ')} lost. ` +
          'Check this if a tribe was already out of the game or there were two challenges.' +
          crossCheck,
      });
    }
  } else if (tribalTribes.length > 0) {
    suggestions.push({
      scoringKey: 'losing_tribe',
      values: tribalTribes,
      note: `${source} has no tribe in the Immunity column; ${episode.eliminatedTribes.join(' and ')} went to tribal council.`,
    });
  }

  if (immunityTribes.length === 0 && episode.immunityWinners.length > 0) {
    const { resolved, unmatched } = resolveAll(episode.immunityWinners);
    suggestions.push({
      scoringKey: 'win_immunity',
      values: resolved,
      note:
        `${source} lists ${episode.immunityWinners.join(', ')} as immunity winner(s).` +
        unmatchedNote(unmatched),
    });
  }

  return suggestions;
}

export type Agreement = 'agree' | 'conflict' | 'single';

export interface CorroboratedSuggestion extends AnswerKeySuggestion {
  /** Whether both sources said the same thing, said different things, or only one spoke. */
  agreement: Agreement;
  /** The sources this answer came from. */
  sources: string[];
}

/**
 * Lines the two sources' suggestions up question by question. Agreement is the point: two wikis
 * edited by different people reading the same episode the same way is worth more than either.
 * On a conflict the primary's answer is kept, with the other's beside it for the admin to judge.
 */
export function corroborate(
  primary: { source: string; suggestions: AnswerKeySuggestion[] },
  secondary: { source: string; suggestions: AnswerKeySuggestion[] } | null,
): CorroboratedSuggestion[] {
  const other = new Map((secondary?.suggestions ?? []).map((s) => [s.scoringKey, s]));
  const sameSet = (a: string[], b: string[]) => [...a].sort().join('|') === [...b].sort().join('|');

  const merged: CorroboratedSuggestion[] = primary.suggestions.map((mine) => {
    const theirs = other.get(mine.scoringKey);
    other.delete(mine.scoringKey);
    if (!theirs || !secondary) {
      return { ...mine, agreement: 'single', sources: [primary.source] };
    }
    if (sameSet(mine.values, theirs.values)) {
      return {
        ...mine,
        note: `${mine.note} ${secondary.source} agrees.`,
        agreement: 'agree',
        sources: [primary.source, secondary.source],
      };
    }
    return {
      ...mine,
      note: `${mine.note} ${secondary.source} says ${theirs.values.join(', ') || 'nobody'}: ${theirs.note}`,
      agreement: 'conflict',
      sources: [primary.source, secondary.source],
    };
  });

  for (const theirs of other.values()) {
    merged.push({ ...theirs, agreement: 'single', sources: [secondary!.source] });
  }
  return merged;
}

// -- contestants ----------------------------------------------------------------------------------

export interface WikiTribe {
  name: string;
  /** The cell's background colour, e.g. "#f0c625", or null if the page does not colour it. */
  color: string | null;
}

export interface WikiContestant {
  /** As written, nickname included: `Angelica "Jelly" Loblack`. */
  name: string;
  originalTribe: WikiTribe | null;
  mergedTribe: WikiTribe | null;
  /** "1st voted out", "Medically evacuated", "Sole Survivor"… Empty while still playing. */
  placement: string;
}

/** Finishing the game without being voted out: the winner and whoever sat beside them. */
const isFinalist = (placement: string) => /sole survivor|runner-up/i.test(placement);

export const isOutOfGame = (contestant: WikiContestant) =>
  contestant.placement !== '' && !isFinalist(contestant.placement);

const cellColor = (style: string | undefined, bgcolor: string | undefined) => {
  const fromStyle = style?.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/i)?.[1];
  const color = fromStyle ?? bgcolor ?? null;
  return color && color.startsWith('#') ? color.toLowerCase() : null;
};

/**
 * Reads the table under the page's "Contestants" heading: one row per player with their original
 * and merged tribe and, once they are out, their placement. Rowspans are expanded because the
 * merged-tribe column spans every player who made the merge.
 */
export function parseWikiContestants(html: string): WikiContestant[] {
  const $ = cheerio.load(html);
  const heading = $('#Contestants').first();
  if (heading.length === 0) return [];
  // Current skins wrap the <h2> in a div; older markup puts the table right after the heading.
  const anchor = heading.parent().is('div.mw-heading') ? heading.parent() : heading;
  const table = anchor.nextAll('table').first();
  if (table.length === 0) return [];

  type GridCell = { text: string; color: string | null; isHeader: boolean };
  const grid: GridCell[][] = [];
  table.find('tr').each((rowIndex, tr) => {
    let col = 0;
    $(tr)
      .children('th, td')
      .each((_i, node) => {
        const $node = $(node);
        const cell: GridCell = {
          text: clean($node.text()),
          color: cellColor($node.attr('style'), $node.attr('bgcolor')),
          isHeader: (node as { tagName?: string }).tagName?.toLowerCase() === 'th',
        };
        const rowspan = Math.max(1, Number($node.attr('rowspan')) || 1);
        const colspan = Math.max(1, Number($node.attr('colspan')) || 1);
        while (grid[rowIndex]?.[col] !== undefined) col += 1;
        for (let r = 0; r < rowspan; r += 1) {
          for (let c = 0; c < colspan; c += 1) (grid[rowIndex + r] ??= [])[col + c] = cell;
        }
        col += colspan;
      });
  });

  const { headers, bodyStart } = flattenHeaders(grid.map((row) => row.map((c) => ({ text: c.text, isHeader: c.isHeader }))));
  const nameCol = findColumn(headers, ['contestant'], ['castaway'], ['name']);
  const originalCol = findColumn(headers, ['tribe', 'original']);
  const mergedCol = findColumn(headers, ['tribe', 'merged']);
  const placementCol = findColumn(headers, ['placement'], ['finish']);
  if (nameCol === -1 || originalCol === -1) return [];

  const tribeAt = (row: GridCell[], col: number): WikiTribe | null => {
    const cell = col === -1 ? undefined : row[col];
    if (!cell || isBlank(cell.text)) return null;
    return { name: cell.text, color: cell.color };
  };

  const contestants: WikiContestant[] = [];
  for (const row of grid.slice(bodyStart)) {
    const name = row?.[nameCol]?.text;
    if (!name) continue;
    contestants.push({
      name,
      originalTribe: tribeAt(row, originalCol),
      mergedTribe: tribeAt(row, mergedCol),
      placement: placementCol === -1 ? '' : (row[placementCol]?.text ?? ''),
    });
  }
  return contestants;
}

export async function fetchWikiContestants(wikiUrl: string): Promise<WikiContestant[]> {
  const response = await fetch(wikiUrl, {
    headers: { 'User-Agent': 'survivor-pickem/1.0 (weekly pool scoring assistant)' },
    // Always fresh: this runs right after an episode is scored, often minutes after the page changed.
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
  return parseWikiContestants(await response.text());
}

/** `Angelica "Jelly" Loblack` → "angelica loblack", so either spelling of a full name compares. */
const withoutNickname = (name: string) =>
  name.replace(/["“”][^"“”]*["“”]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Matches a Contestants-table name to the roster. The table writes full names, sometimes with a
 * nickname in quotes, while the pool goes by short names ("Jelly", "Kilby").
 */
export function resolveContestantName(name: string, castaways: CastawayName[]): string | null {
  const bare = withoutNickname(name);
  const byFullName = castaways.find((c) => c.fullName && withoutNickname(c.fullName) === bare);
  if (byFullName) return byFullName.shortName;

  const nickname = name.match(/["“”]([^"“”]+)["“”]/)?.[1];
  if (nickname) {
    const match = resolveCastawayName(nickname, castaways);
    if (match) return match;
  }

  const exact = resolveCastawayName(name, castaways);
  if (exact) return exact;

  // Last resort: the first name alone ("Thien An Nguyen" → "Thien An" is handled above).
  const first = bare.split(' ')[0];
  return first ? resolveCastawayName(first, castaways) : null;
}

/** Rough colour name for a tribe buff, used to label tribes the way Season 50 did: "Cila (Orange)". */
export function colorName(hex: string | null): string | null {
  if (!hex) return null;
  const match = hex.replace('#', '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const full = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta < 0.12) return lightness > 0.8 ? 'White' : lightness < 0.2 ? 'Black' : 'Gray';

  let hue =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;

  const buckets: [number, string][] = [
    [15, 'Red'],
    [40, 'Orange'],
    [68, 'Yellow'],
    [160, 'Green'],
    [195, 'Teal'],
    [255, 'Blue'],
    [295, 'Purple'],
    [340, 'Magenta'],
    [360, 'Red'],
  ];
  return buckets.find(([limit]) => hue < limit)?.[1] ?? null;
}

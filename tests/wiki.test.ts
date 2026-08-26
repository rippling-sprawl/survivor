import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/season-50.json';
import { parseWikiEpisodes, resolveCastawayName, suggestAnswerKey } from '../lib/wiki';

/**
 * Parsed against the real Season 50 summary table, saved verbatim. The table is genuinely awkward
 * — a two-tier header and a premiere that spans five body rows — and a parser that quietly reads
 * the wrong column would hand the admin confident, wrong suggestions.
 */
const html = readFileSync(resolve(__dirname, 'fixtures/s50-summary-table.html'), 'utf8');
const episodes = parseWikiEpisodes(html);
const byNumber = new Map(episodes.map((e) => [e.episodeNumber, e]));

const ROSTER = fixture.castaways.map((c) => ({ shortName: c.shortName, fullName: c.fullName }));
const TRIBES = ['Cila (Orange)', 'Kalo (Teal)', 'Vatu (Magenta)'];

describe('parsing the Season 50 summary table', () => {
  it('finds all 13 episodes', () => {
    expect(episodes.map((e) => e.episodeNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it('reads titles from the right column', () => {
    expect(byNumber.get(1)?.title).toBe('Epic Party');
    expect(byNumber.get(6)?.title).toBe('The Blood Moon');
    expect(byNumber.get(13)?.title).toBe('Reverse the Curse');
  });

  it('gathers every elimination in a multi-row episode', () => {
    // The premiere spans five body rows via rowspan and sends two people home.
    expect(byNumber.get(1)?.eliminated).toEqual(['Jenna', 'Kyle']);
    expect(byNumber.get(6)?.eliminated).toEqual(['Kamilla', 'Genevieve', 'Colby']);
    expect(byNumber.get(13)?.eliminated).toEqual(['Tiffany', 'Rizo']);
  });

  it('separates immunity from reward', () => {
    expect(byNumber.get(7)?.immunityWinners).toEqual(['Ozzy']);
    expect(byNumber.get(6)?.immunityWinners).toEqual(['Stephenie', 'Christian', 'Dee']);
    // Ep 10's reward was the Survivor Auction, which must not leak into immunity.
    expect(byNumber.get(10)?.immunityWinners).toEqual(['Tiffany']);
  });
});

describe('cross-checking the wiki against the spreadsheet answer key', () => {
  // The fixture's answer keys differ in shape from episode to episode (a pre-merge week has no
  // immunity winner), so they are read through one widened type rather than TypeScript's union.
  const answerKeyFor = (episodeNumber: number): Partial<Record<string, string[]>> =>
    (fixture.episodes.find((e) => e.episodeNumber === episodeNumber)?.answerKey ??
      {}) as Partial<Record<string, string[]>>;

  const resolved = (names: string[]) =>
    names.map((n) => resolveCastawayName(n, ROSTER)).filter(Boolean);

  /**
   * Episodes 2-12 line up one-to-one, which is what makes the wiki assist worth having. The
   * exceptions are real and are why the admin confirms rather than the app applying:
   *   Ep 1  — the wiki counts Kyle's medical evacuation as an elimination; the pool did not.
   *   Ep 13 — one wiki episode covers the pool's Ep 13 and its separate finale form.
   */
  for (const episodeNumber of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    it(`Ep ${episodeNumber} eliminations match the answer key`, () => {
      const expected = answerKeyFor(episodeNumber).voted_out ?? [];
      const fromWiki = resolved(byNumber.get(episodeNumber)!.eliminated);
      expect([...fromWiki].sort()).toEqual([...expected].sort());
    });
  }

  for (const episodeNumber of [6, 7, 9, 11]) {
    it(`Ep ${episodeNumber} immunity matches the answer key`, () => {
      const expected = answerKeyFor(episodeNumber).win_immunity ?? [];
      const fromWiki = resolved(byNumber.get(episodeNumber)!.immunityWinners);
      expect([...fromWiki].sort()).toEqual([...expected].sort());
    });
  }

  it('flags Ep 1 as the case the admin has to correct', () => {
    // The wiki has both; the pool's answer key has only Jenna, because Kyle was evacuated.
    expect(resolved(byNumber.get(1)!.eliminated)).toEqual(['Jenna', 'Kyle']);
    expect(answerKeyFor(1).voted_out).toEqual(['Jenna']);
  });
});

describe('name resolution', () => {
  it('maps wiki spellings onto the pool’s short names', () => {
    expect(resolveCastawayName('Tiffany', ROSTER)).toBe('Tiff');
    expect(resolveCastawayName('Ozzy', ROSTER)).toBe('Ozzy');
    expect(resolveCastawayName('Q', ROSTER)).toBe('Q');
    expect(resolveCastawayName('Christian Hubicki', ROSTER)).toBe('Christian');
  });

  it('returns null rather than guessing at a stranger', () => {
    expect(resolveCastawayName('Probst', ROSTER)).toBeNull();
    expect(resolveCastawayName('', ROSTER)).toBeNull();
  });
});

describe('answer-key suggestions', () => {
  it('reads the losing tribe from who went to tribal council', () => {
    const suggestions = suggestAnswerKey(byNumber.get(3)!, TRIBES, ROSTER);
    const losing = suggestions.find((s) => s.scoringKey === 'losing_tribe');
    expect(losing?.values).toEqual(['Vatu (Magenta)']);
  });

  it('suggests immunity winners by their pool names, not the wiki’s', () => {
    const suggestions = suggestAnswerKey(byNumber.get(10)!, TRIBES, ROSTER);
    const immunity = suggestions.find((s) => s.scoringKey === 'win_immunity');
    expect(immunity?.values).toEqual(['Tiff']);
  });

  it('says so in the note when a name could not be placed', () => {
    const suggestions = suggestAnswerKey(
      { ...byNumber.get(7)!, immunityWinners: ['Ozzy', 'Somebody Else'] },
      TRIBES,
      ROSTER,
    );
    const immunity = suggestions.find((s) => s.scoringKey === 'win_immunity');
    expect(immunity?.values).toEqual(['Ozzy']);
    expect(immunity?.note).toContain('Could not match Somebody Else');
  });

  it('never suggests the questions Wikipedia cannot answer', () => {
    const keys = episodes.flatMap((e) => suggestAnswerKey(e, TRIBES, ROSTER)).map((s) => s.scoringKey);
    // Idol acquisition and advantage/idol/SitD plays are simply not in the table.
    expect(keys).not.toContain('hidden_idol');
    expect(keys).not.toContain('play_advantage');
    expect(keys).not.toContain('play_idol');
    expect(keys).not.toContain('play_sitd');
  });
});

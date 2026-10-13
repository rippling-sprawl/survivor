import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { corroborate, parseWikiEpisodes, suggestAnswerKey, type WikiEpisode } from '../lib/wiki';
import { fandomPageUrl, fandomTitleFor, parseFandomAdvantages } from '../lib/fandom';

/**
 * Season 51 as both wikis had it after Ep 3, saved verbatim (images and styles stripped). Ep 3 is
 * the interesting one: Rob quit, which both pages log against Savu, the tribe that *won* immunity.
 */
const wikipedia = parseWikiEpisodes(
  readFileSync(resolve(__dirname, 'fixtures/s51-wikipedia.html'), 'utf8'),
);
const fandomHtml = readFileSync(resolve(__dirname, 'fixtures/s51-fandom.html'), 'utf8');
const fandom = parseWikiEpisodes(fandomHtml);

const TRIBES = ['Toka (Yellow)', 'Savu (Purple)'];
const ep = (list: WikiEpisode[], n: number) => list.find((e) => e.episodeNumber === n)!;

const suggestionsFor = (n: number) =>
  corroborate(
    { source: 'Wikipedia', suggestions: suggestAnswerKey(ep(wikipedia, n), TRIBES) },
    { source: 'Fandom', suggestions: suggestAnswerKey(ep(fandom, n), TRIBES, [], 'Fandom') },
  );

describe('reading the Wikipedia season summary', () => {
  it('reads only the Season summary section', () => {
    expect(wikipedia.map((e) => e.episodeNumber)).toEqual([1, 2, 3, 4]);
    expect(ep(wikipedia, 3).immunityWinners).toEqual(['Savu']);
  });

  it('learns how each player left from the Contestants table', () => {
    expect(ep(wikipedia, 3).exits).toEqual({ Rob: 'Quit', Patt: '3rd voted out' });
  });
});

describe('reading the Fandom season summary', () => {
  it('finds the episodes, notes row and unaired TBD row notwithstanding', () => {
    expect(fandom.map((e) => e.episodeNumber)).toEqual([1, 2, 3, 4]);
    expect(ep(fandom, 1).title).toBe('Permanent Uncertainty');
    expect(ep(fandom, 4).eliminated).toEqual([]);
  });

  it('drops footnote digits and vote counts from names', () => {
    expect(ep(fandom, 1).immunityWinners).toEqual(['Lewis', 'Savu']);
    expect(ep(fandom, 1).eliminated).toEqual(['Aaliyah']);
  });

  it('reads a voted-out player’s tribe from the colour of their cell', () => {
    expect(ep(fandom, 1).eliminatedTribes).toEqual(['Toka']);
    expect(ep(fandom, 2).eliminatedTribes).toEqual(['Savu']);
  });

  it('reads the finish column', () => {
    expect(ep(fandom, 3).exits).toEqual({ Rob: 'Quit', Patt: '3rd Voted Out' });
  });
});

describe('corroborating the two', () => {
  it('agrees on every aired episode', () => {
    for (const n of [1, 2, 3]) {
      for (const suggestion of suggestionsFor(n)) {
        expect(suggestion.agreement, `Ep ${n} ${suggestion.scoringKey}`).toBe('agree');
      }
    }
  });

  it('takes the losing tribe from immunity, not from who went to tribal', () => {
    const losing = suggestionsFor(3).find((s) => s.scoringKey === 'losing_tribe');
    expect(losing?.values).toEqual(['Toka (Yellow)']);
  });

  it('ignores an exiled player listed beside the winning tribe', () => {
    const suggestions = suggestionsFor(1);
    expect(suggestions.find((s) => s.scoringKey === 'losing_tribe')?.values).toEqual([
      'Toka (Yellow)',
    ]);
    expect(suggestions.some((s) => s.scoringKey === 'win_immunity')).toBe(false);
  });

  it('leaves a quit out of the vote', () => {
    const voted = suggestionsFor(3).find((s) => s.scoringKey === 'voted_out');
    expect(voted?.values).toEqual(['Patt']);
    expect(voted?.note).toContain('Rob left without a vote (Quit)');
  });

  it('flags a disagreement and keeps the primary’s answer', () => {
    const [merged] = corroborate(
      { source: 'Wikipedia', suggestions: [{ scoringKey: 'voted_out', values: ['Patt'], note: 'A.' }] },
      { source: 'Fandom', suggestions: [{ scoringKey: 'voted_out', values: ['Rob'], note: 'B.' }] },
    );
    expect(merged.agreement).toBe('conflict');
    expect(merged.values).toEqual(['Patt']);
    expect(merged.note).toContain('Fandom says Rob');
  });

  it('marks an answer only one source gave', () => {
    const merged = corroborate(
      { source: 'Wikipedia', suggestions: [{ scoringKey: 'voted_out', values: ['Patt'], note: '' }] },
      null,
    );
    expect(merged[0]).toMatchObject({ agreement: 'single', sources: ['Wikipedia'] });
  });
});

describe('advantages held', () => {
  it('lists what each player still in the game is holding', () => {
    expect(parseFandomAdvantages(fandomHtml)).toEqual([
      { name: 'Carter Krull', advantages: ['Hidden Immunity Idol'] },
      { name: 'Devin Way', advantages: ['Extra Vote'] },
      { name: 'Jelly Loblack', advantages: ['Hidden Immunity Idol'] },
      { name: 'Maggie Nestor', advantages: ['Extra Vote'] },
    ]);
  });
});

describe('finding the Fandom page', () => {
  it('borrows the title from the Wikipedia URL', () => {
    expect(fandomTitleFor('https://en.wikipedia.org/wiki/Survivor_51')).toBe('Survivor_51');
    expect(
      fandomPageUrl('https://en.wikipedia.org/wiki/Survivor_50:_In_the_Hands_of_the_Fans'),
    ).toBe('https://survivor.fandom.com/wiki/Survivor_50:_In_the_Hands_of_the_Fans');
    expect(fandomTitleFor('not a url')).toBeNull();
  });
});

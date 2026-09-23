import { describe, expect, it } from 'vitest';
import { parseRecapText } from '../lib/debug/recap';
import { expectScores } from '../lib/debug/verify';
import { DEBUG_CASTAWAYS, DEBUG_TRIBES } from '../lib/debug/config';

const castaways = DEBUG_CASTAWAYS.map((c) => ({ shortName: c.shortName, fullName: c.fullName }));
const tribeLabels = DEBUG_TRIBES.map((t) => t.label);
const parse = (text: string) => parseRecapText(text, { castaways, tribeLabels });

describe('parseRecapText', () => {
  it('reads the labels the generated recap uses', () => {
    const parsed = parse(`Debug episode recap

Losing tribe: Testa
Voted out: Dot
Idol found: Eli`);

    expect(parsed.answerKey).toEqual({
      losing_tribe: ['Testa (Green)'],
      voted_out: ['Dot'],
      hidden_idol: ['Eli'],
    });
    // Nobody said otherwise, so whoever was voted out is who went home.
    expect(parsed.eliminated).toEqual(['Dot']);
  });

  it('does not let "idol played" fall into the idol-found bucket', () => {
    const parsed = parse('Idol played: Yes\nIdol found: Gus');
    expect(parsed.answerKey.play_idol).toEqual(['Yes']);
    expect(parsed.answerKey.hidden_idol).toEqual(['Gus']);
  });

  it('splits multiple names and resolves full names to short names', () => {
    const parsed = parse('Immunity winner: Ada, Bo and Cy Stubbs');
    expect(parsed.answerKey.win_immunity).toEqual(['Ada', 'Bo', 'Cy']);
  });

  it('reports names that are not on the roster rather than passing them through', () => {
    // An unresolved value would score nobody while looking perfectly correct on screen.
    const parsed = parse('Voted out: Parvati');
    expect(parsed.answerKey.voted_out).toEqual([]);
    expect(parsed.unmatchedValues).toEqual([{ label: 'Voted out', value: 'Parvati' }]);
  });

  it('reports labels it does not understand', () => {
    const parsed = parse('Best confessional: Ada');
    expect(parsed.unrecognizedLabels).toEqual(['Best confessional']);
    expect(parsed.answerKey).toEqual({});
  });

  it('keeps an explicit elimination separate from the vote', () => {
    const parsed = parse('Voted out: none\nEliminated: Fern');
    expect(parsed.answerKey.voted_out).toEqual([]);
    expect(parsed.eliminated).toEqual(['Fern']);
  });

  it('normalises yes/no answers and accepts bullets and raw scoring keys', () => {
    const parsed = parse('- Shot in the dark: y\n* play_advantage: NO');
    expect(parsed.answerKey.play_sitd).toEqual(['Yes']);
    expect(parsed.answerKey.play_advantage).toEqual(['No']);
  });

  it('honours # as a comment', () => {
    // The generated recap offers the season-winner line commented out; punctuation is stripped
    // before labels are matched, so without an explicit comment rule it would parse anyway.
    const parsed = parse('# Season winner: Ada\nVoted out: Bo');
    expect(parsed.answerKey.season_winner).toBeUndefined();
    expect(parsed.answerKey.voted_out).toEqual(['Bo']);
  });

  it('treats prose without a colon as ignorable rather than an error', () => {
    const parsed = parse('It was a wild episode\nVoted out: Kit');
    expect(parsed.ignoredLines).toEqual(['It was a wild episode']);
    expect(parsed.answerKey.voted_out).toEqual(['Kit']);
  });
});

describe('expectScores', () => {
  const questions = [
    { id: 'q1', questionKey: 'voted_out', scoringKey: 'voted_out' as const, points: 12, sortOrder: 0 },
    { id: 'q2', questionKey: 'voted_out_2', scoringKey: 'voted_out' as const, points: 12, sortOrder: 1 },
    { id: 'q3', questionKey: 'season_winner', scoringKey: 'season_winner' as const, points: 12, sortOrder: 2 },
  ];

  it('awards points for a correct pick and nothing for a wrong one', () => {
    const [correct, wrong] = expectScores({
      questions: [questions[0]],
      picks: { Right: { q1: 'Ada' }, Wrong: { q1: 'Bo' } },
      answerKey: { voted_out: ['Ada'] },
      seasonWinner: null,
    });
    expect(correct.total).toBe(12);
    expect(wrong.total).toBe(0);
  });

  it('does not pay twice when the same name fills both vote-out slots', () => {
    const [row] = expectScores({
      questions,
      picks: { Doubler: { q1: 'Ada', q2: 'Ada' } },
      answerKey: { voted_out: ['Ada', 'Bo'] },
      seasonWinner: null,
    });
    expect(row.total).toBe(12);
  });

  it('pays both slots when the two picks are different and both went home', () => {
    const [row] = expectScores({
      questions,
      picks: { Sharp: { q1: 'Ada', q2: 'Bo' } },
      answerKey: { voted_out: ['Ada', 'Bo'] },
      seasonWinner: null,
    });
    expect(row.total).toBe(24);
  });

  it('keeps season-winner picks at zero until a winner is declared', () => {
    const input = {
      questions,
      picks: { Patient: { q3: 'Lux' } },
      answerKey: {},
      seasonWinner: null as string | null,
    };
    expect(expectScores(input)[0].total).toBe(0);
    expect(expectScores({ ...input, seasonWinner: 'Lux' })[0].total).toBe(12);
  });

  it('ignores answer-key values that mean nothing happened', () => {
    const [row] = expectScores({
      questions: [questions[0]],
      picks: { Someone: { q1: 'N/A' } },
      answerKey: { voted_out: ['N/A'] },
      seasonWinner: null,
    });
    expect(row.total).toBe(0);
  });
});

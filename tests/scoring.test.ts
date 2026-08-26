import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/season-50.json';
import { pointsFor } from '../lib/points';
import { scoreSeason, withRanks, type ScoreSeasonInput } from '../lib/scoring';
import { generateForm, shapeFor, templatesFor } from '../lib/question-templates';
import { SCORING_KEYS, type ScoringKey } from '../lib/types';

/**
 * Season 50 ran entirely in a Google Sheet. Replaying it through the engine and landing on that
 * sheet's Standings tab is what proves this app can take over the pool without anyone losing a
 * point of history.
 *
 * There is one deliberate exception, documented in KNOWN_SHEET_DELTAS below.
 */

/**
 * The sheet paid 20 points for the second vote-out slot in Episode 5, but its own Points Key says
 * Episode 5 is worth 19. Every other slot that week paid 19, so this is a stray formula rather
 * than a rule. We score the consistent 19 and expect these three to land a point under the sheet.
 * Nobody's rank moves.
 */
const KNOWN_SHEET_DELTAS: Record<string, number> = { Shelby: -1, Jane: -1, Dagny: -1 };

function buildInput(seasonWinnerShortName: string | null): ScoreSeasonInput {
  const episodes = fixture.episodes.map((e) => ({
    id: `ep${e.episodeNumber}`,
    episodeNumber: e.episodeNumber,
  }));

  const questions = fixture.episodes.flatMap((e) =>
    e.questions.map((q) => ({
      id: `ep${e.episodeNumber}:${q.questionKey}`,
      episodeId: `ep${e.episodeNumber}`,
      scoringKey: q.scoringKey as ScoringKey,
      points: q.points,
      sortOrder: q.sortOrder,
    })),
  );

  const answerKey = fixture.episodes.flatMap((e) =>
    Object.entries(e.answerKey).flatMap(([scoringKey, values]) =>
      (values as string[]).map((value) => ({
        episodeId: `ep${e.episodeNumber}`,
        scoringKey: scoringKey as ScoringKey,
        value,
      })),
    ),
  );

  const submissions = fixture.submissions.map((s, i) => ({
    id: `sub${i}`,
    episodeId: `ep${s.episodeNumber}`,
    userId: s.userName,
  }));

  const answers = fixture.submissions.flatMap((s, i) =>
    Object.entries(s.answers).map(([questionKey, value]) => ({
      submissionId: `sub${i}`,
      questionId: `ep${s.episodeNumber}:${questionKey}`,
      value: value as string,
    })),
  );

  return { episodes, questions, answerKey, submissions, answers, seasonWinnerShortName };
}

const scored = scoreSeason(buildInput(fixture.season.winnerShortName));
const byName = new Map(scored.byUser.map((row) => [row.userId, row]));

describe('Season 50 replay vs the spreadsheet Standings tab', () => {
  it('scores every participant in the sheet', () => {
    expect(scored.byUser).toHaveLength(fixture.expectedStandings.length);
  });

  for (const expected of fixture.expectedStandings) {
    describe(expected.name, () => {
      const actual = byName.get(expected.name)!;
      const delta = KNOWN_SHEET_DELTAS[expected.name] ?? 0;

      it('exists', () => expect(actual).toBeDefined());

      for (const key of SCORING_KEYS) {
        it(`${key} subtotal`, () => {
          // The Ep 5 delta is a vote-out slot, so it only ever shifts that one category.
          const adjustment = key === 'voted_out' ? delta : 0;
          expect(actual.byCategory[key]).toBe((expected.byCategory[key] ?? 0) + adjustment);
        });
      }

      it('total', () => {
        expect(actual.total).toBe(expected.total + delta);
      });
    });
  }

  it('preserves the sheet ordering', () => {
    const expectedOrder = [...fixture.expectedStandings]
      .map((s) => ({ name: s.name, total: s.total + (KNOWN_SHEET_DELTAS[s.name] ?? 0) }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .map((s) => s.name);
    expect(scored.byUser.map((r) => r.userId)).toEqual(expectedOrder);
  });

  it('deviates from the sheet only where documented', () => {
    const diffs = Object.fromEntries(
      fixture.expectedStandings
        .map((e) => [e.name, byName.get(e.name)!.total - e.total] as const)
        .filter(([, d]) => d !== 0),
    );
    expect(diffs).toEqual(KNOWN_SHEET_DELTAS);
  });
});

describe('retroactive season-winner sweep', () => {
  it('pays every week that named the eventual winner, at that week\'s rate', () => {
    // Straight from the sheet's "Winner: Aubry" column.
    expect(byName.get('Shannon')!.seasonWinnerPoints).toBe(32);
    expect(byName.get('Don')!.seasonWinnerPoints).toBe(22);
    expect(byName.get('Carmel')!.seasonWinnerPoints).toBe(14);
    expect(byName.get('Shira')!.seasonWinnerPoints).toBe(12);
    expect(byName.get('Shelby')!.seasonWinnerPoints).toBe(7);
  });

  it('pays nothing while the winner is still unknown', () => {
    const midSeason = scoreSeason(buildInput(null));
    for (const row of midSeason.byUser) {
      expect(row.seasonWinnerPoints).toBe(0);
      expect(row.byCategory.season_winner).toBe(0);
    }
  });

  it('changes the standings when it lands', () => {
    const midSeason = scoreSeason(buildInput(null));
    const before = midSeason.byUser.find((r) => r.userId === 'Shannon')!.total;
    expect(byName.get('Shannon')!.total).toBe(before + 32);
  });
});

describe('derived point values', () => {
  it('reproduces the Points Key from the remaining-castaway count', () => {
    const derived = fixture.episodes
      .filter((e) => e.episodeNumber <= 13)
      .map((e) => {
        const remaining = fixture.castaways.filter(
          (c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= e.episodeNumber,
        ).length;
        return pointsFor('voted_out', { remaining });
      });
    expect(derived).toEqual([24, 22, 21, 20, 19, 17, 14, 13, 11, 10, 9, 7, 5]);
  });

  it('matches every point value the sheet recorded', () => {
    for (const episode of fixture.episodes) {
      const remaining = fixture.castaways.filter(
        (c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= episode.episodeNumber,
      ).length;
      const isFinale = episode.episodeNumber === fixture.season.finaleEpisode;
      for (const question of episode.questions) {
        expect({
          episode: episode.episodeNumber,
          key: question.questionKey,
          points: pointsFor(question.scoringKey as ScoringKey, { remaining, isFinale }),
        }).toEqual({
          episode: episode.episodeNumber,
          key: question.questionKey,
          points: question.points,
        });
      }
    }
  });
});

describe('form generation', () => {
  const survivorsBefore = (episodeNumber: number) =>
    fixture.castaways
      .filter((c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= episodeNumber)
      .map((c) => ({ shortName: c.shortName, tribeLabel: c.tribeLabel }));

  it('rebuilds the real Episode 3 form', () => {
    const form = generateForm({ shape: shapeFor(3, 6, 14), survivors: survivorsBefore(3) });
    expect(form.map((q) => [q.questionKey, q.points])).toEqual([
      ['losing_tribe', 10],
      ['voted_out', 21],
      ['hidden_idol', 20],
      ['season_winner', 21],
    ]);
    expect(form[0].options.map((o) => o.value).sort()).toEqual([
      'Cila (Orange)',
      'Kalo (Teal)',
      'Vatu (Magenta)',
    ]);
    expect(form[1].options).toHaveLength(21);
  });

  it('rebuilds the real Episode 10 form', () => {
    const form = generateForm({ shape: shapeFor(10, 6, 14), survivors: survivorsBefore(10) });
    expect(form.map((q) => [q.questionKey, q.points])).toEqual([
      ['win_immunity', 10],
      ['play_advantage', 5],
      ['play_idol', 5],
      ['play_sitd', 5],
      ['voted_out', 10],
      ['hidden_idol', 20],
      ['season_winner', 10],
    ]);
    // The real form listed exactly these ten, and nobody else was left to pick.
    expect(form[0].options.map((o) => o.value).sort()).toEqual(
      ['Aubry', 'Cirie', 'Emily', 'Joe', 'Jonathan', 'Ozzy', 'Rick', 'Rizo', 'Stephenie', 'Tiff'].sort(),
    );
  });

  it('adds a second vote-out slot for a double elimination', () => {
    const form = generateForm({
      shape: shapeFor(5, 6, 14),
      survivors: survivorsBefore(5),
      includeSecondVoteOut: true,
    });
    const keys = form.map((q) => q.questionKey);
    expect(keys).toEqual([
      'losing_tribe',
      'voted_out',
      'voted_out_2',
      'hidden_idol',
      'season_winner',
    ]);
    // Both slots grade against the same bucket, which is what lets either eliminee score.
    expect(form.filter((q) => q.scoringKey === 'voted_out')).toHaveLength(2);
  });
});

describe('scoring rules', () => {
  const base = buildInput('Aubry');

  it('accepts any one of several correct answers', () => {
    // Ep 6 had three immunity winners; naming Christian, Dee or Stephenie all pay 17.
    const ep6 = fixture.episodes.find((e) => e.episodeNumber === 6)!;
    expect(ep6.answerKey.win_immunity).toHaveLength(3);
    for (const pick of ep6.answerKey.win_immunity as string[]) {
      const result = scoreSeason({
        ...base,
        submissions: [{ id: 's', episodeId: 'ep6', userId: 'u' }],
        answers: [{ submissionId: 's', questionId: 'ep6:win_immunity', value: pick }],
      });
      expect(result.byUser[0].total).toBe(17);
    }
  });

  it('treats n/a in the answer key as unscoreable', () => {
    const result = scoreSeason({
      ...base,
      submissions: [{ id: 's', episodeId: 'ep3', userId: 'u' }],
      answers: [{ submissionId: 's', questionId: 'ep3:hidden_idol', value: 'n/a' }],
    });
    expect(result.byUser[0].total).toBe(0);
  });

  it('is case-insensitive', () => {
    const result = scoreSeason({
      ...base,
      submissions: [{ id: 's', episodeId: 'ep7', userId: 'u' }],
      answers: [{ submissionId: 's', questionId: 'ep7:play_idol', value: 'YES' }],
    });
    expect(result.byUser[0].total).toBe(5);
  });

  it('pays both vote-out slots when they name different correct people', () => {
    const result = scoreSeason({
      ...base,
      submissions: [{ id: 's', episodeId: 'ep5', userId: 'u' }],
      answers: [
        { submissionId: 's', questionId: 'ep5:voted_out', value: 'Charlie' },
        { submissionId: 's', questionId: 'ep5:voted_out_2', value: 'Angelina' },
      ],
    });
    expect(result.byUser[0].total).toBe(38);
  });

  it('pays once when both vote-out slots name the same person', () => {
    const result = scoreSeason({
      ...base,
      submissions: [{ id: 's', episodeId: 'ep5', userId: 'u' }],
      answers: [
        { submissionId: 's', questionId: 'ep5:voted_out', value: 'Charlie' },
        { submissionId: 's', questionId: 'ep5:voted_out_2', value: 'Charlie' },
      ],
    });
    expect(result.byUser[0].total).toBe(19);
  });

  it('keeps a participant who never scored on the board', () => {
    const result = scoreSeason({
      ...base,
      submissions: [{ id: 's', episodeId: 'ep7', userId: 'nobody' }],
      answers: [{ submissionId: 's', questionId: 'ep7:voted_out', value: 'Aubry' }],
    });
    expect(result.byUser).toEqual([
      expect.objectContaining({ userId: 'nobody', total: 0 }),
    ]);
  });
});

describe('ranking', () => {
  it('gives tied totals the same place without skipping the next', () => {
    const ranked = withRanks([
      { userId: 'a', total: 10 },
      { userId: 'b', total: 10 },
      { userId: 'c', total: 5 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 2]);
  });

  it('ties Shelby and Shira, as the sheet does', () => {
    const ranked = withRanks(scored.byUser);
    const shelby = ranked.find((r) => r.userId === 'Shelby')!;
    const shira = ranked.find((r) => r.userId === 'Shira')!;
    expect(shelby.total).toBe(203);
    expect(shira.total).toBe(204);
    expect(shira.rank).toBeLessThan(shelby.rank);
  });
});

describe('the seeder can reproduce every historical form', () => {
  const rosterAsOf = (episodeNumber: number) =>
    fixture.castaways.filter(
      (c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= episodeNumber,
    );

  const templatesForEpisode = (episodeNumber: number) =>
    templatesFor(
      shapeFor(episodeNumber, fixture.season.mergeEpisode, fixture.season.finaleEpisode),
      true,
    );

  it('has a template for every question the pool ever asked', () => {
    const missing: string[] = [];
    for (const episode of fixture.episodes) {
      const templates = templatesForEpisode(episode.episodeNumber);
      for (const question of episode.questions) {
        const meta = templates.find((t) => t.questionKey === question.questionKey);
        if (!meta) missing.push(`ep${episode.episodeNumber}:${question.questionKey}`);
        else if (meta.scoringKey !== question.scoringKey) {
          missing.push(`ep${episode.episodeNumber}:${question.questionKey} scores as ${meta.scoringKey}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  /**
   * Every pick anyone ever made has to be a selectable option on the regenerated form. This is
   * what caught the finale: Season 50's last night was a single Google Form the spreadsheet split
   * into Eps 13 and 14, so Ep 14 offers Ep 13's roster — without that, the real picks for Tiff and
   * Rizo are not options, and the seeded archive would silently differ from what people submitted.
   */
  it('offers every answer anyone actually gave as an option', () => {
    const misses: string[] = [];
    for (const submission of fixture.submissions) {
      const episode = fixture.episodes.find((e) => e.episodeNumber === submission.episodeNumber)!;
      const templates = templatesForEpisode(submission.episodeNumber);
      const survivors = rosterAsOf(episode.optionsAsOfEpisode ?? episode.episodeNumber);

      for (const [questionKey, value] of Object.entries(submission.answers)) {
        const meta = templates.find((t) => t.questionKey === questionKey)!;
        const options =
          meta.optionSource === 'castaways'
            ? survivors.map((c) => c.shortName)
            : meta.optionSource === 'tribes'
              ? [...new Set(survivors.map((c) => c.tribeLabel))]
              : ['Yes', 'No'];

        if (!options.some((o) => o.toLowerCase() === String(value).toLowerCase())) {
          misses.push(`ep${submission.episodeNumber} ${submission.userName} ${questionKey}="${value}"`);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it('offers every correct answer as an option too', () => {
    const misses: string[] = [];
    for (const episode of fixture.episodes) {
      const survivors = rosterAsOf(episode.optionsAsOfEpisode ?? episode.episodeNumber);
      const names = survivors.map((c) => c.shortName.toLowerCase());
      const tribes = [...new Set(survivors.map((c) => (c.tribeLabel ?? '').toLowerCase()))];

      for (const [scoringKey, values] of Object.entries(episode.answerKey)) {
        for (const value of values as string[]) {
          const needle = value.toLowerCase();
          if (needle === 'n/a' || needle === 'yes' || needle === 'no') continue;
          const valid = scoringKey === 'losing_tribe' ? tribes.includes(needle) : names.includes(needle);
          if (!valid) misses.push(`ep${episode.episodeNumber} ${scoringKey}="${value}"`);
        }
      }
    }
    expect(misses).toEqual([]);
  });
});

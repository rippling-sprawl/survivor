import { describe, expect, it } from 'vitest';
import { scoreSeason } from '../lib/scoring';
import { categoryFor, isQuestionScoringKey } from '../lib/types';

describe('custom questions', () => {
  const base = {
    episodes: [{ id: 'e1', episodeNumber: 1 }],
    submissions: [{ id: 's1', episodeId: 'e1', userId: 'u1' }],
    seasonWinnerShortName: null,
  };

  it('grades each custom key against its own bucket and totals them as bonus', () => {
    const result = scoreSeason({
      ...base,
      questions: [
        { id: 'q1', episodeId: 'e1', scoringKey: 'voted_out', points: 21, sortOrder: 0 },
        { id: 'q2', episodeId: 'e1', scoringKey: 'custom_will_anyone_quit', points: 5, sortOrder: 1 },
        { id: 'q3', episodeId: 'e1', scoringKey: 'custom_first_to_cry', points: 7, sortOrder: 2 },
      ],
      answerKey: [
        { episodeId: 'e1', scoringKey: 'voted_out', value: 'Rob' },
        { episodeId: 'e1', scoringKey: 'custom_will_anyone_quit', value: 'Yes' },
        { episodeId: 'e1', scoringKey: 'custom_first_to_cry', value: 'Jelly' },
      ],
      answers: [
        { submissionId: 's1', questionId: 'q1', value: 'Rob' },
        { submissionId: 's1', questionId: 'q2', value: 'Yes' },
        // Right answer for q3's bucket would be Jelly; Rob is only right for voted_out.
        { submissionId: 's1', questionId: 'q3', value: 'Rob' },
      ],
    });

    const [row] = result.byUser;
    expect(row.total).toBe(26);
    expect(row.byCategory.voted_out).toBe(21);
    expect(row.byCategory.bonus).toBe(5);
  });

  it('only accepts well-formed custom keys', () => {
    expect(isQuestionScoringKey('voted_out')).toBe(true);
    expect(isQuestionScoringKey('custom_will_anyone_quit')).toBe(true);
    expect(isQuestionScoringKey('custom_')).toBe(false);
    expect(isQuestionScoringKey('custom_Bad Key')).toBe(false);
    expect(isQuestionScoringKey('something_else')).toBe(false);
    expect(categoryFor('custom_x')).toBe('bonus');
    expect(categoryFor('win_immunity')).toBe('win_immunity');
  });
});

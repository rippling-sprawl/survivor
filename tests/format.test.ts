import { describe, expect, it } from 'vitest';
import { easternEveningUtc, formatAirDate, formatDeadline } from '../lib/format';

/**
 * Deadlines are the one piece of this app where being an hour wrong actually costs someone their
 * picks, so the daylight-saving boundary gets its own tests. A fall season crosses it mid-run.
 */
describe('pick deadlines', () => {
  it('is 8pm Eastern during daylight time', () => {
    expect(easternEveningUtc('2026-09-24')).toBe('2026-09-25T00:00:00.000Z');
    expect(formatDeadline(easternEveningUtc('2026-09-24'))).toBe('Thu, Sep 24, 8:00 PM EDT');
  });

  it('is still 8pm Eastern after the clocks go back', () => {
    // 2026-11-01 is the switch to EST, so the offset moves from -4 to -5.
    expect(easternEveningUtc('2026-10-29')).toBe('2026-10-30T00:00:00.000Z');
    expect(easternEveningUtc('2026-11-05')).toBe('2026-11-06T01:00:00.000Z');
    expect(formatDeadline(easternEveningUtc('2026-11-05'))).toBe('Thu, Nov 5, 8:00 PM EST');
  });

  it('holds across a whole fall season', () => {
    const labels = ['2026-09-24', '2026-10-29', '2026-11-05', '2026-12-17'].map((d) =>
      formatDeadline(easternEveningUtc(d)),
    );
    // Every week reads as 8:00 PM local regardless of which side of the switch it falls on.
    expect(labels).toEqual([
      'Thu, Sep 24, 8:00 PM EDT',
      'Thu, Oct 29, 8:00 PM EDT',
      'Thu, Nov 5, 8:00 PM EST',
      'Thu, Dec 17, 8:00 PM EST',
    ]);
  });

  it('rejects anything that is not a plain date', () => {
    expect(easternEveningUtc('not-a-date')).toBeNull();
    expect(easternEveningUtc('2026-9-4')).toBeNull();
    expect(easternEveningUtc('')).toBeNull();
  });

  it('accepts a custom hour', () => {
    expect(easternEveningUtc('2026-09-24', 21)).toBe('2026-09-25T01:00:00.000Z');
  });
});

describe('air dates', () => {
  it('does not drift a date-only value by the viewer’s timezone', () => {
    // The classic bug: "2026-02-25" rendering as Feb 24 for anyone west of UTC.
    expect(formatAirDate('2026-02-25')).toBe('Feb 25, 2026');
    expect(formatAirDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('passes through anything it cannot parse', () => {
    expect(formatAirDate(null)).toBeNull();
    expect(formatAirDate('whenever')).toBe('whenever');
  });
});

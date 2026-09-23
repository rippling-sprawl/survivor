import { describe, expect, it } from 'vitest';
import { acceptsLateEntries, lateCodeFor, lateCodeMatches } from '../lib/late-codes';

const SECRET = 'test-secret';

describe('late-entry codes', () => {
  it('is a stable, readable six-character code', async () => {
    const code = await lateCodeFor('ep1', 'Shannon', SECRET);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(await lateCodeFor('ep1', 'Shannon', SECRET)).toBe(code);
  });

  it('ignores case and spacing in the name and the typed code', async () => {
    const code = await lateCodeFor('ep1', 'Mary Ann', SECRET);
    expect(await lateCodeMatches('ep1', '  mary   ann ', code.toLowerCase(), SECRET)).toBe(true);
    expect(await lateCodeMatches('ep1', 'Mary Ann', `${code.slice(0, 3)}-${code.slice(3)}`, SECRET)).toBe(true);
  });

  it('only works for the name, episode and secret it was made for', async () => {
    const code = await lateCodeFor('ep1', 'Shannon', SECRET);
    expect(await lateCodeMatches('ep1', 'Kyle', code, SECRET)).toBe(false);
    expect(await lateCodeMatches('ep2', 'Shannon', code, SECRET)).toBe(false);
    expect(await lateCodeMatches('ep1', 'Shannon', code, 'other-secret')).toBe(false);
    expect(await lateCodeMatches('ep1', 'Shannon', '', SECRET)).toBe(false);
  });

  it('stops working once an episode is scored', () => {
    expect(acceptsLateEntries({ status: 'open' })).toBe(true);
    expect(acceptsLateEntries({ status: 'locked' })).toBe(true);
    expect(acceptsLateEntries({ status: 'scored' })).toBe(false);
    expect(acceptsLateEntries({ status: 'draft' })).toBe(false);
  });
});

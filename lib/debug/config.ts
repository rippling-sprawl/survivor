/**
 * Debug mode: the fixed identifiers that make dummy data removable, and the environment gate.
 *
 * The whole feature rests on one rule — every row debug mode writes must be findable again by a
 * constant declared here. That is why the season number, the tribe names, the roster and the
 * participant names are all hard-coded rather than generated: cleanup deletes by exact match
 * against these lists, so it can never widen into real pool data no matter what state the
 * database is in.
 */

export const DEBUG_COOKIE = 'survivor_debug';

/** Well outside any real Survivor season number, so it cannot collide with a season people use. */
export const DEBUG_SEASON_NUMBER = 999;
export const DEBUG_SEASON_NAME = 'Debug Season (dummy data)';

/** Chosen so a 12-person roster exercises all three form shapes within eight episodes. */
export const DEBUG_MERGE_EPISODE = 4;
export const DEBUG_FINALE_EPISODE = 8;

export const DEBUG_TRIBES = [
  { name: 'Dbugu', label: 'Dbugu (Blue)', color: '#2F6FED' },
  { name: 'Testa', label: 'Testa (Green)', color: '#2E9E5B' },
  { name: 'Mocka', label: 'Mocka (Amber)', color: '#E0902B' },
] as const;

/**
 * Twelve castaways, four to a tribe. Names are obviously fake on sight: if one of these ever turns
 * up on the real leaderboard, cleanup did not run and it is immediately obvious rather than subtle.
 */
export const DEBUG_CASTAWAYS = [
  { shortName: 'Ada', fullName: 'Ada Testcase', tribe: 'Dbugu' },
  { shortName: 'Bo', fullName: 'Bo Fixture', tribe: 'Dbugu' },
  { shortName: 'Cy', fullName: 'Cy Stubbs', tribe: 'Dbugu' },
  { shortName: 'Dot', fullName: 'Dot Mockman', tribe: 'Dbugu' },
  { shortName: 'Eli', fullName: 'Eli Sample', tribe: 'Testa' },
  { shortName: 'Fern', fullName: 'Fern Placeholder', tribe: 'Testa' },
  { shortName: 'Gus', fullName: 'Gus Dummy', tribe: 'Testa' },
  { shortName: 'Hana', fullName: 'Hana Seedling', tribe: 'Testa' },
  { shortName: 'Ivo', fullName: 'Ivo Sandbox', tribe: 'Mocka' },
  { shortName: 'Jax', fullName: 'Jax Scratch', tribe: 'Mocka' },
  { shortName: 'Kit', fullName: 'Kit Faker', tribe: 'Mocka' },
  { shortName: 'Lux', fullName: 'Lux Throwaway', tribe: 'Mocka' },
] as const;

/**
 * The participant template. Cleanup deletes users by exact name against this list rather than by
 * a `LIKE 'Debug%'` pattern — an exact list cannot accidentally match a real player whose name
 * happens to start the same way, and it cannot be widened by a malformed pattern.
 */
export const DEBUG_PARTICIPANTS = [
  'Debug Alice',
  'Debug Bruno',
  'Debug Cleo',
  'Debug Dev',
  'Debug Enzo',
  'Debug Fay',
] as const;

export type DebugParticipant = (typeof DEBUG_PARTICIPANTS)[number];

/**
 * Whether this deployment may run debug mode at all.
 *
 * Local development is allowed by default because that is where this is meant to be used. A
 * production build has to opt in explicitly with ENABLE_DEBUG_MODE=true, and even then a request
 * still needs both an admin session and the signed debug cookie before anything runs.
 */
export function isDebugEnvironment(): boolean {
  if (process.env.ENABLE_DEBUG_MODE === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

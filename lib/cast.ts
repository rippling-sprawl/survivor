import season51 from '@/data/castaways/season-51.json';

/**
 * Castaway bios, kept as JSON in the repo rather than in the database: they are written once per
 * season, never edited through the app, and have nothing to do with scoring. Regenerate with
 * `npx tsx scripts/scrape-cast.ts`.
 */

export interface CastProfile {
  shortName: string;
  name: string;
  age: number | null;
  hometown: string | null;
  residence: string | null;
  occupation: string | null;
  bio: string[];
  /** A path under public/. */
  image: string;
}

export interface SeasonCast {
  source: string;
  castaways: CastProfile[];
}

const CAST: Record<number, SeasonCast> = {
  51: season51,
};

export function castFor(seasonNumber: number): SeasonCast | null {
  return CAST[seasonNumber] ?? null;
}

export const seasonsWithCast = () => Object.keys(CAST).map(Number);

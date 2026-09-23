/**
 * Pulls a season's cast bios from Paramount+'s "meet the cast" article into a JSON file the app
 * reads directly, and downloads each photo into public/ so the page doesn't depend on their CDN.
 *
 *   npx tsx scripts/scrape-cast.ts
 *
 * The article is a WordPress post: each castaway is an <h3> followed by a photo, a list of
 * "Label: value" facts, and one or more bio paragraphs, up to the next <h3>.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const SEASON = 51;
const SOURCE = 'https://www.paramountplus.com/sneak-peak/survivor-season-51-cast/';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/** Pool short names, which is how the rest of the app refers to castaways. */
const SHORT_NAMES: Record<string, string> = {
  Puglia: 'Aaliyah',
  Levine: 'Alexis',
  Nguyen: 'Thien An',
  Sani: 'Ana',
  Loblack: 'Jelly',
  Booker: 'Brady',
  Krull: 'Carter',
  Chavez: 'Cristian',
  Kilby: 'Kilby',
  Way: 'Devin',
  Macksoud: 'Eric',
  Doore: 'Jenna',
  Flickinger: 'Kristin',
  Kelly: 'Lewis',
  Capobianco: 'Linnea',
  Nestor: 'Maggie',
  Pinsky: 'Mike',
  'Jean-Charles': 'Ori',
  Cannaday: 'Patt',
  Antonson: 'Rob',
  Cox: 'Sharonda',
};

export interface CastProfile {
  shortName: string;
  name: string;
  age: number | null;
  hometown: string | null;
  residence: string | null;
  occupation: string | null;
  bio: string[];
  image: string;
}

/** Picks the 768w rendition from a srcset: big enough for the page, a fraction of the original. */
function pickImage(src: string, srcset: string | undefined): string {
  const candidates = (srcset ?? '')
    .split(',')
    .map((entry) => entry.trim().split(/\s+/))
    .filter(([url, width]) => url && width);
  return candidates.find(([, width]) => width === '768w')?.[0] ?? src;
}

async function main() {
  const response = await fetch(SOURCE, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${SOURCE}: HTTP ${response.status}`);
  const $ = cheerio.load(await response.text());

  const imageDir = path.join('public', 'castaways', `s${SEASON}`);
  await mkdir(imageDir, { recursive: true });

  const profiles: CastProfile[] = [];
  for (const heading of $('h3.wp-block-heading').toArray()) {
    const name = $(heading).text().trim();
    const surname = name.split(/\s+/).at(-1) ?? '';
    const shortName = SHORT_NAMES[surname];
    if (!shortName) continue;

    const section = $(heading).nextUntil('h2, h3');
    const facts = new Map<string, string>();
    section.filter('ul').find('li').each((_, li) => {
      const [label, ...rest] = $(li).text().split(':');
      if (rest.length > 0) facts.set(label.trim().toLowerCase(), rest.join(':').trim());
    });
    const bio = section
      .filter('p')
      .toArray()
      .map((p) => $(p).text().trim())
      .filter(Boolean);

    const img = section.find('img').first();
    const remote = new URL(pickImage(img.attr('src') ?? '', img.attr('srcset')), SOURCE);
    const file = `${shortName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${path.extname(remote.pathname)}`;
    const image = await fetch(remote, { headers: { 'User-Agent': USER_AGENT } });
    if (!image.ok) throw new Error(`${remote}: HTTP ${image.status}`);
    await writeFile(path.join(imageDir, file), Buffer.from(await image.arrayBuffer()));

    // Labels vary: "Hometowns" for two towns, "Hometown/current residence" when they match.
    const shared = facts.get('hometown/current residence');
    const age = Number(facts.get('age'));
    profiles.push({
      shortName,
      name: name.replace(/[“”]/g, '"'),
      age: Number.isInteger(age) ? age : null,
      hometown: facts.get('hometown') ?? facts.get('hometowns') ?? shared ?? null,
      residence: facts.get('current residence') ?? shared ?? null,
      occupation: facts.get('occupation') ?? null,
      bio,
      image: `/castaways/s${SEASON}/${file}`,
    });
  }

  const missing = Object.values(SHORT_NAMES).filter((n) => !profiles.some((p) => p.shortName === n));
  if (missing.length > 0) throw new Error(`No profile found for: ${missing.join(', ')}`);

  const out = path.join('data', 'castaways', `season-${SEASON}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ source: SOURCE, castaways: profiles }, null, 2)}\n`);
  console.log(`Wrote ${profiles.length} castaways to ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

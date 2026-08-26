/**
 * One-time importer: Google Sheet -> fixtures/season-50.json
 *
 * The pool's first fifty seasons of history live in a single spreadsheet, and that spreadsheet is
 * the acceptance test for this whole app: replaying it through lib/scoring.ts has to reproduce its
 * Standings tab. This script pulls the workbook (the xlsx export exposes the hidden tabs that the
 * web view does not) and flattens the parts we care about into a fixture the tests and the seeder
 * both read.
 *
 *   npm run import:sheet            # downloads the published workbook
 *   npm run import:sheet -- a.xlsx  # or reads a local copy
 */

import ExcelJS from 'exceljs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SHEET_ID = '1QtOh-Dj4mj955ogLih8csel759D8KJE7zfl96j_85fY';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
const OUT = resolve(process.cwd(), 'fixtures/season-50.json');

const WIKI_URL = 'https://en.wikipedia.org/wiki/Survivor_50:_In_the_Hands_of_the_Fans';

/** See `optionsAsOfEpisode` below — the finale was one form recorded as two episodes. */
const FINALE_SHARES_NIGHT_WITH = { episode: 14, rosterOf: 13 };

/**
 * The roster, with the short names the forms actually used for picks. Not in the spreadsheet in
 * any structured form, so it is transcribed from the Wikipedia cast table plus the form dropdowns.
 */
const ROSTER: {
  shortName: string;
  fullName: string;
  tribe: 'Cila' | 'Kalo' | 'Vatu';
  eliminatedEpisode: number | null;
  finishPlace: number;
}[] = [
  { shortName: 'Jenna', fullName: 'Jenna Lewis-Dougherty', tribe: 'Cila', eliminatedEpisode: 1, finishPlace: 24 },
  { shortName: 'Kyle', fullName: 'Kyle Fraser', tribe: 'Vatu', eliminatedEpisode: 1, finishPlace: 23 },
  { shortName: 'Savannah', fullName: 'Savannah Louie', tribe: 'Cila', eliminatedEpisode: 2, finishPlace: 22 },
  { shortName: 'Q', fullName: 'Quintavius "Q" Burdette', tribe: 'Vatu', eliminatedEpisode: 3, finishPlace: 21 },
  { shortName: 'Mike', fullName: 'Mike White', tribe: 'Kalo', eliminatedEpisode: 4, finishPlace: 20 },
  { shortName: 'Angelina', fullName: 'Angelina Keeley', tribe: 'Kalo', eliminatedEpisode: 5, finishPlace: 19 },
  { shortName: 'Charlie', fullName: 'Charlie Davis', tribe: 'Cila', eliminatedEpisode: 5, finishPlace: 18 },
  { shortName: 'Kamilla', fullName: 'Kamilla Karthigesu', tribe: 'Vatu', eliminatedEpisode: 6, finishPlace: 17 },
  { shortName: 'Genevieve', fullName: 'Genevieve Mushaluk', tribe: 'Vatu', eliminatedEpisode: 6, finishPlace: 16 },
  { shortName: 'Colby', fullName: 'Colby Donaldson', tribe: 'Kalo', eliminatedEpisode: 6, finishPlace: 15 },
  { shortName: 'Dee', fullName: 'Dee Valladares', tribe: 'Kalo', eliminatedEpisode: 7, finishPlace: 14 },
  { shortName: 'Chrissy', fullName: 'Chrissy Hofbeck', tribe: 'Kalo', eliminatedEpisode: 8, finishPlace: 13 },
  { shortName: 'Coach', fullName: 'Benjamin "Coach" Wade', tribe: 'Vatu', eliminatedEpisode: 8, finishPlace: 12 },
  { shortName: 'Christian', fullName: 'Christian Hubicki', tribe: 'Cila', eliminatedEpisode: 9, finishPlace: 11 },
  { shortName: 'Stephenie', fullName: 'Stephenie LaGrossa Kendrick', tribe: 'Vatu', eliminatedEpisode: 10, finishPlace: 10 },
  { shortName: 'Emily', fullName: 'Emily Flippen', tribe: 'Cila', eliminatedEpisode: 11, finishPlace: 9 },
  { shortName: 'Ozzy', fullName: 'Oscar "Ozzy" Lusth', tribe: 'Vatu', eliminatedEpisode: 11, finishPlace: 8 },
  { shortName: 'Rick', fullName: 'Rick Devens', tribe: 'Cila', eliminatedEpisode: 12, finishPlace: 7 },
  { shortName: 'Cirie', fullName: 'Cirie Fields', tribe: 'Cila', eliminatedEpisode: 12, finishPlace: 6 },
  { shortName: 'Tiff', fullName: 'Tiffany Ervin', tribe: 'Kalo', eliminatedEpisode: 13, finishPlace: 5 },
  { shortName: 'Rizo', fullName: 'Rizo Velovic', tribe: 'Vatu', eliminatedEpisode: 13, finishPlace: 4 },
  { shortName: 'Joe', fullName: 'Joe Hunter', tribe: 'Kalo', eliminatedEpisode: 14, finishPlace: 3 },
  { shortName: 'Jonathan', fullName: 'Jonathan Young', tribe: 'Kalo', eliminatedEpisode: 14, finishPlace: 2 },
  { shortName: 'Aubry', fullName: 'Aubry Bracco', tribe: 'Kalo', eliminatedEpisode: null, finishPlace: 1 },
];

const TRIBES: Record<string, { label: string; color: string }> = {
  Cila: { label: 'Cila (Orange)', color: '#F26B21' },
  Kalo: { label: 'Kalo (Teal)', color: '#1C8C8C' },
  Vatu: { label: 'Vatu (Magenta)', color: '#B5297F' },
};

/**
 * Column positions in the "All Submissions" tab, mapped to the question they represent. The tab
 * has three parallel blocks (raw answers, correct/incorrect markers, points) and we only want the
 * first; the rest is the spreadsheet's own scoring, which this app replaces.
 */
const SUBMISSION_COLUMNS: { column: number; questionKey: string }[] = [
  { column: 15, questionKey: 'losing_tribe' },
  { column: 6, questionKey: 'win_immunity' },
  { column: 8, questionKey: 'play_advantage' },
  { column: 9, questionKey: 'play_idol' },
  { column: 10, questionKey: 'play_sitd' },
  { column: 11, questionKey: 'voted_out' },
  { column: 14, questionKey: 'voted_out_2' },
  { column: 12, questionKey: 'hidden_idol' },
  { column: 13, questionKey: 'season_winner' },
];

const SCORING_KEY_FOR: Record<string, string> = {
  win_immunity: 'win_immunity',
  play_advantage: 'play_advantage',
  play_idol: 'play_idol',
  play_sitd: 'play_sitd',
  voted_out: 'voted_out',
  voted_out_2: 'voted_out',
  hidden_idol: 'hidden_idol',
  season_winner: 'season_winner',
  losing_tribe: 'losing_tribe',
};

const POINTS_KEY_COLUMNS: { column: number; scoringKey: string }[] = [
  { column: 2, scoringKey: 'losing_tribe' },
  { column: 3, scoringKey: 'win_immunity' },
  { column: 4, scoringKey: 'play_advantage' },
  { column: 5, scoringKey: 'play_idol' },
  { column: 6, scoringKey: 'play_sitd' },
  { column: 7, scoringKey: 'voted_out' },
  { column: 8, scoringKey: 'hidden_idol' },
  { column: 9, scoringKey: 'season_winner' },
];

/** Standings columns hold one category subtotal each, in this order. */
const STANDINGS_CATEGORIES = [
  'losing_tribe',
  'win_immunity',
  'play_advantage',
  'play_idol',
  'play_sitd',
  'voted_out',
  'hidden_idol',
] as const;

const text = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null) {
    const rich = value as { text?: string; result?: unknown };
    if (typeof rich.text === 'string') return rich.text.trim();
    if (rich.result !== undefined) return String(rich.result).trim();
  }
  return String(value).trim();
};

const num = (value: unknown): number | null => {
  const raw = text(value);
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

async function loadWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const local = process.argv[2];
  if (local) {
    console.log(`Reading ${local}`);
    await workbook.xlsx.readFile(local);
    return workbook;
  }
  console.log(`Downloading ${SHEET_URL}`);
  const response = await fetch(SHEET_URL);
  if (!response.ok) throw new Error(`Sheet download failed: ${response.status}`);
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
}

async function main() {
  const workbook = await loadWorkbook();

  const sheet = (name: string): ExcelJS.Worksheet => {
    const found = workbook.getWorksheet(name);
    if (!found) throw new Error(`Missing tab: ${name}`);
    return found;
  };

  // ---- Points Key: episode -> scoringKey -> points -------------------------------------------
  const pointsByEpisode = new Map<number, Record<string, number>>();
  sheet('Points Key').eachRow((row) => {
    const episode = num(row.getCell(1).value);
    if (episode === null) return;
    const entry: Record<string, number> = {};
    for (const { column, scoringKey } of POINTS_KEY_COLUMNS) {
      const points = num(row.getCell(column).value);
      if (points !== null) entry[scoringKey] = points;
    }
    pointsByEpisode.set(episode, entry);
  });

  // ---- Answer Key: episode -> scoringKey -> accepted values ----------------------------------
  const answerKeyByEpisode = new Map<number, Record<string, string[]>>();
  sheet('Answer Key').eachRow((row) => {
    const episode = num(row.getCell(2).value);
    if (episode === null) return;
    const scoringKey = text(row.getCell(3).value);
    const value = text(row.getCell(5).value);
    if (!scoringKey || !value) return;
    const entry = answerKeyByEpisode.get(episode) ?? {};
    (entry[scoringKey] ??= []).push(value);
    answerKeyByEpisode.set(episode, entry);
  });

  // ---- All Submissions -----------------------------------------------------------------------
  interface RawSubmission {
    episodeNumber: number;
    userName: string;
    email: string;
    submittedAt: string | null;
    answers: Record<string, string>;
  }
  const submissions: RawSubmission[] = [];
  const usersByName = new Map<string, string>();

  sheet('All Submissions').eachRow((row) => {
    const episodeNumber = num(row.getCell(2).value);
    if (episodeNumber === null) return;
    const userName = text(row.getCell(3).value);
    if (!userName) return;
    const email = text(row.getCell(5).value);
    const timestamp = row.getCell(4).value;
    const submittedAt =
      timestamp instanceof Date ? timestamp.toISOString() : text(timestamp) || null;

    const answers: Record<string, string> = {};
    for (const { column, questionKey } of SUBMISSION_COLUMNS) {
      const value = text(row.getCell(column).value);
      if (value) answers[questionKey] = value;
    }

    if (email && !usersByName.has(userName)) usersByName.set(userName, email);
    submissions.push({ episodeNumber, userName, email, submittedAt, answers });
  });

  // ---- Standings: the numbers this app has to reproduce ---------------------------------------
  interface ExpectedStanding {
    name: string;
    byCategory: Record<string, number>;
    seasonWinnerPoints: number;
    total: number;
  }
  const expectedStandings: ExpectedStanding[] = [];
  sheet('Standings').eachRow((row) => {
    const name = text(row.getCell(4).value);
    const total = num(row.getCell(14).value);
    if (!name || name === 'Name' || total === null) return;
    const byCategory: Record<string, number> = {};
    STANDINGS_CATEGORIES.forEach((key, i) => {
      byCategory[key] = num(row.getCell(5 + i).value) ?? 0;
    });
    const seasonWinnerPoints = num(row.getCell(13).value) ?? 0;
    byCategory.season_winner = seasonWinnerPoints;
    expectedStandings.push({ name, byCategory, seasonWinnerPoints, total });
  });

  // ---- Reconstruct each episode's question set -----------------------------------------------
  // The spreadsheet never stored the forms themselves, so we infer which questions an episode
  // asked from which answer columns its submissions actually filled in.
  const episodeNumbers = [...new Set(submissions.map((s) => s.episodeNumber))].sort((a, b) => a - b);

  const episodes = episodeNumbers.map((episodeNumber) => {
    const rows = submissions.filter((s) => s.episodeNumber === episodeNumber);
    // A column counts as a real question only if somebody gave it a real answer. Eps 1-4 have
    // "n/a" sitting in the second vote-out column for every participant, because the spreadsheet
    // kept the column padded even in the weeks the form never asked it.
    const asked = SUBMISSION_COLUMNS.map((c) => c.questionKey).filter((key) =>
      rows.some((r) => r.answers[key] && r.answers[key].toLowerCase() !== 'n/a'),
    );
    const points = pointsByEpisode.get(episodeNumber) ?? {};

    for (const row of rows) {
      for (const key of Object.keys(row.answers)) {
        if (!asked.includes(key)) delete row.answers[key];
      }
    }

    return {
      episodeNumber,
      // Which week's roster this form offered. Normally the episode's own, but Season 50's finale
      // night was a single Google Form that the spreadsheet split into two scoring rows: Ep 13
      // (first immunity, vote-out, champ) and Ep 14 (final immunity, fire-making). Both were
      // filled while five castaways were still in, so Ep 14 must offer Ep 13's roster or the
      // historical picks for Tiff and Rizo would not be valid options.
      optionsAsOfEpisode:
        episodeNumber === FINALE_SHARES_NIGHT_WITH.episode
          ? FINALE_SHARES_NIGHT_WITH.rosterOf
          : episodeNumber,
      questions: asked.map((questionKey, sortOrder) => {
        const scoringKey = SCORING_KEY_FOR[questionKey];
        return {
          questionKey,
          scoringKey,
          points: points[scoringKey] ?? 0,
          sortOrder,
        };
      }),
      answerKey: answerKeyByEpisode.get(episodeNumber) ?? {},
      recordedPoints: points,
    };
  });

  const fixture = {
    generatedFrom: SHEET_URL,
    season: {
      number: 50,
      name: 'Survivor 50: In the Hands of the Fans',
      mergeEpisode: 6,
      finaleEpisode: 14,
      startingCastawayCount: ROSTER.length,
      wikiUrl: WIKI_URL,
      winnerShortName: 'Aubry',
    },
    tribes: TRIBES,
    castaways: ROSTER.map((c) => ({
      ...c,
      tribeLabel: TRIBES[c.tribe].label,
      tribeColor: TRIBES[c.tribe].color,
    })),
    users: [...usersByName.entries()].map(([displayName, email]) => ({ displayName, email })),
    episodes,
    submissions,
    expectedStandings,
  };

  await writeFile(OUT, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(
    `Wrote ${OUT}\n  ${fixture.castaways.length} castaways` +
      `\n  ${fixture.users.length} participants` +
      `\n  ${fixture.episodes.length} episodes` +
      `\n  ${fixture.submissions.length} submissions` +
      `\n  ${fixture.expectedStandings.length} standings rows`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

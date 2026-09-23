/**
 * Creates Season 51 with its opening cast and a draft Episode 1 form.
 *
 * Tribes had not been announced before the premiere, so castaways go in with no tribe and the
 * "which tribe loses immunity?" question is left off Episode 1. Every other question is generated
 * from the same templates the admin UI uses.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/seed-season-51.ts
 */

import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateForm } from '../lib/question-templates';
import { easternEveningUtc } from '../lib/format';

const SEASON = {
  number: 51,
  name: 'Survivor 51',
  wikiUrl: 'https://en.wikipedia.org/wiki/Survivor_51',
};

const PREMIERE = '2026-09-23';

/** Order and spelling follow the Wikipedia contestants table. */
const CASTAWAYS: { shortName: string; fullName: string }[] = [
  { shortName: 'Rob', fullName: 'Rob Antonson' },
  { shortName: 'Brady', fullName: 'Brady Booker' },
  { shortName: 'Patt', fullName: 'Patt Cannaday' },
  { shortName: 'Linnea', fullName: 'Linnea Capobianco' },
  { shortName: 'Cristian', fullName: 'Cristian Chavez' },
  { shortName: 'Sharonda', fullName: 'Sharonda Cox' },
  { shortName: 'Jenna', fullName: 'Jenna Doore' },
  { shortName: 'Kristin', fullName: 'Kristin Flickinger' },
  { shortName: 'Ori', fullName: 'Ori Jean-Charles' },
  { shortName: 'Lewis', fullName: 'Lewis Kelly' },
  { shortName: 'Kilby', fullName: 'Danny "Kilby" Kilby' },
  { shortName: 'Carter', fullName: 'Carter Krull' },
  { shortName: 'Alexis', fullName: 'Alexis Levine' },
  { shortName: 'Jelly', fullName: 'Angelica "Jelly" Loblack' },
  { shortName: 'Eric', fullName: 'Eric Macksoud' },
  { shortName: 'Maggie', fullName: 'Maggie Nestor' },
  { shortName: 'Thien An', fullName: 'Thien An Nguyen' },
  { shortName: 'Mike', fullName: 'Mike Pinsky' },
  { shortName: 'Aaliyah', fullName: 'Aaliyah Puglia' },
  { shortName: 'Ana', fullName: 'Ana Sani' },
  { shortName: 'Devin', fullName: 'Devin Way' },
];

/** Questions that cannot be asked until tribes are known. */
const HIDDEN_QUESTIONS = new Set(['losing_tribe']);

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function check<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no rows returned`);
  return result.data;
}

async function main() {
  const db = client();

  const existing = await db.from('survivor_seasons').select('id').eq('number', SEASON.number);
  if (check(existing, 'lookup season').length > 0) {
    throw new Error(`Season ${SEASON.number} already exists; delete it first to re-seed.`);
  }

  const season = check(
    await db
      .from('survivor_seasons')
      .insert({
        number: SEASON.number,
        name: SEASON.name,
        status: 'active',
        starting_castaway_count: CASTAWAYS.length,
        wiki_url: SEASON.wikiUrl,
      })
      .select('id')
      .single(),
    'insert season',
  ) as { id: string };

  // Only one season can be the one the site defaults to.
  check(
    await db
      .from('survivor_seasons')
      .update({ status: 'complete' })
      .eq('status', 'active')
      .neq('id', season.id)
      .select('id'),
    'demote previous season',
  );

  check(
    await db
      .from('survivor_castaways')
      .insert(
        CASTAWAYS.map((c, i) => ({
          season_id: season.id,
          short_name: c.shortName,
          full_name: c.fullName,
          sort_order: i,
        })),
      )
      .select('id'),
    'insert castaways',
  );

  const episode = check(
    await db
      .from('survivor_episodes')
      .insert({
        season_id: season.id,
        episode_number: 1,
        air_date: PREMIERE,
        wiki_episode_number: 1,
        locks_at: easternEveningUtc(PREMIERE),
        status: 'draft',
      })
      .select('id')
      .single(),
    'insert episode',
  ) as { id: string };

  const questions = generateForm({
    shape: 'pre_merge',
    survivors: CASTAWAYS.map((c) => ({ shortName: c.shortName, tribeLabel: null })),
  }).filter((q) => !HIDDEN_QUESTIONS.has(q.questionKey));

  for (const [sortOrder, question] of questions.entries()) {
    const row = check(
      await db
        .from('survivor_questions')
        .insert({
          episode_id: episode.id,
          question_key: question.questionKey,
          scoring_key: question.scoringKey,
          prompt: question.prompt,
          help_text: question.helpText,
          input_type: question.inputType,
          points: question.points,
          sort_order: sortOrder,
          is_required: question.isRequired,
        })
        .select('id')
        .single(),
      `insert question ${question.questionKey}`,
    ) as { id: string };

    check(
      await db
        .from('survivor_question_options')
        .insert(
          question.options.map((o) => ({
            question_id: row.id,
            value: o.value,
            label: o.label,
            sort_order: o.sortOrder,
          })),
        )
        .select('id'),
      `insert options ${question.questionKey}`,
    );
    console.log(`  ${question.questionKey} (${question.points} pts, ${question.options.length} options)`);
  }

  console.log(`Season ${SEASON.number}: ${CASTAWAYS.length} castaways, Episode 1 draft ${episode.id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

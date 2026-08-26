import { pointsFor, type PointsContext } from './points';
import type { InputType, ScoringKey } from './types';

/**
 * The weekly form is close to static — what changes is the point values, the dropdown options, and
 * which shape applies. Prompts are transcribed from the real Season 50 Google Forms so the site
 * reads the way the pool already reads. Everything here is a starting point: the admin edits and
 * approves before a form goes live.
 */

export interface QuestionTemplate {
  questionKey: string;
  scoringKey: ScoringKey;
  prompt: string;
  helpText: string | null;
  inputType: InputType;
  /** Where the options come from when the form is generated. */
  optionSource: 'castaways' | 'tribes' | 'yes_no';
  isRequired: boolean;
}

export type FormShape = 'pre_merge' | 'post_merge' | 'finale';

const YES_NO_OPTIONS = ['Yes', 'No'];

const SEASON_WINNER: QuestionTemplate = {
  questionKey: 'season_winner',
  scoringKey: 'season_winner',
  prompt: 'Who will Win the Season?',
  helpText: 'Repeats are allowed. If your pick gets voted out, you can switch next week.',
  inputType: 'select',
  optionSource: 'castaways',
  isRequired: true,
};

const HIDDEN_IDOL: QuestionTemplate = {
  questionKey: 'hidden_idol',
  scoringKey: 'hidden_idol',
  prompt: 'Who will acquire a hidden immunity idol?',
  helpText: 'This week only.',
  inputType: 'select',
  optionSource: 'castaways',
  isRequired: true,
};

const VOTED_OUT: QuestionTemplate = {
  questionKey: 'voted_out',
  scoringKey: 'voted_out',
  prompt: 'Who will be voted out?',
  helpText: null,
  inputType: 'select',
  optionSource: 'castaways',
  isRequired: true,
};

/**
 * Only added when a double elimination is expected. Season 50 used it exactly once, in Ep 5.
 * It is graded against the same bucket as the first slot, so naming either eliminee scores.
 */
export const SECOND_VOTED_OUT: QuestionTemplate = {
  questionKey: 'voted_out_2',
  scoringKey: 'voted_out',
  prompt: 'Who will be the SECOND person voted out?',
  helpText: 'Double elimination week.',
  inputType: 'select',
  optionSource: 'castaways',
  isRequired: true,
};

const PRE_MERGE: QuestionTemplate[] = [
  {
    questionKey: 'losing_tribe',
    scoringKey: 'losing_tribe',
    prompt: 'Which Tribe will lose the immunity challenge?',
    helpText: null,
    inputType: 'radio',
    optionSource: 'tribes',
    isRequired: true,
  },
  VOTED_OUT,
  HIDDEN_IDOL,
  SEASON_WINNER,
];

const POST_MERGE: QuestionTemplate[] = [
  {
    questionKey: 'win_immunity',
    scoringKey: 'win_immunity',
    prompt: 'Who will win individual immunity?',
    helpText: null,
    inputType: 'select',
    optionSource: 'castaways',
    isRequired: true,
  },
  {
    questionKey: 'play_advantage',
    scoringKey: 'play_advantage',
    prompt: 'Will any of the following advantages be played?',
    helpText: 'Block a vote, steal a vote, or an extra vote.',
    inputType: 'radio',
    optionSource: 'yes_no',
    isRequired: true,
  },
  {
    questionKey: 'play_idol',
    scoringKey: 'play_idol',
    prompt: 'Will an idol be played?',
    helpText: null,
    inputType: 'radio',
    optionSource: 'yes_no',
    isRequired: true,
  },
  {
    questionKey: 'play_sitd',
    scoringKey: 'play_sitd',
    prompt: 'Will a shot-in-the-dark be played?',
    helpText: null,
    inputType: 'radio',
    optionSource: 'yes_no',
    isRequired: true,
  },
  VOTED_OUT,
  HIDDEN_IDOL,
  SEASON_WINNER,
];

/**
 * At the finale the season-winner question resolves itself, so only two things are worth asking:
 * the final immunity necklace and the fire-making challenge.
 *
 * The fire-making question rides on the `hidden_idol` scoring key rather than getting one of its
 * own. That is inherited from the spreadsheet, which reused the idol column for it, and keeping
 * the key means Season 50's recorded answers still grade correctly.
 */
const FINALE: QuestionTemplate[] = [
  {
    questionKey: 'win_immunity',
    scoringKey: 'win_immunity',
    prompt: 'Who will win the FINAL individual immunity?',
    helpText: null,
    inputType: 'select',
    optionSource: 'castaways',
    isRequired: true,
  },
  {
    questionKey: 'hidden_idol',
    scoringKey: 'hidden_idol',
    prompt: 'Who will win the fire-making challenge?',
    helpText: null,
    inputType: 'select',
    optionSource: 'castaways',
    isRequired: true,
  },
];

export function shapeFor(
  episodeNumber: number,
  mergeEpisode: number | null,
  finaleEpisode: number | null,
): FormShape {
  if (finaleEpisode !== null && episodeNumber >= finaleEpisode) return 'finale';
  if (mergeEpisode !== null && episodeNumber >= mergeEpisode) return 'post_merge';
  return 'pre_merge';
}

export function templatesFor(shape: FormShape, includeSecondVoteOut = false): QuestionTemplate[] {
  const base =
    shape === 'pre_merge' ? PRE_MERGE : shape === 'post_merge' ? POST_MERGE : FINALE;
  if (!includeSecondVoteOut) return [...base];

  // Slot the extra vote-out immediately after the first so the form reads naturally.
  const out = [...base];
  const at = out.findIndex((t) => t.questionKey === 'voted_out');
  if (at === -1) return out;
  out.splice(at + 1, 0, SECOND_VOTED_OUT);
  return out;
}

export interface GeneratedQuestion {
  questionKey: string;
  scoringKey: ScoringKey;
  prompt: string;
  helpText: string | null;
  inputType: InputType;
  points: number;
  sortOrder: number;
  isRequired: boolean;
  options: { value: string; label: string; sortOrder: number }[];
}

export interface GenerateFormInput {
  shape: FormShape;
  /** Castaways still in the game, in display order. */
  survivors: { shortName: string; tribeLabel: string | null }[];
  includeSecondVoteOut?: boolean;
}

/**
 * Builds a complete draft form. Point values fall out of how many castaways are left, and the
 * dropdowns are snapshotted from the survivors so an archived episode always renders the options
 * it was actually asked with.
 */
export function generateForm(input: GenerateFormInput): GeneratedQuestion[] {
  const { shape, survivors, includeSecondVoteOut = false } = input;
  const ctx: PointsContext = { remaining: survivors.length, isFinale: shape === 'finale' };

  const castawayOptions = survivors.map((c, i) => ({
    value: c.shortName,
    label: c.shortName,
    sortOrder: i,
  }));

  const tribeLabels = [...new Set(survivors.map((c) => c.tribeLabel).filter(Boolean))] as string[];
  const tribeOptions = tribeLabels.map((label, i) => ({ value: label, label, sortOrder: i }));

  const yesNoOptions = YES_NO_OPTIONS.map((value, i) => ({ value, label: value, sortOrder: i }));

  return templatesFor(shape, includeSecondVoteOut).map((template, index) => ({
    questionKey: template.questionKey,
    scoringKey: template.scoringKey,
    prompt: template.prompt,
    helpText: template.helpText,
    inputType: template.inputType,
    points: pointsFor(template.scoringKey, ctx),
    sortOrder: index,
    isRequired: template.isRequired,
    options:
      template.optionSource === 'castaways'
        ? castawayOptions
        : template.optionSource === 'tribes'
          ? tribeOptions
          : yesNoOptions,
  }));
}

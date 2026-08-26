/**
 * Shared domain types.
 *
 * `scoringKey` is deliberately separate from `questionKey`: a single episode can ask the same
 * thing in two slots (Season 50 Ep 5 asked "who will be voted out?" twice because two people
 * went home), and both slots are graded against the same answer-key bucket.
 */

export const SCORING_KEYS = [
  'losing_tribe',
  'win_immunity',
  'play_advantage',
  'play_idol',
  'play_sitd',
  'voted_out',
  'hidden_idol',
  'season_winner',
] as const;

export type ScoringKey = (typeof SCORING_KEYS)[number];

/** Display order and labels for the leaderboard's category columns. */
export const CATEGORY_LABELS: Record<ScoringKey, string> = {
  losing_tribe: 'Losing Tribe',
  win_immunity: 'Win Immunity',
  play_advantage: 'Advantage Played',
  play_idol: 'Idol Played',
  play_sitd: 'S.i.t.D Played',
  voted_out: 'Voted Out',
  hidden_idol: 'Acquire an Idol',
  season_winner: 'Season Winner',
};

export type EpisodeStatus = 'draft' | 'approved' | 'open' | 'locked' | 'scored';
export type SeasonStatus = 'upcoming' | 'active' | 'complete';
export type InputType = 'select' | 'radio';

export interface Season {
  id: string;
  number: number;
  name: string;
  status: SeasonStatus;
  mergeEpisode: number | null;
  /** The last episode of the season; it is scored on its own point table. */
  finaleEpisode: number | null;
  startingCastawayCount: number;
  wikiUrl: string | null;
  winnerCastawayName: string | null;
}

export interface Castaway {
  id: string;
  seasonId: string;
  shortName: string;
  fullName: string | null;
  tribe: string | null;
  tribeLabel: string | null;
  tribeColor: string | null;
  eliminatedEpisode: number | null;
  finishPlace: number | null;
}

export interface Episode {
  id: string;
  seasonId: string;
  episodeNumber: number;
  title: string | null;
  airDate: string | null;
  wikiEpisodeNumber: number | null;
  status: EpisodeStatus;
  locksAt: string | null;
}

export interface Question {
  id: string;
  episodeId: string;
  questionKey: string;
  scoringKey: ScoringKey;
  prompt: string;
  helpText: string | null;
  inputType: InputType;
  points: number;
  sortOrder: number;
  isRequired: boolean;
}

export interface QuestionOption {
  id: string;
  questionId: string;
  value: string;
  label: string;
  sortOrder: number;
}

export interface Submission {
  id: string;
  episodeId: string;
  userId: string;
  submittedAt: string | null;
}

export interface Answer {
  submissionId: string;
  questionId: string;
  value: string;
}

export interface AnswerKeyEntry {
  episodeId: string;
  scoringKey: ScoringKey;
  value: string;
}

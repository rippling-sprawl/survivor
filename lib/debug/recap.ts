import { resolveCastawayName, type CastawayName } from '../wiki';
import { SCORING_KEYS, type ScoringKey } from '../types';

/**
 * Parses a plain-text episode recap into a proposed answer key.
 *
 * This exists so debug mode can score an episode the way a person actually would — by reading a
 * few lines of "here's what happened" — rather than by handing the scorer a pre-built answer key.
 * That distinction matters for what is being validated: an answer key posted straight to the API
 * proves the API works, while text that has to be understood, mapped onto scoring keys, and
 * resolved against the season roster exercises the parts most likely to be quietly wrong.
 *
 * Nothing is guessed. A name that does not resolve to a castaway on this season's roster is
 * reported as unmatched rather than passed through, because an answer-key value that matches no
 * dropdown option scores nobody while looking entirely correct on screen.
 */

export interface ParsedRecap {
  answerKey: Partial<Record<ScoringKey, string[]>>;
  /** Short names to mark eliminated. Defaults to the voted-out values unless stated separately. */
  eliminated: string[];
  /** Lines that looked like `label: value` but named nothing recognisable. */
  unrecognizedLabels: string[];
  /** Values that could not be resolved, with the label they came from. */
  unmatchedValues: { label: string; value: string }[];
  /** Prose lines with no `label: value` shape, kept only so the UI can show what was skipped. */
  ignoredLines: string[];
}

/** How each scoring key may be written in prose. Matched longest-first, so order matters here. */
const LABEL_PATTERNS: { key: ScoringKey | 'eliminated'; patterns: string[] }[] = [
  // Checked before the bare "idol" forms below, which would otherwise swallow them.
  { key: 'play_idol', patterns: ['idol played', 'played an idol', 'idol was played', 'plays idol'] },
  {
    key: 'hidden_idol',
    patterns: [
      'idol found',
      'found an idol',
      'found idol',
      'hidden immunity idol',
      'hidden idol',
      'acquired an idol',
      'acquires idol',
      'idol acquired',
    ],
  },
  {
    key: 'play_sitd',
    patterns: ['shot in the dark', 'shot-in-the-dark', 'sitd', 'sitd played'],
  },
  {
    key: 'play_advantage',
    patterns: ['advantage played', 'advantage was played', 'played an advantage', 'advantage'],
  },
  {
    key: 'win_immunity',
    patterns: [
      'individual immunity',
      'final immunity',
      'immunity winner',
      'immunity winners',
      'won immunity',
      'wins immunity',
      'immunity',
    ],
  },
  {
    key: 'losing_tribe',
    patterns: [
      'losing tribe',
      'lost immunity',
      'tribe voted out',
      'went to tribal council',
      'tribal council',
    ],
  },
  { key: 'voted_out', patterns: ['voted out', 'vote out', 'voted off'] },
  { key: 'eliminated', patterns: ['eliminated', 'elimination', 'goes home', 'went home'] },
  { key: 'season_winner', patterns: ['season winner', 'sole survivor', 'wins the season'] },
];

/** Keys whose value is a castaway short name. */
const CASTAWAY_KEYS = new Set<ScoringKey>([
  'voted_out',
  'win_immunity',
  'hidden_idol',
  'season_winner',
]);

/** Keys answered Yes or No rather than with a name. */
const YES_NO_KEYS = new Set<ScoringKey>(['play_advantage', 'play_idol', 'play_sitd']);

const NOTHING = /^(none|nobody|n\/?a|no one|-|—|–)$/i;

const normalizeLabel = (label: string) =>
  label
    .toLowerCase()
    .replace(/\(s\)/g, 's')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function keyForLabel(label: string): ScoringKey | 'eliminated' | null {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;

  // An exact scoring key (`voted_out:`) is accepted too — handy when copying from the API.
  const asKey = normalized.replace(/[ -]/g, '_');
  if ((SCORING_KEYS as readonly string[]).includes(asKey)) return asKey as ScoringKey;

  for (const entry of LABEL_PATTERNS) {
    if (entry.patterns.some((pattern) => normalized.includes(pattern))) return entry.key;
  }
  return null;
}

/** Splits "Ada, Bo & Cy" into three names without breaking a name that contains a space. */
function splitValues(raw: string): string[] {
  return raw
    .replace(/\band\b/gi, ',')
    .replace(/&/g, ',')
    .split(/[,;/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function toYesNo(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (['yes', 'y', 'true', 'played'].includes(normalized)) return 'Yes';
  if (['no', 'n', 'false', 'not played'].includes(normalized)) return 'No';
  return null;
}

/**
 * Tribes are stored as "Dbugu (Blue)" but nobody writes that in a recap, so a bare tribe name is
 * matched against the label's leading word.
 */
function resolveTribe(value: string, tribeLabels: string[]): string | null {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  const exact = tribeLabels.find((label) => label.toLowerCase() === needle);
  if (exact) return exact;
  const byPrefix = tribeLabels.filter((label) => label.toLowerCase().startsWith(`${needle} `));
  return byPrefix.length === 1 ? byPrefix[0] : null;
}

export interface ParseRecapInput {
  castaways: CastawayName[];
  tribeLabels: string[];
}

export function parseRecapText(text: string, input: ParseRecapInput): ParsedRecap {
  const { castaways, tribeLabels } = input;

  const answerKey: Partial<Record<ScoringKey, string[]>> = {};
  const unrecognizedLabels: string[] = [];
  const unmatchedValues: { label: string; value: string }[] = [];
  const ignoredLines: string[] = [];
  let explicitEliminated: string[] | null = null;

  const add = (key: ScoringKey, value: string) => {
    const list = (answerKey[key] ??= []);
    if (!list.includes(value)) list.push(value);
  };

  for (const rawLine of text.split(/\r?\n/)) {
    // Bullets and numbering are stripped so a pasted list parses the same as plain lines.
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (!line) continue;
    // `#` comments out a line. Without this a line like "# Season winner: Ada" would still parse,
    // since the label matcher strips punctuation before matching.
    if (line.startsWith('#')) continue;

    const at = line.indexOf(':');
    if (at === -1) {
      ignoredLines.push(line);
      continue;
    }

    const label = line.slice(0, at).trim();
    const rest = line.slice(at + 1).trim();

    const key = keyForLabel(label);
    if (!key) {
      unrecognizedLabels.push(label);
      continue;
    }

    // "Voted out: none" is meaningful — it says the bucket is deliberately empty, not missing.
    if (!rest || NOTHING.test(rest)) {
      if (key !== 'eliminated') answerKey[key] ??= [];
      else explicitEliminated = [];
      continue;
    }

    if (key === 'eliminated') {
      explicitEliminated ??= [];
      for (const value of splitValues(rest)) {
        const resolved = resolveCastawayName(value, castaways);
        if (resolved) {
          if (!explicitEliminated.includes(resolved)) explicitEliminated.push(resolved);
        } else {
          unmatchedValues.push({ label, value });
        }
      }
      continue;
    }

    // The bucket is created as soon as the label is understood, even if nothing in it resolves.
    // "voted_out: (nothing)" tells the admin the line was read and came to nothing, which is a
    // different problem from the line being ignored outright.
    answerKey[key] ??= [];

    if (YES_NO_KEYS.has(key)) {
      const yesNo = toYesNo(rest);
      if (yesNo) add(key, yesNo);
      else unmatchedValues.push({ label, value: rest });
      continue;
    }

    for (const value of splitValues(rest)) {
      const resolved = CASTAWAY_KEYS.has(key)
        ? resolveCastawayName(value, castaways)
        : resolveTribe(value, tribeLabels);
      if (resolved) add(key, resolved);
      else unmatchedValues.push({ label, value });
    }
  }

  return {
    answerKey,
    // Who went home is almost always who was voted out; an explicit line wins when they differ,
    // which is how a medical evacuation or a quit gets recorded.
    eliminated: explicitEliminated ?? [...(answerKey.voted_out ?? [])],
    unrecognizedLabels,
    unmatchedValues,
    ignoredLines,
  };
}

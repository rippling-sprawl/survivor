import type { Castaway } from '@/lib/types';

export type TribeBadgeTribes = Pick<
  Castaway,
  'originalTribe' | 'originalTribeColor' | 'premergeTribe' | 'premergeTribeColor'
>;

/**
 * Starting tribe on the left half, last pre-merge tribe on the right — one solid colour if they
 * never moved. The merged tribe is deliberately left out: after the merge this shows where
 * everyone came from.
 *
 * Drawn as two SVG half-discs rather than a CSS gradient, so the split sits exactly in the middle
 * at any size instead of landing on a fractional pixel.
 */
export function TribeBadge({ tribes }: { tribes: TribeBadgeTribes }) {
  const { originalTribe, originalTribeColor, premergeTribe, premergeTribeColor } = tribes;
  if (!originalTribeColor || !premergeTribeColor) return null;
  const title =
    originalTribe && originalTribe !== premergeTribe
      ? `${originalTribe} → ${premergeTribe}`
      : premergeTribe;
  return (
    <svg className="cast-grid__badge" viewBox="0 0 2 2" role="img" aria-label={title ?? undefined}>
      {title && <title>{title}</title>}
      <path d="M1 0a1 1 0 0 0 0 2z" fill={originalTribeColor} />
      <path d="M1 0a1 1 0 0 1 0 2z" fill={premergeTribeColor} />
    </svg>
  );
}

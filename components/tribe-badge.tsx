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
 * Two equal flex halves clipped by one rounded box, so there is a single smoothed edge and the
 * split stays in the middle.
 */
export function TribeBadge({ tribes }: { tribes: TribeBadgeTribes }) {
  const { originalTribe, originalTribeColor, premergeTribe, premergeTribeColor } = tribes;
  if (!originalTribeColor || !premergeTribeColor) return null;
  const title =
    originalTribe && originalTribe !== premergeTribe
      ? `${originalTribe} → ${premergeTribe}`
      : premergeTribe;
  return (
    <span className="cast-grid__badge" role="img" aria-label={title ?? undefined} title={title ?? undefined}>
      <span style={{ background: originalTribeColor }} />
      <span style={{ background: premergeTribeColor }} />
    </span>
  );
}

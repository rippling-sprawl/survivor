import { getEpisode, getEpisodeForm, updateEpisode } from '@/lib/db';
import { fail, handleError, ok } from '@/lib/api';
import type { EpisodeStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The approval workflow. Statuses move draft -> approved -> open -> locked -> scored, and the
 * guards here exist because the failure modes are all embarrassing in public: an empty form going
 * live, or picks reopening after the episode aired.
 */
const ALLOWED_NEXT: Record<EpisodeStatus, EpisodeStatus[]> = {
  draft: ['approved'],
  approved: ['open', 'draft'],
  open: ['locked', 'approved'],
  locked: ['scored', 'open'],
  scored: ['locked'],
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { status } = (await request.json()) as { status?: EpisodeStatus };
    if (!status) return fail('A status is required.');

    const episode = await getEpisode(id);
    if (!episode) return fail('No such episode.', 404);

    if (!ALLOWED_NEXT[episode.status]?.includes(status)) {
      return fail(`Cannot go from ${episode.status} to ${status}.`, 409);
    }

    if (status === 'approved') {
      const form = await getEpisodeForm(id);
      if (!form || form.questions.length === 0) {
        return fail('This form has no questions yet.', 409);
      }
      const unpriced = form.questions.filter((q) => q.points <= 0);
      if (unpriced.length > 0) {
        return fail(
          `These questions are worth zero points: ${unpriced.map((q) => q.prompt).join(', ')}`,
          409,
        );
      }
    }

    return ok({ episode: await updateEpisode(id, { status }) });
  } catch (error) {
    return handleError('POST /api/admin/episodes/[id]/status', error);
  }
}

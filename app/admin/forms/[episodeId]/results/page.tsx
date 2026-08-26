import { AdminNav } from '../../../admin-nav';
import { ResultsEditor } from './results-editor';

export const dynamic = 'force-dynamic';

export default async function AdminResultsPage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  return (
    <div className="page stack">
      <AdminNav />
      <ResultsEditor episodeId={episodeId} />
    </div>
  );
}

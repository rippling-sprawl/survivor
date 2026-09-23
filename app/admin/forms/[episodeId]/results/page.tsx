import { AdminNav } from '../../../admin-nav';
import { isDebugEnvironment } from '@/lib/debug/config';
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
      <AdminNav debugEnabled={isDebugEnvironment()} />
      <ResultsEditor episodeId={episodeId} />
    </div>
  );
}

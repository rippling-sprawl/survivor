import { AdminNav } from '../../admin-nav';
import { isDebugEnvironment } from '@/lib/debug/config';
import { FormEditor } from './form-editor';

export const dynamic = 'force-dynamic';

export default async function AdminEpisodePage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  return (
    <div className="page stack">
      <AdminNav debugEnabled={isDebugEnvironment()} />
      <FormEditor episodeId={episodeId} />
    </div>
  );
}

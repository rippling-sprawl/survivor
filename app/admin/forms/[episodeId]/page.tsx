import { AdminNav } from '../../admin-nav';
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
      <AdminNav />
      <FormEditor episodeId={episodeId} />
    </div>
  );
}

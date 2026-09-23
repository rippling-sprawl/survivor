import { AdminNav } from '../admin-nav';
import { isDebugEnvironment } from '@/lib/debug/config';
import { SeasonsManager } from './seasons-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Seasons · Survivor Pick'em" };

export default function AdminSeasonsPage() {
  return (
    <div className="page stack">
      <AdminNav debugEnabled={isDebugEnvironment()} />
      <h1>Seasons</h1>
      <SeasonsManager />
    </div>
  );
}

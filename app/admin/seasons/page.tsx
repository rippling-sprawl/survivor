import { AdminNav } from '../admin-nav';
import { SeasonsManager } from './seasons-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Seasons · Survivor Pick'em" };

export default function AdminSeasonsPage() {
  return (
    <div className="page stack">
      <AdminNav />
      <h1>Seasons</h1>
      <SeasonsManager />
    </div>
  );
}

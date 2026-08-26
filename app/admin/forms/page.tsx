import { AdminNav } from '../admin-nav';
import { FormsManager } from './forms-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Manage forms · Survivor Pick'em" };

export default function AdminFormsPage() {
  return (
    <div className="page stack">
      <AdminNav />
      <h1>Manage forms</h1>
      <FormsManager />
    </div>
  );
}

import { publicUser, userRepo } from '@/lib/server/db';
import { eventRepo, NO_STATS } from '@/lib/server/events';
import { requireAdmin } from '@/lib/server/session';
import SessionGuard from '@/components/SessionGuard';
import AdminConsole from './AdminConsole';

export default async function AdminPage() {
  const admin = await requireAdmin();
  const stats = await eventRepo.statsByOwner();
  const users = (await userRepo.list()).filter((u) => u.role === 'user').map((u) => publicUser(u, stats[u.id] ?? NO_STATS));
  return (
    <>
      <SessionGuard />
      <AdminConsole initialUsers={users} me={{ name: admin.name, email: admin.email }} />
    </>
  );
}

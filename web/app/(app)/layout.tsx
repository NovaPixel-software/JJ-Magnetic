import SessionGuard from '@/components/SessionGuard';
import TopNav from '@/components/TopNav';
import { requireUser } from '@/lib/server/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <SessionGuard />
      <TopNav user={{ name: user.name, email: user.email }} />
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-gutter-mobile py-space-lg md:px-margin">{children}</main>
    </div>
  );
}

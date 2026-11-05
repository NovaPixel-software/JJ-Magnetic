import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/server/session';
import LoginShell from '@/components/LoginShell';

const NOTICES: Record<string, string> = {
  idle: 'You were signed out because you were not active for a while. Please sign in again.',
  ended: 'You were signed out. Your account may have been signed in on another device, or you were away too long.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const me = await getSession();
  if (me) redirect(homeFor(me.role));
  const { reason } = await searchParams;
  return <LoginShell notice={reason ? NOTICES[reason] : undefined} />;
}

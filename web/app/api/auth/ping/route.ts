import { NextResponse } from 'next/server';
import { userRepo } from '@/lib/server/db';
import { getSession } from '@/lib/server/session';

// The browser calls this about once a minute while the person is using the app. It is what keeps the session from
// ending for inactivity, and a 401 tells the browser the session is over (idle too long, or signed in on another device).
export async function POST() {
  const me = await getSession();
  if (!me) return NextResponse.json({ message: 'Signed out.' }, { status: 401 });
  await userRepo.update(me.id, { lastSeenAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}

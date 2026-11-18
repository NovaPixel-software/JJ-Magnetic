import { NextResponse } from 'next/server';
import { userRepo } from '@/lib/server/db';
import { readSession, SESSION_COOKIE } from '@/lib/server/session';

export async function POST() {
  // Signing out gives the device's place back, so it does not count against the user's device limit any more.
  // The cookie is cleared whatever happens here.
  try {
    const me = await readSession();
    if (me?.sid && me.user.role === 'user') await userRepo.removeSession(me.user.id, me.sid);
  } catch (e) {
    console.error('Could not remove the session on sign-out', e);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

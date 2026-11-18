import { NextResponse } from 'next/server';
import { userRepo } from '@/lib/server/db';
import { readSession } from '@/lib/server/session';

// The browser calls this about once a minute while the person is using the app. It is what keeps this device's session
// from ending for inactivity, and a 401 tells the browser the session is over (idle too long, or pushed out by a
// sign-in on another device once the user's device limit was reached).
export async function POST() {
  const me = await readSession();
  if (!me) return NextResponse.json({ message: 'Signed out.' }, { status: 401 });
  await userRepo.touchSession(me.user.id, me.sid, new Date().toISOString());
  return NextResponse.json({ ok: true });
}

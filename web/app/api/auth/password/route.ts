import { NextResponse } from 'next/server';
import { userRepo, verifyPassword } from '@/lib/server/db';
import { cookieOptions, createSessionToken, getSession, newSessionId, SESSION_COOKIE } from '@/lib/server/session';

// A signed-in user (or admin) changes their own password. They must know the current one.
export async function POST(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const current = String(body?.current ?? '');
  const next = String(body?.next ?? '');

  if (!verifyPassword(current, me.passwordHash)) return NextResponse.json({ message: 'Current password is incorrect.' }, { status: 400 });
  if (next.length < 8) return NextResponse.json({ message: 'New password must be at least 8 characters.' }, { status: 400 });
  if (next === current) return NextResponse.json({ message: 'New password must be different from the current one.' }, { status: 400 });

  // A new password signs out every other device. This one gets a fresh session so it stays signed in.
  const sid = newSessionId();
  await userRepo.update(me.id, { password: next, sessionId: sid });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(me.id, sid), cookieOptions());
  return res;
}

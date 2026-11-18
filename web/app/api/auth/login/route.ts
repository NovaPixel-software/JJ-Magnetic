import { NextResponse } from 'next/server';
import { maxDevicesOf, publicUser, sessionsOf, userRepo, verifyPassword } from '@/lib/server/db';
import { formatIsoDate, isExpired } from '@/lib/server/expiry';
import { SUPPORT_EMAIL } from '@/lib/support';
import { cookieOptions, createSessionToken, homeFor, newSessionId, SESSION_COOKIE } from '@/lib/server/session';

// One sign-in for everyone. The account's role decides where they land.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? '').trim();
  const password = String(body?.password ?? '');

  if (!email || !password) return NextResponse.json({ code: 'MISSING', message: 'Enter your email and password.' }, { status: 400 });

  const user = await userRepo.getByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ code: 'INVALID', message: 'Incorrect email or password.' }, { status: 401 });
  }
  if (user.status !== 'active') {
    return NextResponse.json({ code: 'INACTIVE', message: `Your account is inactive. Contact ${SUPPORT_EMAIL}.` }, { status: 403 });
  }

  if (isExpired(user)) {
    return NextResponse.json({ code: 'EXPIRED', message: `Your account expired on ${formatIsoDate(user.expiresAt!)}. Contact ${SUPPORT_EMAIL}.` }, { status: 403 });
  }

  const sid = newSessionId();
  const now = new Date().toISOString();
  if (user.role === 'user') {
    // An account from before the device list has one signed-in device that is not in a list yet. It is written
    // down first, so it is counted like any other instead of being dropped by this sign-in.
    if (!user.sessions && user.sessionId) await userRepo.update(user.id, { sessions: sessionsOf(user) });
    // This device joins the list. Over the user's limit, the device unused the longest is signed out.
    await userRepo.addSession(user.id, { sid, seenAt: now, createdAt: now }, maxDevicesOf(user));
  } else {
    await userRepo.update(user.id, { lastLogin: now, lastSeenAt: now, sessionId: sid });
  }

  const res = NextResponse.json({ user: publicUser(user), redirectTo: homeFor(user.role) });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id, sid), cookieOptions());
  return res;
}

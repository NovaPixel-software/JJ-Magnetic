import { NextResponse } from 'next/server';
import { DEFAULT_MAX_DEVICES, MAX_DEVICES_LIMIT, parseMaxDevices, parsePhone, publicUser, userRepo } from '@/lib/server/db';
import { eventRepo, NO_STATS } from '@/lib/server/events';
import { addMonthsIso, isIsoDate, todayIso } from '@/lib/server/expiry';
import { getSession } from '@/lib/server/session';

async function adminOnly() {
  const me = await getSession();
  return me?.role === 'admin' ? null : NextResponse.json({ message: me ? 'Admins only.' : 'Not signed in.' }, { status: me ? 403 : 401 });
}

export async function GET() {
  const denied = await adminOnly();
  if (denied) return denied;
  const users = (await userRepo.list()).filter((u) => u.role === 'user');
  const stats = await eventRepo.statsByOwner();
  return NextResponse.json({ users: users.map((u) => publicUser(u, stats[u.id] ?? NO_STATS)) });
}

// Only an admin can create users, and they are always plain users (never admins).
export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  // The account works through this date. When the admin does not pick one it is a year from today.
  const expiresAt = body?.expiresAt == null || body.expiresAt === '' ? addMonthsIso(todayIso(), 12) : body.expiresAt;

  if (!name || !email.includes('@')) return NextResponse.json({ message: 'Name and a valid email are required.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
  // The phone number is optional.
  const phone = body?.phone == null ? '' : parsePhone(body.phone);
  if (phone === null) return NextResponse.json({ message: 'Enter a valid phone number, or leave it empty.' }, { status: 400 });
  if (!isIsoDate(expiresAt)) return NextResponse.json({ message: 'Choose a valid expiry date.' }, { status: 400 });
  if (expiresAt < todayIso()) return NextResponse.json({ message: 'The expiry date must be today or later.' }, { status: 400 });
  // How many devices the user may be signed in on at once. One, unless the admin says more.
  const maxDevices = body?.maxDevices == null || body.maxDevices === '' ? DEFAULT_MAX_DEVICES : parseMaxDevices(body.maxDevices);
  if (maxDevices === null) return NextResponse.json({ message: `Devices allowed must be a whole number from 1 to ${MAX_DEVICES_LIMIT}.` }, { status: 400 });
  if (await userRepo.getByEmail(email)) return NextResponse.json({ message: 'A user with this email already exists.' }, { status: 409 });

  const user = await userRepo.create({ name, email, password, role: 'user', status: 'active', expiresAt, maxDevices, ...(phone ? { phone } : {}) });
  return NextResponse.json({ user: publicUser(user, NO_STATS) }, { status: 201 });
}

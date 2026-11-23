import { NextResponse } from 'next/server';
import { MAX_DEVICES_LIMIT, parseMaxDevices, parsePhone, publicUser, sessionsOf, userRepo } from '@/lib/server/db';
import { eventRepo, NO_STATS } from '@/lib/server/events';
import { isIsoDate } from '@/lib/server/expiry';
import { getSession } from '@/lib/server/session';

type Ctx = { params: Promise<{ id: string }> };

// Admin edits a user: name, email, phone number, expiry date, active/inactive, how many devices, or a new password.
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await getSession();
  if (!me) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 });
  if (me.role !== 'admin') return NextResponse.json({ message: 'Admins only.' }, { status: 403 });

  const { id } = await params;
  const user = await userRepo.get(id);
  if (!user || user.role !== 'user') return NextResponse.json({ message: 'User not found.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Parameters<typeof userRepo.update>[1] = {};

  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();

  if (typeof body.email === 'string') {
    const email = body.email.trim().toLowerCase();
    if (!email.includes('@')) return NextResponse.json({ message: 'Enter a valid email.' }, { status: 400 });
    if (email !== user.email) {
      const taken = await userRepo.getByEmail(email);
      if (taken && taken.id !== user.id) return NextResponse.json({ message: 'Another user already has this email.' }, { status: 409 });
      patch.email = email;
    }
  }

  // An empty phone number removes the one on the account.
  if (body.phone !== undefined) {
    const phone = parsePhone(body.phone);
    if (phone === null) return NextResponse.json({ message: 'Enter a valid phone number, or leave it empty.' }, { status: 400 });
    patch.phone = phone;
  }

  if (body.status === 'active' || body.status === 'inactive') patch.status = body.status;

  // Any valid date is allowed, including a past one, so an admin can end an account right now.
  if (body.expiresAt !== undefined) {
    if (!isIsoDate(body.expiresAt)) return NextResponse.json({ message: 'Choose a valid expiry date.' }, { status: 400 });
    patch.expiresAt = body.expiresAt;
  }

  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 8) return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
    patch.password = body.password;
    // a new password from the admin signs that person out on every device
    patch.sessionId = null;
    patch.sessions = [];
  }

  // How many devices the user may be signed in on at once. Lowering it signs out the devices unused the longest.
  if (body.maxDevices !== undefined) {
    const max = parseMaxDevices(body.maxDevices);
    if (max === null) return NextResponse.json({ message: `Devices allowed must be a whole number from 1 to ${MAX_DEVICES_LIMIT}.` }, { status: 400 });
    patch.maxDevices = max;
    // An account from before the device list keeps its one signed-in device when the number changes.
    if (!user.sessions && user.sessionId && !patch.sessions) patch.sessions = sessionsOf(user);
  }

  try {
    const updated = await userRepo.update(id, patch);
    const stats = (await eventRepo.statsByOwner(id))[id] ?? NO_STATS;
    return NextResponse.json({ user: updated ? publicUser(updated, stats) : null });
  } catch (e) {
    // Two admins saving the same email at once: the database's unique index lets only one through.
    if ((e as { code?: number }).code === 11000) return NextResponse.json({ message: 'Another user already has this email.' }, { status: 409 });
    throw e;
  }
}

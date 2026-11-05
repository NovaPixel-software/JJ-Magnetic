import { NextResponse } from 'next/server';
import { publicUser, userRepo } from '@/lib/server/db';
import { eventRepo, NO_STATS } from '@/lib/server/events';
import { isIsoDate } from '@/lib/server/expiry';
import { getSession } from '@/lib/server/session';

type Ctx = { params: Promise<{ id: string }> };

// Admin edits a user: name, email, expiry date, active/inactive, or a new password.
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

  if (body.status === 'active' || body.status === 'inactive') patch.status = body.status;

  // Any valid date is allowed, including a past one, so an admin can end an account right now.
  if (body.expiresAt !== undefined) {
    if (!isIsoDate(body.expiresAt)) return NextResponse.json({ message: 'Choose a valid expiry date.' }, { status: 400 });
    patch.expiresAt = body.expiresAt;
  }

  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 8) return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
    patch.password = body.password;
    patch.sessionId = null; // a new password from the admin signs that person out everywhere
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

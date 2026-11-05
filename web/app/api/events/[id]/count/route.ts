import { NextResponse } from 'next/server';
import { activityRepo } from '@/lib/server/activity';
import { eventRepo, publicEvent } from '@/lib/server/events';
import { getSession } from '@/lib/server/session';

type Ctx = { params: Promise<{ id: string }> };

const whole = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null);

// Adds one to the event's download or print counter and writes it in the activity log. Only the event's owner can.
// The body may also say the file type, the DPI and how many photos were on the sheet, which go in the log.
export async function POST(req: Request, { params }: Ctx) {
  const me = await getSession();
  if (!me) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 });

  const { id } = await params;
  const event = await eventRepo.get(id);
  if (!event || event.ownerId !== me.id) return NextResponse.json({ message: 'Event not found.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const kind = body?.kind === 'download' ? 'downloads' : body?.kind === 'print' ? 'prints' : null;
  if (!kind) return NextResponse.json({ message: 'kind must be "download" or "print".' }, { status: 400 });

  const updated = await eventRepo.increment(id, kind);
  if (updated) {
    // A failed log write must not fail the download the user already has, the counter is already up.
    await activityRepo
      .add({
        ownerId: me.id,
        eventId: id,
        eventName: updated.name,
        kind: body.kind,
        format: body.format === 'pdf' ? 'pdf' : body.format === 'jpeg' ? 'jpeg' : null,
        dpi: whole(body.dpi, 50, 2400),
        photos: whole(body.photos, 0, 500),
      })
      .catch((e) => console.error('Could not write the activity log', e));
  }
  return NextResponse.json({ event: updated ? publicEvent(updated) : null });
}

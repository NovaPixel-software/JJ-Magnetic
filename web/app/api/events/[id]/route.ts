import { NextResponse } from 'next/server';
import { DEFAULT_PRODUCT_ID, paperOptionsFor, templatesForShape } from '@/lib/catalog';
import { eventRepo, publicEvent } from '@/lib/server/events';
import { getSession } from '@/lib/server/session';

type Ctx = { params: Promise<{ id: string }> };

// The owner chooses (or changes) the event's setup: product, shape, template size and paper.
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await getSession();
  if (!me) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 });

  const { id } = await params;
  const event = await eventRepo.get(id);
  if (!event || event.ownerId !== me.id) return NextResponse.json({ message: 'Event not found.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const productId = DEFAULT_PRODUCT_ID; // there is no product choice any more
  const shapeId = String(body?.shapeId ?? '');
  const templateId = String(body?.templateId ?? '');
  const paperId = String(body?.paperId ?? '');

  // Only what the setup form offers is accepted: a listed shape, size, and a paper that suits that shape.
  const template = templatesForShape(shapeId).find((t) => t.id === templateId);
  if (!template || !paperOptionsFor(shapeId).some((p) => p.id === paperId)) {
    return NextResponse.json({ message: 'Invalid product, shape, size or paper.' }, { status: 400 });
  }

  const updated = await eventRepo.setSetup(id, { productId, shapeId, templateId, paperId });
  return NextResponse.json({ event: updated ? publicEvent(updated) : null });
}


// The owner deletes an event. It leaves their list, but the record and its downloads and prints are kept, so the
// totals (the owner's own and the ones the admin sees) do not go down.
export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await getSession();
  if (!me) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 });
  if (me.role !== 'user') return NextResponse.json({ message: 'Only users have events.' }, { status: 403 });

  const { id } = await params;
  // the owner is part of the delete itself, so another user's event is simply "not found"
  if (!(await eventRepo.delete(id, me.id))) return NextResponse.json({ message: 'Event not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

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


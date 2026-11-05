'use client';

import { useMemo, useState } from 'react';
import Dropdown from '@/components/Dropdown';
import SheetPreview from '@/components/SheetPreview';
import { Icon, Spinner } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { cutText, DEFAULT_PRODUCT_ID, getShape, getTemplate, offeredShapes, paperOptionsFor, sizeText, templatesForShape, type Paper, type Template } from '@/lib/catalog';
import { computeLayout } from '@/lib/layout';
import type { PublicEvent } from '@/lib/server/events';

const Label = ({ n, children, htmlFor }: { n: number; children: React.ReactNode; htmlFor: string }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-label-lg text-navy">
    {n}. {children} <span className="text-primary-container">*</span>
  </label>
);

// A new event starts on the first shape (Round) and that shape's first size and paper.
const SHAPES = offeredShapes();
const DEFAULT_SHAPE = SHAPES[0].id;
const DEFAULT_TEMPLATE = templatesForShape(DEFAULT_SHAPE)[0].id;
const DEFAULT_PAPER = paperOptionsFor(DEFAULT_SHAPE)[0].id;

export default function SetupForm({ event, onSaved, onCancel }: { event: PublicEvent; onSaved: (e: PublicEvent) => void; onCancel?: () => void }) {
  // An event set up before these choices existed may point at something no longer offered. It starts from the defaults then.
  const s0 = event.setup;
  const first =
    s0 &&
    SHAPES.some((s) => s.id === s0.shapeId) &&
    templatesForShape(s0.shapeId).some((t) => t.id === s0.templateId) &&
    paperOptionsFor(s0.shapeId).some((p) => p.id === s0.paperId)
      ? s0
      : null;
  const [shapeId, setShapeId] = useState(first?.shapeId ?? DEFAULT_SHAPE);
  const [templateId, setTemplateId] = useState(first?.templateId ?? DEFAULT_TEMPLATE);
  const [paperId, setPaperId] = useState(first?.paperId ?? DEFAULT_PAPER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const templates = useMemo(() => templatesForShape(shapeId), [shapeId]);
  const papers = useMemo(() => paperOptionsFor(shapeId), [shapeId]);
  const paper = papers.find((p) => p.id === paperId) ?? papers[0]; // the choice that is on screen, even right after the list changed
  const template = getTemplate(templateId)!;
  const shape = getShape(shapeId)!;

  const layout = useMemo(() => computeLayout(paper, 'portrait', template), [paper, template]);
  const yieldFor = (t: Template, p: Paper = paper) => computeLayout(p, 'portrait', t).count;
  const fits = layout.count > 0;

  const pickShape = (id: string) => {
    setShapeId(id);
    setTemplateId(templatesForShape(id)[0].id);
  };

  const save = async () => {
    if (!fits || busy) return;
    setBusy(true);
    setError('');
    try {
      const { event: updated } = await api.setupEvent(event.id, { productId: DEFAULT_PRODUCT_ID, shapeId, templateId, paperId: paper.id });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.');
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-space-lg lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm sm:p-6">
        <h2 className="text-headline-md text-navy">Event setup</h2>
        <p className="mt-1 text-body-lg text-secondary">Choose what you are printing. Then you can add photos.</p>

        <div className="mt-space-lg space-y-space-md">
          <div>
            <div>
              <Label n={1} htmlFor="shape">Photo Shape</Label>
              <Dropdown id="shape" value={shapeId} onChange={pickShape} icon={shape.icon} options={SHAPES.map((s) => ({ value: s.id, label: s.label }))} />
            </div>
          </div>

          <div>
            <Label n={2} htmlFor="template">Template / Overlay Size</Label>
            <Dropdown id="template" value={templateId} onChange={setTemplateId} options={templates.map((t) => ({ value: t.id, label: `${t.label} · ${yieldFor(t)} per sheet` }))} />
          </div>

          <div>
            <Label n={3} htmlFor="paper">Paper Size</Label>
            <Dropdown id="paper" value={paper.id} onChange={setPaperId} options={papers.map((p) => ({ value: p.id, label: `${p.label} · ${yieldFor(template, p)} per sheet` }))} />
          </div>

          <div className={`flex items-center gap-3 rounded-xl p-space-md ${fits ? 'bg-surface-container-low' : 'border border-error-container bg-error-container/40'}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${fits ? 'bg-primary-fixed text-primary' : 'bg-error-container text-error'}`}>
              <Icon name={fits ? 'grid_view' : 'warning'} />
            </span>
            <div>
              <p className="text-label-lg text-navy">
                {fits ? `${layout.count} ${layout.count === 1 ? 'photo fits' : 'photos fit'} on ${paper.label.split(' ')[0]}` : 'This size does not fit on the chosen paper'}
              </p>
              <p className="text-body-md text-secondary">{fits
                  ? template.cutW
                    ? `Photo ${template.wmm === template.hmm ? `${template.wmm} mm` : `${template.wmm}×${template.hmm} mm`} inside a ${cutText(template)} cut outline · ${template.gapXmm} mm across, ${template.gapYmm} mm down between pieces`
                    : '10 mm printer-safe margin · 4 mm die-cut gap'
                  : 'Choose a larger paper or a smaller template.'}</p>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-space-md rounded-lg bg-error-container/50 px-3 py-2 text-body-md text-on-error-container">
            {error}
          </p>
        )}

        <div className="mt-space-lg flex flex-wrap items-center justify-end gap-3">
          {onCancel && (
            <button type="button" onClick={onCancel} className="h-11 rounded-lg px-5 text-label-lg text-secondary hover:bg-surface-container">
              Cancel
            </button>
          )}
          <button
            onClick={save}
            disabled={busy || !fits}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary-container px-6 text-label-lg text-white shadow-lg shadow-primary-container/30 transition hover:bg-[#b3205a] active:bg-[#8f1d3f] disabled:opacity-50"
          >
            {busy && <Spinner className="h-4 w-4" />} {first ? 'Save setup' : 'Save & continue to photos'} {!busy && <Icon name="arrow_forward" />}
          </button>
        </div>
      </section>

      <aside className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm">
        <div className="mb-space-md flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-headline-md text-navy">
            <Icon name="layers" className="text-primary-container" /> Live Sheet Preview
          </h2>
          <span className="rounded-full bg-surface-container px-3 py-1 text-label-md text-on-secondary-container">{paper.label.split(' ')[0]} · 300 DPI</span>
        </div>
        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="mx-auto" style={{ maxWidth: 330 }}>
            <SheetPreview layout={layout} clip={shape.clip} />
          </div>
          <p className="mt-3 text-center text-label-sm uppercase tracking-wider text-secondary">
            {layout.pageW} × {layout.pageH} mm · {layout.pxW} × {layout.pxH} px
          </p>
        </div>
        <p className="mt-space-md text-body-md text-secondary">
          {shape.label.replace(/ \(.*\)/, '')} · {sizeText(template)}
        </p>
      </aside>
    </div>
  );
}

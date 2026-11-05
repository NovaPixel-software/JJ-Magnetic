'use client';

import { useEffect, useState, type CSSProperties } from 'react';

/** The soft, romantic backdrop of the sign-in page: gold rings, glows, twinkles and slowly rising hearts. */

const COLORS = ['#ffffff', '#ffe3e7', '#ffc2cc', '#f59aa8', '#e5788a', '#f6d2b4'];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const vars = (v: Record<string, string | number>) => v as CSSProperties;

interface Heart { left: number; s: number; c: string; t: number; dl: number; w: number; o: number }
interface Spark { left: number; top: number; s: number; d: number; dl: number }

export default function LoveBackground() {
  // Random positions are made after the page loads, so the server and the browser never disagree about them.
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);

  useEffect(() => {
    const n = innerWidth < 600 ? 14 : 26;
    setHearts(Array.from({ length: n }, () => ({ left: rnd(0, 98), s: rnd(14, 46), c: COLORS[Math.floor(rnd(0, COLORS.length))], t: rnd(13, 26), dl: -rnd(0, 26), w: rnd(3, 6), o: rnd(0.35, 0.8) })));
    setSparks(Array.from({ length: 22 }, () => ({ left: rnd(2, 96), top: rnd(3, 94), s: rnd(8, 16), d: rnd(2.2, 4.5), dl: -rnd(0, 4) })));
  }, []);

  return (
    <div className="love-bg" aria-hidden>
      <i className="love-ring" style={{ width: 760, height: 760 }} />
      <i className="love-ring" style={{ width: 960, height: 960, borderColor: 'rgba(212,160,122,.25)' }} />
      <i className="love-ring hidden sm:block" style={{ width: 1200, height: 1200, borderColor: 'rgba(212,160,122,.16)' }} />
      <i className="love-glow" style={{ width: 300, height: 300, left: -80, top: '8%', ...vars({ '--d': '10s' }) }} />
      <i className="love-glow" style={{ width: 220, height: 220, right: '6%', top: '6%', ...vars({ '--d': '8s', '--dl': '-3s' }) }} />
      <i className="love-glow" style={{ width: 380, height: 380, right: -120, bottom: '2%', ...vars({ '--d': '11s', '--dl': '-5s' }) }} />
      <i className="love-glow" style={{ width: 160, height: 160, left: '12%', bottom: '6%', ...vars({ '--d': '7s', '--dl': '-2s' }) }} />

      {sparks.map((p, i) => (
        <i key={i} className="love-spark" style={{ left: `${p.left}%`, top: `${p.top}%`, ...vars({ '--s': `${p.s}px`, '--d': `${p.d}s`, '--dl': `${p.dl}s` }) }} />
      ))}
      {hearts.map((h, i) => (
        <span key={i} className="love-heart" style={{ left: `${h.left}%`, ...(h.s > 36 ? { filter: 'blur(2px)' } : {}), ...vars({ '--s': `${h.s}px`, '--c': h.c, '--t': `${h.t}s`, '--dl': `${h.dl}s`, '--w': `${h.w}s`, '--o': h.o }) }}>
          <svg viewBox="0 0 24 24">
            <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.1 0 3.9 1.2 5.6 3.4 1.700-2.200 3.500-3.400 5.600-3.400 3.700 0 5.500 3.900 4 7.300C19.500 16.400 12 21 12 21Z" />
          </svg>
        </span>
      ))}
    </div>
  );
}

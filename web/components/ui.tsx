'use client';

export function Icon({ name, className = '', fill = false }: { name: string; className?: string; fill?: boolean }) {
  return (
    <span aria-hidden className={`material-symbols-outlined ${fill ? 'icon-fill' : ''} ${className}`}>
      {name}
    </span>
  );
}

export const BRAND_NAME = 'JJ Magnetic Memories';

/** The full round logo (JJ, magnet, name and tagline). Needs a big size to read, so it is for the login page. */
// eslint-disable-next-line @next/next/no-img-element
export const Logo = ({ className = 'h-40' }: { className?: string }) => <img src="/jj-logo.png" alt={BRAND_NAME} className={`w-auto object-contain ${className}`} />;

/**
 * The top part of the logo (the JJ with the heart and the magnet) cropped out of the picture, with the name written beside
 * it, for the small spots like the top bar. `size` is its height in px. The crop box is in the logo's own 1254 px coordinates.
 */
export function BrandBar({ size = 40, className = '', dark = false }: { size?: number; className?: string; dark?: boolean }) {
  const W = 1254; // the picture is 1254 x 1254
  const box = { x: 330, y: 150, w: 700, h: 510 }; // where the JJ and magnet are
  const width = (size * box.w) / box.h;
  const scale = width / box.w;
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      {/* on a dark bar the navy J would disappear, so the mark sits on a white chip */}
      <span className={dark ? 'flex shrink-0 items-center justify-center rounded-full bg-white/95 px-3 py-1 shadow-sm shadow-[#7a1a3c]/15' : 'flex shrink-0'}>
        <span
          role="img"
          aria-label={BRAND_NAME}
          className="shrink-0 rounded-md"
          style={{
            width,
            height: size,
            backgroundImage: 'url(/jj-logo.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${W * scale}px ${W * scale}px`,
            backgroundPosition: `${-box.x * scale}px ${-box.y * scale}px`,
          }}
        />
      </span>
      <span className={`hidden whitespace-nowrap font-serif text-[17px] font-semibold italic leading-tight sm:block ${dark ? 'text-white' : 'text-navy'}`}>
        Magnetic <span className={dark ? 'text-[#ffe3ea]' : 'text-primary-container'}>Memories</span>
      </span>
    </span>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function Initials({ name, className = 'h-10 w-10' }: { name: string; className?: string }) {
  const text = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-navy text-label-md text-white ${className}`}>{text}</span>
  );
}

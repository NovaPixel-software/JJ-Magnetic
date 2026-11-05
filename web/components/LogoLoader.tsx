/**
 * The loader: the round JJ logo beating like a heart, with a rose ring turning round it.
 * No hooks, so server pages and `loading.tsx` files can use it. `onDark` is for a dark background (white text).
 */
export default function LogoLoader({
  size = 96,
  label = 'Loading…',
  onDark = false,
  className = '',
}: {
  size?: number;
  label?: string;
  onDark?: boolean;
  className?: string;
}) {
  const ring = Math.max(3, Math.round(size / 24));
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* the track and the turning arc */}
        <span className="absolute inset-0 rounded-full border-solid border-[#ec5b84]/25" style={{ borderWidth: ring }} />
        <span className="absolute inset-0 animate-spin rounded-full border-solid border-transparent border-t-[#d6336c] border-r-[#ec5b84] motion-reduce:animate-none" style={{ borderWidth: ring, animationDuration: '1.1s' }} />
        {/* the logo, beating */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.png"
          alt=""
          className="absolute rounded-full shadow-lg shadow-[#d6336c]/30 motion-reduce:animate-none"
          style={{ inset: ring * 2.2, width: size - ring * 4.4, height: size - ring * 4.4, animation: 'love-beat 1.6s ease-in-out infinite' }}
        />
      </div>
      <p className={`text-label-lg ${onDark ? 'text-white' : 'text-[#8f1d3f]'}`}>{label}</p>
    </div>
  );
}

import type { Metadata, Viewport } from 'next';
import { Caveat, Dancing_Script, Fredoka, Inter, Lobster, Pacifico, Playfair_Display } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
// Fonts for the name labels on photos. They are drawn on a canvas, so each one is exposed as a CSS variable.
const script = Dancing_Script({ subsets: ['latin'], variable: '--font-script', display: 'swap' });
const fun = Pacifico({ subsets: ['latin'], weight: '400', variable: '--font-fun', display: 'swap' });
const serif = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });
const retro = Lobster({ subsets: ['latin'], weight: '400', variable: '--font-retro', display: 'swap' });
const hand = Caveat({ subsets: ['latin'], variable: '--font-hand', display: 'swap' });
const round = Fredoka({ subsets: ['latin'], variable: '--font-round', display: 'swap' });

export const metadata: Metadata = {
  title: 'JJ Magnetic Memories',
  description: 'Personalized magnets and photo sheets, laid out and printed for live events.',
};

export const viewport: Viewport = {
  themeColor: '#14263d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${script.variable} ${fun.variable} ${serif.variable} ${retro.variable} ${hand.variable} ${round.variable}`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="min-h-screen">
        {children}
        <div id="print-root" />
      </body>
    </html>
  );
}

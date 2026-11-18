// The game's type, Barlow Condensed, registered from its files.
//
// On a page of the game's own the stylesheets do this (@font-face, in
// main.ts's imports), so the boot screen has it from the first paint. Inside
// a host whose page rules allow no fonts from a stylesheet (Akeru: no
// font-src) those are refused, and the same files are fetched and
// registered here instead, which the rules do allow.

import w500 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2?url';
import w500i from '@fontsource/barlow-condensed/files/barlow-condensed-latin-500-italic.woff2?url';
import w700i from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-italic.woff2?url';
import w800i from '@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff2?url';

const FACES: ReadonlyArray<{ url: string; weight: string; style: 'normal' | 'italic' }> = [
  { url: w500, weight: '500', style: 'normal' },
  { url: w500i, weight: '500', style: 'italic' },
  { url: w700i, weight: '700', style: 'italic' },
  { url: w800i, weight: '800', style: 'italic' },
];

/** Fetch and register every face. A face that fails is left to the system's font. */
export async function registerFonts(): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  await Promise.all(
    FACES.map(async ({ url, weight, style }) => {
      try {
        const bytes = await (await fetch(url)).arrayBuffer();
        const face = new FontFace('Barlow Condensed', bytes, { weight, style, display: 'swap' });
        await face.load();
        document.fonts.add(face);
      } catch {
        /* the system's font for this face */
      }
    }),
  );
}

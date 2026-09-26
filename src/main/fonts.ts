/** The part of Figma's FontName this module reads. */
export interface FontRef {
  readonly family: string;
  readonly style: string;
}

function keyOf(font: FontRef): string {
  return `${font.family}\u0000${font.style}`;
}

/**
 * Wraps a font loader so each distinct font is loaded once per cache.
 *
 * Apply used to call `figma.loadFontAsync` for every row, even when a thousand
 * rows share one font. One cache per apply run: a font is only recorded once
 * its load succeeded, so a failed load is retried by the next row that needs
 * it rather than remembered as loaded.
 */
export function createFontCache(
  load: (font: FontRef) => Promise<void>
): (fonts: ReadonlyArray<FontRef>) => Promise<void> {
  const loaded = new Set<string>();
  return async (fonts) => {
    const pending = new Map<string, FontRef>();
    for (const font of fonts) {
      const key = keyOf(font);
      if (!loaded.has(key)) pending.set(key, font);
    }
    await Promise.all(
      Array.from(pending, async ([key, font]) => {
        await load(font);
        loaded.add(key);
      })
    );
  };
}

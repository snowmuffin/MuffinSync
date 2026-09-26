import type { TextLayerData } from '../../shared/types';
import { textLength } from './csv';
import { NO_FRAME } from './documents';

export interface TextStats {
  layers: number;
  words: number;
  characters: number;
}

export interface FrameStats extends TextStats {
  frame: string;
}

type Segmenter = { segment(text: string): Iterable<{ isWordLike?: boolean }> };

function makeSegmenter(): Segmenter | null {
  const Ctor = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => Segmenter })
    .Segmenter;
  return Ctor ? new Ctor(undefined, { granularity: 'word' }) : null;
}

/**
 * Words as a reader would count them. `Intl.Segmenter` splits Korean,
 * Japanese and Chinese into words sensibly; without it, whitespace splitting
 * is the fallback (which counts an unspaced CJK run as one word).
 */
export function countWords(text: string, segmenter: Segmenter | null = makeSegmenter()): number {
  if (segmenter) {
    let words = 0;
    for (const part of segmenter.segment(text)) if (part.isWordLike) words++;
    return words;
  }
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function textStats(
  rows: ReadonlyArray<TextLayerData>,
  segmenter: Segmenter | null = makeSegmenter()
): { total: TextStats; byFrame: FrameStats[] } {
  const total: TextStats = { layers: 0, words: 0, characters: 0 };
  const frames = new Map<string, FrameStats>();
  for (const row of rows) {
    const frame = row.frame || NO_FRAME;
    let entry = frames.get(frame);
    if (!entry) {
      entry = { frame, layers: 0, words: 0, characters: 0 };
      frames.set(frame, entry);
    }
    const words = countWords(row.characters, segmenter);
    const characters = textLength(row.characters);
    for (const target of [total, entry]) {
      target.layers++;
      target.words += words;
      target.characters += characters;
    }
  }
  return { total, byFrame: Array.from(frames.values()) };
}

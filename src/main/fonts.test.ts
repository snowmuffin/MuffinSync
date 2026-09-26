import { describe, expect, it } from 'vitest';
import { createFontCache, type FontRef } from './fonts';

const inter: FontRef = { family: 'Inter', style: 'Regular' };
const interBold: FontRef = { family: 'Inter', style: 'Bold' };

function recorder(failFor?: string) {
  const calls: string[] = [];
  const load = async (font: FontRef) => {
    calls.push(`${font.family} ${font.style}`);
    if (font.style === failFor) throw new Error(`cannot load ${font.style}`);
  };
  return { calls, load };
}

describe('createFontCache', () => {
  it('loads a font once however many layers use it', async () => {
    const { calls, load } = recorder();
    const ensure = createFontCache(load);
    await ensure([inter]);
    await ensure([inter]);
    await ensure([{ family: 'Inter', style: 'Regular' }]);
    expect(calls).toEqual(['Inter Regular']);
  });

  it('loads each distinct font a mixed layer uses, once', async () => {
    const { calls, load } = recorder();
    const ensure = createFontCache(load);
    await ensure([inter, interBold, inter]);
    await ensure([interBold]);
    expect(calls).toEqual(['Inter Regular', 'Inter Bold']);
  });

  it('tells apart fonts whose names only look alike when joined', async () => {
    const { calls, load } = recorder();
    const ensure = createFontCache(load);
    await ensure([{ family: 'A B', style: 'C' }, { family: 'A', style: 'B C' }]);
    expect(calls).toHaveLength(2);
  });

  it('does not remember a font whose load failed', async () => {
    const { calls, load } = recorder('Bold');
    const ensure = createFontCache(load);
    await expect(ensure([interBold])).rejects.toThrow('cannot load Bold');
    await expect(ensure([interBold])).rejects.toThrow('cannot load Bold');
    expect(calls).toEqual(['Inter Bold', 'Inter Bold']);
  });

  it('keeps separate caches separate', async () => {
    const { calls, load } = recorder();
    await createFontCache(load)([inter]);
    await createFontCache(load)([inter]);
    expect(calls).toEqual(['Inter Regular', 'Inter Regular']);
  });
});

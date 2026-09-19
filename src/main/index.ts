import type { Scope } from '../shared/types';
import type { MainToUi } from '../shared/messages';
import { unwrapUiMessage } from '../shared/messages';
import { collectTextLayers, type TraversableNode } from './traverse';
import { applyTextChanges, type ApplicableNode } from './apply';

figma.showUI(__html__, { width: 400, height: 500 });

function send(message: MainToUi): void {
  figma.ui.postMessage(message);
}

/** Resolve a scope to the roots a walk starts from. See spec section 3.1. */
function rootsFor(scope: Scope): ReadonlyArray<TraversableNode> {
  const nodes =
    scope === 'selection'
      ? figma.currentPage.selection
      : figma.currentPage.children;
  // SceneNode satisfies TraversableNode structurally; TypeScript cannot see
  // that through the SceneNode union, so state it once here.
  return nodes as unknown as ReadonlyArray<TraversableNode>;
}

/** Load every font a layer uses, including the mixed-font case. */
async function loadFonts(node: ApplicableNode): Promise<void> {
  const textNode = node as unknown as TextNode;
  if (textNode.fontName === figma.mixed) {
    const fonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
    await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
  } else {
    await figma.loadFontAsync(textNode.fontName);
  }
}

figma.ui.onmessage = async (event: unknown) => {
  const message = unwrapUiMessage(event);
  if (!message) return;

  try {
    switch (message.type) {
      case 'extract': {
        const rows = collectTextLayers(rootsFor(message.scope));
        send(rows.length === 0 ? { type: 'no-text-found' } : { type: 'extracted', rows });
        break;
      }
      case 'import': {
        const result = await applyTextChanges(message.rows, {
          getNode: async (id) =>
            (await figma.getNodeByIdAsync(id)) as ApplicableNode | null,
          loadFonts,
        });
        send({ type: 'import-complete', ...result });
        break;
      }
      case 'cancel':
        figma.closePlugin();
        break;
    }
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

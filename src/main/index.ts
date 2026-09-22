import type { Scope } from '../shared/types';
import type { MainToUi } from '../shared/messages';
import { unwrapUiMessage } from '../shared/messages';
import { collectTextLayers, resolveRoots, type TraversableNode } from './traverse';
import { applyTextChanges, type ApplicableNode } from './apply';
import { buildChangeSet } from './plan';

figma.showUI(__html__, { width: 400, height: 500 });

function send(message: MainToUi): void {
  figma.ui.postMessage(message);
}

/**
 * The UI cannot ask Figma what is selected, so the sandbox tells it: once at
 * startup, and again on every change. This only feeds the visible choice in
 * the scope control -- it does not affect what `rootsFor` resolves.
 */
const reportSelection = () =>
  send({ type: 'selection', present: figma.currentPage.selection.length > 0 });

figma.on('selectionchange', reportSelection);
reportSelection();

/**
 * Resolve a scope to the roots a walk starts from. See spec section 3.1.
 *
 * An empty selection falls back to the whole page. The plugin has always
 * behaved this way — selecting nothing and extracting searches the page —
 * and the spec keeps the rule, so scope: 'selection' with an empty selection
 * must not return nothing.
 */
function rootsFor(scope: Scope): ReadonlyArray<TraversableNode> {
  const nodes = resolveRoots(
    scope,
    figma.currentPage.selection,
    figma.currentPage.children
  );
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
        try {
          const rows = collectTextLayers(rootsFor(message.scope));
          send(rows.length === 0 ? { type: 'no-text-found' } : { type: 'extracted', rows });
        } catch (error) {
          throw new Error(
            `Error occurred during text extraction: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'plan-import': {
        try {
          const changeSet = await buildChangeSet(message.rows, {
            getNode: async (id) =>
              (await figma.getNodeByIdAsync(id)) as ApplicableNode | null,
          });
          send({ type: 'change-set', changeSet });
        } catch (error) {
          throw new Error(
            `Error occurred while planning the import: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'apply': {
        try {
          const result = await applyTextChanges(message.changes, {
            getNode: async (id) =>
              (await figma.getNodeByIdAsync(id)) as ApplicableNode | null,
            loadFonts,
          });
          send({ type: 'import-complete', ...result });
        } catch (error) {
          throw new Error(
            `Error occurred during text import: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
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

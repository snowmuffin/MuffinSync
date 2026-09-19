import type { TextLayerData } from '../shared/types';

/**
 * The shape traversal actually needs. Figma's SceneNode satisfies it
 * structurally, and a plain object literal does too — which is what lets
 * this be tested without a Figma runtime.
 */
export interface TraversableNode {
  readonly type: string;
  readonly id: string;
  readonly name: string;
  readonly characters?: string;
  readonly children?: ReadonlyArray<TraversableNode>;
}

export function collectTextLayers(
  roots: ReadonlyArray<TraversableNode>
): TextLayerData[] {
  const found: TextLayerData[] = [];
  for (const root of roots) {
    visit(root, found);
  }
  return found;
}

function visit(node: TraversableNode, found: TextLayerData[]): void {
  if (node.type === 'TEXT') {
    found.push({
      id: node.id,
      name: node.name,
      characters: node.characters ?? '',
    });
  }
  if (node.children) {
    for (const child of node.children) {
      visit(child, found);
    }
  }
}

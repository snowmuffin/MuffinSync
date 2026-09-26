import { isWithin, pageOf } from './traverse';

/** What came of trying to centre a node. See `centreOnNode`. */
export type NavigateResult = 'centred' | 'not-found';

/**
 * Centre a node in the viewport.
 *
 * It does NOT set `figma.currentPage.selection`, which is what a jump-to-layer
 * action usually does. Selecting fires `selectionchange`, and spec 3.1 requires
 * that to invalidate a selection-scoped change set -- so selecting here would
 * close the review the user pressed the button from. Zooming answers "where is
 * this" without touching the rule. See spec section 3.5.
 *
 * `scrollAndZoomIntoView` throws for a node that is not on `figma.currentPage`,
 * and results and change sets can name nodes on any page. For a node
 * elsewhere, its page is found by walking up its ancestors and made current
 * first.
 * The walk is trustworthy for a node on any page: under
 * `documentAccess: dynamic-page`, `getNodeByIdAsync` loads the node's page as
 * part of resolving it, so its whole ancestor chain is synchronously walkable.
 *
 * A thin Figma wrapper by design; spec section 6 excludes these from unit tests.
 */
export async function centreOnNode(nodeId: string): Promise<NavigateResult> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('absoluteBoundingBox' in node)) return 'not-found';
  if (!isWithin(node, figma.currentPage)) {
    // Results can span every page now (the document scope). Switching page
    // changes the selection, which only matters to a selection-scoped review
    // -- and those name nodes on the current page, so never reach here.
    const page = pageOf<BaseNode>(node);
    if (!page || page.type !== 'PAGE') return 'not-found';
    await figma.setCurrentPageAsync(page as PageNode);
  }
  figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  return 'centred';
}

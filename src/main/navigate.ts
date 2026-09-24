/** What came of trying to centre a node. See `centreOnNode`. */
export type NavigateResult = 'centred' | 'not-found' | 'other-page';

/**
 * Centre a node in the viewport.
 *
 * It does NOT set `figma.currentPage.selection`, which is what a jump-to-layer
 * action usually does. Selecting fires `selectionchange`, and spec 3.1 requires
 * that to invalidate a selection-scoped change set -- so selecting here would
 * close the review the user pressed the button from. Zooming answers "where is
 * this" without touching the rule. See spec section 3.5.
 *
 * `scrollAndZoomIntoView` throws for a node that exists but is not on
 * `figma.currentPage` -- reachable here because a change set (unlike a search
 * result) can name nodes from any page in the file. Walking up to find the
 * node's page distinguishes that case from a genuinely missing node, without
 * calling the expensive `figma.loadAllPagesAsync()`. That walk is trustworthy
 * for a node on *any* page, not only one already loaded: under this plugin's
 * `documentAccess: dynamic-page` manifest setting, `getNodeByIdAsync` implicitly
 * loads the node's containing page as part of resolving it, so by the time the
 * node is in hand its whole ancestor chain -- up to and including that page --
 * is synchronously walkable.
 *
 * A thin Figma wrapper by design; spec section 6 excludes these from unit tests.
 */
export async function centreOnNode(nodeId: string): Promise<NavigateResult> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('absoluteBoundingBox' in node)) return 'not-found';
  if (!isOnCurrentPage(node)) return 'other-page';
  figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  return 'centred';
}

function isOnCurrentPage(node: BaseNode): boolean {
  for (let current: BaseNode | null = node; current; current = current.parent) {
    if (current === figma.currentPage) return true;
  }
  return false;
}

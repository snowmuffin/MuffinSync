/**
 * Centre a node in the viewport.
 *
 * It does NOT set `figma.currentPage.selection`, which is what a jump-to-layer
 * action usually does. Selecting fires `selectionchange`, and spec 3.1 requires
 * that to invalidate a selection-scoped change set -- so selecting here would
 * close the review the user pressed the button from. Zooming answers "where is
 * this" without touching the rule. See spec section 3.5.
 *
 * A thin Figma wrapper by design; spec section 6 excludes these from unit tests.
 */
export async function centreOnNode(nodeId: string): Promise<boolean> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('absoluteBoundingBox' in node)) return false;
  figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  return true;
}

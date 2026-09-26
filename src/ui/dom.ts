// Debug functionality (console logging only)
export function debugLog(message: string, type: string = 'info'): void {
  // Log to console for development purposes
  console.log(`[Copydesk] ${message}`);
}

/** `catch` binds `unknown` under strict; the old code read `.message` directly. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `getElementById` is typed `HTMLElement | null`. Every id here is in
 * ui.html, so a miss means the markup and this file drifted apart — log it
 * and let the caller skip rather than throw an unreadable TypeError.
 */
export function byId(id: string, root: Document = document): HTMLElement | null {
  const element = root.getElementById(id);
  if (!element) debugLog(`Element not found: ${id}`);
  return element;
}

/**
 * Puts text on the clipboard. The async Clipboard API can be refused inside
 * the plugin's iframe, so a hidden textarea and `execCommand('copy')` is the
 * fallback. Resolves to whether either worked.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused; try the older route below.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position: fixed; opacity: 0; pointer-events: none;';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

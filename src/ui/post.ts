import type { UiToMain } from '../shared/messages';

export function post(message: UiToMain): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

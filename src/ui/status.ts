import { byId } from './dom';

export type StatusKind = 'success' | 'error' | 'info';

export function showStatus(message: string, type: StatusKind): void {
  const statusDiv = byId('status');
  if (!statusDiv) return;

  statusDiv.innerHTML = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');

  if (type === 'info') {
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  }
}

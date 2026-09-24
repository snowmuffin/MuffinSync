import { h, render } from 'preact';
import type { ChangeSet, ProposedChange } from '../../../shared/types';
import { ReviewScreen } from './screen';
import { post } from '../../post';
import { clearStatus, showStatus } from '../../status';
import { byId } from '../../dom';

/**
 * `ReviewScreen` is pure -- it reports a decision, it sends nothing. This
 * module is the only thing that turns that decision into a message and owns
 * when the screen is mounted at all. No JSX here on purpose: this file keeps
 * the `.ts` extension, and JSX syntax requires `.tsx`.
 */

function handleApply(accepted: ProposedChange[]): void {
  post({ type: 'apply', changes: accepted });
  closeReview();
  // The review closes at once but the write takes as long as it takes; say so
  // until `import-complete` replaces this.
  showStatus('Applying changes...', 'info');
}

function handleCancel(): void {
  closeReview();
  showStatus('Import cancelled. Nothing was changed.', 'info');
}

function setMainHidden(hidden: boolean): void {
  byId('main-content')?.classList.toggle('hidden', hidden);
}

export function openReview(changeSet: ChangeSet): void {
  const host = byId('review-host');
  if (!host) return;
  // "Checking what would change..." is what this screen is the answer to, and
  // the banner sits outside #main-content, so it would otherwise stay up
  // underneath the answer.
  clearStatus();
  setMainHidden(true);
  render(
    h(ReviewScreen, { changeSet, onApply: handleApply, onCancel: handleCancel }),
    host
  );
}

export function closeReview(): void {
  const host = byId('review-host');
  if (!host) return;
  render(null, host);
  setMainHidden(false);
}

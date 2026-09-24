import { h, render } from 'preact';
import type { ChangeSet, ProposedChange, Scope } from '../../../shared/types';
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

/** The scope of the set currently under review, if any. */
let openScope: Scope | undefined;

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

function handleNavigate(nodeId: string): void {
  post({ type: 'navigate', nodeId });
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
  openScope = changeSet.scope;
  render(
    h(ReviewScreen, {
      changeSet,
      onApply: handleApply,
      onCancel: handleCancel,
      onNavigate: handleNavigate,
      // `createdAt` is otherwise unused past validation. Keying on it forces
      // Preact to mount a fresh component per change set, rather than
      // reconciling one holding the previous selection -- unreachable with a
      // single producer, reachable now that two exist.
      key: changeSet.createdAt,
    }),
    host
  );
}

export function closeReview(): void {
  const host = byId('review-host');
  if (!host) return;
  render(null, host);
  setMainHidden(false);
  openScope = undefined;
}

/**
 * A selection-scoped set names nodes that were in the selection when it was
 * built. Changes apply by nodeId, so applying it against a different selection
 * would write to layers the user never reviewed. Spec 3.1 requires the set be
 * invalidated; it closes with a reason rather than vanishing, because a screen
 * that disappears unexplained reads as a crash.
 */
export function invalidateOnSelectionChange(): void {
  if (openScope !== 'selection') return;
  closeReview();
  showStatus('Review closed: the selection changed. Search again.', 'info');
}

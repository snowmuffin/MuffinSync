import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/**
 * `progress` is work still running: it stays until whatever answers it
 * replaces it, because a search or plan can outlast any fixed delay and a
 * banner that vanishes mid-wait reads as the work having stopped. It looks
 * like `info`; only its lifetime differs.
 */
export type StatusKind = 'success' | 'error' | 'info' | 'progress';

/** A button in the banner, such as Stop on a running task. */
export interface StatusAction {
  label: string;
  onClick(): void;
}

interface Status {
  message: string;
  kind: StatusKind;
  details: string[];
  action?: StatusAction;
  seq: number;
}

/** Info messages are transient; every other kind stays until replaced. */
const AUTO_HIDE_MS = 3000;

let publish: (status: Status | null) => void = () => {};
let seq = 0;

function StatusBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  publish = setStatus;

  useEffect(() => {
    if (!status || status.kind !== 'info') return;
    const timer = setTimeout(() => setStatus(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [status?.seq]);

  if (!status) return null;
  return (
    <div class={`status ${status.kind === 'progress' ? 'info' : status.kind}`}>
      {status.message}
      {status.details.length > 0 && (
        <>
          <br />
          <small>
            {status.details.map((line, index) => (
              <>
                {index > 0 && <br />}
                {line}
              </>
            ))}
          </small>
        </>
      )}
      {status.action && (
        <button type="button" class="status-action" onClick={status.action.onClick}>
          {status.action.label}
        </button>
      )}
    </div>
  );
}

export function mountStatus(host: HTMLElement): void {
  render(<StatusBanner />, host);
}

export function showStatus(
  message: string,
  kind: StatusKind,
  details: string[] = [],
  action?: StatusAction
): void {
  publish({ message, kind, details, action, seq: seq++ });
}

/**
 * The banner lives outside `#main-content`, so it stays on screen when a
 * screen that answers it takes over. Whoever does that takes the banner down.
 */
export function clearStatus(): void {
  publish(null);
}

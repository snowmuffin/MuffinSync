import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export type StatusKind = 'success' | 'error' | 'info';

interface Status {
  message: string;
  kind: StatusKind;
  details: string[];
  seq: number;
}

/** Info messages are transient; success and error stay until replaced. */
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
    <div class={`status ${status.kind}`}>
      {status.message}
      {status.details.length > 0 && (
        <small>
          {status.details.map((line, index) => (
            <>
              {index > 0 && <br />}
              {line}
            </>
          ))}
        </small>
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
  details: string[] = []
): void {
  publish({ message, kind, details, seq: seq++ });
}

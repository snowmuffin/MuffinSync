import { unwrapMainMessage, unwrapUiMessage, type MainToUi } from '../../../src/shared/messages';
import type { Handler } from '../../../src/main/handler';

/**
 * Drives Copydesk's real sandbox handler the way its UI does: every message
 * goes through `unwrapUiMessage` first, and every message the handler sends
 * must pass `unwrapMainMessage`, or the UI would have dropped it.
 */
export class Session {
  readonly sent: MainToUi[] = [];
  readonly rejected: string[] = [];
  handler!: Handler;

  readonly send = (message: MainToUi): void => {
    // Structured clone is what postMessage does; unwrap is what the UI does.
    if (unwrapMainMessage(message) === null) this.rejected.push(message.type);
    this.sent.push(message);
  };

  /** Sends one UI message and returns everything the handler sent in answer. */
  async ask(raw: Record<string, unknown>): Promise<MainToUi[]> {
    const message = unwrapUiMessage(raw);
    if (!message) throw new Error(`Copydesk's contract rejects the UI message ${String(raw.type)}`);
    const start = this.sent.length;
    await this.handler.handle(message);
    return this.sent.slice(start);
  }
}

export function pick<T extends MainToUi['type']>(messages: MainToUi[], type: T): Extract<MainToUi, { type: T }> {
  const found = messages.find((m) => m.type === type);
  if (!found) {
    const got = messages.map((m) => (m.type === 'error' ? `error: ${m.message}` : m.type)).join(', ') || 'nothing';
    throw new Error(`expected a "${type}" message, got ${got}`);
  }
  return found as Extract<MainToUi, { type: T }>;
}

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function same(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

export interface TestCase {
  name: string;
  run(): Promise<string | void>;
}

export interface TestOutcome {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export async function runAll(tests: ReadonlyArray<TestCase>, onEach: (outcome: TestOutcome) => void): Promise<TestOutcome[]> {
  const outcomes: TestOutcome[] = [];
  for (const test of tests) {
    const start = Date.now();
    let outcome: TestOutcome;
    try {
      const detail = await test.run();
      outcome = { name: test.name, ok: true, detail: detail ?? '', ms: Date.now() - start };
    } catch (error) {
      outcome = { name: test.name, ok: false, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - start };
    }
    outcomes.push(outcome);
    onEach(outcome);
  }
  return outcomes;
}

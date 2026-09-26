import { createHandler } from '../../../src/main/handler';
import { runAll, Session, type TestOutcome } from './harness';
import { buildFixture, removeFixture } from './fixture';
import { performanceSuite, suite } from './suite';

/**
 * Copydesk Self-Test: runs Copydesk's real sandbox handler against a real
 * document built for the purpose, then removes it. Development only; see
 * tools/self-test/README.md.
 */

/** Set by webpack.self-test.js when the bundle is built. */
declare const __BUILT_AT__: number;

const UI = `
<style>
  body { font: 12px/1.45 -apple-system, system-ui, sans-serif; margin: 12px; color: #1e293b; }
  button { font: inherit; padding: 6px 12px; margin: 0 6px 8px 0; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; cursor: pointer; }
  button.primary { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }
  button:disabled { opacity: .5; cursor: default; }
  #summary { font-weight: 600; margin: 4px 0 8px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 4px 0; border-top: 1px solid #f1f5f9; }
  li.fail { color: #b91c1c; }
  .detail { color: #64748b; display: block; margin-left: 18px; white-space: pre-wrap; }
  li.fail .detail { color: #b91c1c; }
  textarea { width: 100%; height: 90px; font: 11px ui-monospace, monospace; margin-top: 8px; }
</style>
<button class="primary" id="run">Run tests</button><button id="perf">Performance (5,000 layers)</button>
<div id="summary">Adds one temporary page, runs every test, then removes it. Needs room for one more page in this file.</div>
<div id="remote" style="color:#64748b;margin-bottom:6px">Remote: not connected (run npm run self-test:remote)</div>
<ul id="list"></ul>
<textarea id="report" readonly placeholder="The report appears here when a run ends."></textarea>
<script>
  const list = document.getElementById('list');
  const buttons = [...document.querySelectorAll('button')];
  const SERVER = 'http://localhost:3847';
  let remoteRun = false;
  const post = (type, remote) => {
    remoteRun = remote;
    buttons.forEach((b) => (b.disabled = true));
    list.innerHTML = '';
    parent.postMessage({ pluginMessage: { type } }, '*');
  };
  document.getElementById('run').onclick = () => post('run', false);
  document.getElementById('perf').onclick = () => post('perf', false);
  // text/plain keeps these "simple" requests: no CORS preflight.
  const tell = (route, body) =>
    fetch(SERVER + route, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).catch(() => {});
  // Poll the terminal runner (npm run self-test:remote) for a command.
  async function poll() {
    try {
      const reply = await (await fetch(SERVER + '/command')).json();
      document.getElementById('remote').textContent = 'Remote: connected';
      if (reply.command && !buttons[0].disabled) post(reply.command, true);
    } catch {
      document.getElementById('remote').textContent = 'Remote: not connected (run npm run self-test:remote)';
    }
    setTimeout(poll, 1500);
  }
  poll();
  onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (!msg) return;
    if (msg.type === 'status') document.getElementById('summary').textContent = msg.text;
    if (msg.type === 'outcome') {
      const li = document.createElement('li');
      li.className = msg.outcome.ok ? 'pass' : 'fail';
      li.textContent = (msg.outcome.ok ? '✓ ' : '✗ ') + msg.outcome.name + ' (' + msg.outcome.ms + ' ms)';
      if (msg.outcome.detail) {
        const d = document.createElement('span');
        d.className = 'detail';
        d.textContent = msg.outcome.detail;
        li.appendChild(d);
      }
      list.appendChild(li);
      if (remoteRun) tell('/outcome', { outcome: msg.outcome });
    }
    if (msg.type === 'done') {
      document.getElementById('summary').textContent = msg.summary;
      document.getElementById('report').value = msg.report;
      buttons.forEach((b) => (b.disabled = false));
      if (remoteRun) tell('/report', { summary: msg.summary, report: msg.report, failed: msg.failed, builtAt: msg.builtAt });
      remoteRun = false;
    }
  };
</script>`;

figma.showUI(UI, { width: 460, height: 620 });

const status = (text: string) => figma.ui.postMessage({ type: 'status', text });

/** What the tests overwrite in the user's own storage, restored afterwards. */
async function snapshot(): Promise<() => Promise<void>> {
  const settings: unknown = await figma.clientStorage.getAsync('settings');
  const snippets: unknown = await figma.clientStorage.getAsync('snippets');
  const glossary = figma.root.getPluginData('glossary');
  return async () => {
    if (settings === undefined) await figma.clientStorage.deleteAsync('settings');
    else await figma.clientStorage.setAsync('settings', settings);
    if (snippets === undefined) await figma.clientStorage.deleteAsync('snippets');
    else await figma.clientStorage.setAsync('snippets', snippets);
    figma.root.setPluginData('glossary', glossary);
  };
}

function report(outcomes: TestOutcome[]): { summary: string; report: string; failed: number; builtAt: number } {
  const failed = outcomes.filter((o) => !o.ok);
  const summary = failed.length === 0
    ? `All ${outcomes.length} tests passed.`
    : `${failed.length} of ${outcomes.length} tests failed.`;
  const lines = outcomes.map((o) => `${o.ok ? 'PASS' : 'FAIL'}  ${o.name}${o.detail ? ` — ${o.detail}` : ''}`);
  const header = `Copydesk self-test, ${new Date().toISOString()} (build ${new Date(__BUILT_AT__).toISOString()})`;
  return { summary, report: [header, summary, '', ...lines].join('\n'), failed: failed.length, builtAt: __BUILT_AT__ };
}

async function run(kind: 'run' | 'perf'): Promise<void> {
  const returnTo = figma.currentPage;
  const selection = [...figma.currentPage.selection];
  const restore = await snapshot();
  const session = new Session();
  session.handler = createHandler(session.send);
  const onEach = (outcome: TestOutcome) => figma.ui.postMessage({ type: 'outcome', outcome });

  let outcomes: TestOutcome[] = [];
  try {
    if (kind === 'perf') {
      status('Building 5,000 layers — this takes a while…');
      outcomes = await runAll(performanceSuite(session, 5000), onEach);
    } else {
      status('Building the test pages…');
      const fixture = await buildFixture(returnTo);
      try {
        status('Running…');
        outcomes = await runAll(suite(session, fixture), onEach);
      } finally {
        await removeFixture(fixture, returnTo);
      }
    }
  } catch (error) {
    outcomes.push({ name: 'Setup', ok: false, detail: error instanceof Error ? error.message : String(error), ms: 0 });
  } finally {
    await restore();
    if (!returnTo.removed) {
      await figma.setCurrentPageAsync(returnTo);
      figma.currentPage.selection = selection.filter((node) => !node.removed);
    }
  }
  figma.ui.postMessage({ type: 'done', ...report(outcomes) });
}

figma.ui.onmessage = (message: { type?: string }) => {
  if (message.type === 'run' || message.type === 'perf') void run(message.type);
};

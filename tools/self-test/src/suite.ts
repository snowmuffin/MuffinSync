import type { TextLayerData } from '../../../src/shared/types';
import type { MainToUi } from '../../../src/shared/messages';
import { check, pick, same, type Session, type TestCase } from './harness';
import { frame, REGULAR, text, type Fixture } from './fixture';

/**
 * Every test sends the messages Copydesk's UI would send and checks both what
 * comes back and what happened to the document. Tests run in order on one
 * fixture and undo their own document changes where later tests depend on it.
 */

const NO_MATCH = { caseSensitive: false, wholeWord: false, regex: false };

function rowsOf(messages: MainToUi[]): TextLayerData[] {
  return pick(messages, 'extracted').rows;
}

function names(rows: TextLayerData[]): string[] {
  return rows.map((row) => row.name);
}

/** Lets pending timers run: the handler yields to the host between slices. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

export function suite(s: Session, f: Fixture): TestCase[] {
  const extract = (scope: string, extra: Record<string, unknown> = {}) =>
    s.ask({ type: 'extract', scope, includeHidden: true, contextColumns: false, ...extra });

  const planAndApply = async (rows: Array<Record<string, string>>) => {
    const changeSet = pick(await s.ask({ type: 'plan-import', rows }), 'change-set').changeSet;
    const done = pick(await s.ask({ type: 'apply', changes: changeSet.changes }), 'import-complete');
    return { changeSet, done };
  };

  return [
    {
      name: 'Opening: ui-ready reports the selection, then settings',
      async run() {
        const sent = await s.ask({ type: 'ui-ready' });
        same(sent.map((m) => m.type).slice(0, 2), ['selection', 'settings'], 'order');
      },
    },
    {
      name: 'Extract: current page, with frame names and paths',
      async run() {
        figma.currentPage.selection = [];
        const rows = rowsOf(await extract('page', { contextColumns: true }));
        const title = rows.find((r) => r.id === f.title.id);
        check(title, 'Title was not extracted');
        same([title.frame, title.path], ['Home', 'Home / Title'], 'frame and path');
        check(!rows.some((r) => r.id === f.elsewhere.id), 'another page leaked into a page extract');
        return `${rows.length} layers`;
      },
    },
    {
      name: 'Extract: selection scope takes only the selected frame',
      async run() {
        figma.currentPage.selection = [f.home];
        const rows = rowsOf(await extract('selection'));
        same(names(rows), ['Title', 'Body', 'Mixed', 'Quote'], 'layers');
      },
    },
    {
      name: 'Extract: All pages loads and walks the other page',
      async run() {
        const rows = rowsOf(await extract('document'));
        check(rows.some((r) => r.id === f.elsewhere.id), 'the second page was not walked');
      },
    },
    {
      name: 'Extract: Include hidden layers off skips hidden frames and hidden instance children',
      async run() {
        const withHidden = rowsOf(await extract('page'));
        const without = rowsOf(await extract('page', { includeHidden: false }));
        check(withHidden.some((r) => r.id === f.secret.id), 'hidden text missing when included');
        check(!without.some((r) => r.id === f.secret.id), 'text in a hidden frame was extracted');
        check(!without.some((r) => r.name === 'Card note' && r.id.startsWith('I')), 'hidden instance child was extracted');
        check(figma.skipInvisibleInstanceChildren === false, 'skipInvisibleInstanceChildren was left on');
        return `${withHidden.length - without.length} hidden layers skipped`;
      },
    },
    {
      name: 'Import: plan and apply writes the text',
      async run() {
        const { done } = await planAndApply([{ id: f.title.id, name: 'Title', characters: 'Welcome back' }]);
        same([done.updated, done.failed], [1, 0], 'updated, failed');
        same(f.title.characters, 'Welcome back', 'layer text');
      },
    },
    {
      name: 'Import: a mixed-font layer loads every font and applies',
      async run() {
        const { done } = await planAndApply([{ id: f.mixed.id, name: 'Mixed', characters: 'All new text' }]);
        same(done.failed, 0, `failures (${done.errors.join('; ')})`);
        same(f.mixed.characters, 'All new text', 'layer text');
      },
    },
    {
      name: 'Import: a layer edited after review is not overwritten',
      async run() {
        const plan = pick(await s.ask({ type: 'plan-import', rows: [{ id: f.body.id, name: 'Body', characters: 'From the file' }] }), 'change-set');
        f.body.characters = 'Edited on the canvas';
        const done = pick(await s.ask({ type: 'apply', changes: plan.changeSet.changes }), 'import-complete');
        same([done.updated, done.failed], [0, 1], 'updated, failed');
        same(f.body.characters, 'Edited on the canvas', 'layer text');
        f.body.characters = 'Sign up  today ';
      },
    },
    {
      name: 'Import: unknown id without a path is listed as missing',
      async run() {
        const set = pick(await s.ask({ type: 'plan-import', rows: [{ id: '999:999', name: 'Ghost', characters: 'x' }] }), 'change-set').changeSet;
        same(set.blocked.map((b) => b.reason), ['missing'], 'blocked');
      },
    },
    {
      name: 'Import: a row whose id is gone is matched by path',
      async run() {
        const original = frame(f.page, 'PathCase', 0, 400);
        text(original, 'Label', 'Old label');
        figma.currentPage.selection = [original];
        const rows = rowsOf(await extract('selection', { contextColumns: true }));
        const copy = original.clone();
        f.page.appendChild(copy);
        original.remove();
        const target = copy.findOne((n) => n.type === 'TEXT') as TextNode;
        const set = pick(
          await s.ask({ type: 'plan-import', rows: rows.map((r) => ({ ...r, characters: 'New label' })) }),
          'change-set'
        ).changeSet;
        same(set.changes.map((c) => [c.nodeId, c.matchedBy]), [[target.id, 'path']], 'changes');
        copy.remove();
      },
    },
    {
      name: 'Import: a path shared by several layers is ambiguous',
      async run() {
        const set = pick(
          await s.ask({ type: 'plan-import', rows: [{ id: '999:1', name: 'Text', characters: 'x', path: 'Twins / Text' }] }),
          'change-set'
        ).changeSet;
        same(set.blocked.map((b) => b.reason), ['ambiguous'], 'blocked');
      },
    },
    {
      name: 'Find: search lists matching layers with counts',
      async run() {
        const results = pick(await s.ask({ type: 'search', query: 'sign up', scope: 'page', includeHidden: true, ...NO_MATCH }), 'search-results');
        same(results.matches.map((m) => [m.layerName, m.matchCount]), [['Body', 1]], 'matches');
      },
    },
    {
      name: 'Find: regex replacement with a group, through review',
      async run() {
        const set = pick(
          await s.ask({
            type: 'plan-replace', query: 'Welcome (\\w+)', replacement: 'Hi $1',
            targets: [{ nodeId: f.title.id, layerName: 'Title' }], scope: 'page',
            caseSensitive: false, wholeWord: false, regex: true,
          }),
          'change-set'
        ).changeSet;
        same(set.changes.map((c) => c.after), ['Hi back'], 'after');
      },
    },
    {
      name: 'Find: only the chosen occurrence is replaced; a stale choice is refused',
      async run() {
        const node = text(f.home, 'Repeats', 'x x x', 200);
        const ask = () => s.ask({
          type: 'plan-replace', query: 'x', replacement: 'Y',
          targets: [{ nodeId: node.id, layerName: 'Repeats', occurrences: [1], expected: 'x x x' }], scope: 'page', ...NO_MATCH,
        });
        same(pick(await ask(), 'change-set').changeSet.changes.map((c) => c.after), ['x Y x'], 'after');
        node.characters = 'x x';
        same(pick(await ask(), 'change-set').changeSet.blocked.map((b) => b.reason), ['changed'], 'blocked when stale');
        node.remove();
      },
    },
    {
      name: 'Check: rules find issues, and fixes plan from the current text',
      async run() {
        const glossary = [{ avoid: 'sign up', use: 'register', caseSensitive: false, wholeWord: true }];
        const results = pick(
          await s.ask({ type: 'check', scope: 'page', includeHidden: true, rules: ['double-space', 'edge-space', 'quotes', 'glossary'], glossary }),
          'check-results'
        ).results;
        const body = results.find((r) => r.nodeId === f.body.id);
        check(body, 'Body has no findings');
        same([...new Set(body.findings.map((x) => x.rule))].sort(), ['double-space', 'edge-space', 'glossary'], 'rules found in Body');
        check(results.some((r) => r.nodeId === f.quote.id), 'straight quotes were not found');
        const set = pick(
          await s.ask({ type: 'plan-check', targets: [{ nodeId: f.body.id, layerName: 'Body', rules: ['double-space', 'edge-space', 'glossary'] }], glossary, scope: 'page' }),
          'change-set'
        ).changeSet;
        same(set.changes.map((c) => c.after), ['Register today'], 'fixed text');
      },
    },
    {
      name: 'Generate: data merge fills tags, names copies, reports unknown tags',
      async run() {
        figma.currentPage.selection = [f.template];
        const done = pick(
          await s.ask({ type: 'merge', rows: [{ Name: 'Ana', Plan: 'Pro' }, { Name: 'Bo', Plan: 'Free' }] }),
          'generated'
        );
        same([done.count, done.missingTags], [2, ['Nmae']], 'count and missing tags');
        const ana = f.page.findOne((n) => n.name === 'Ana') as FrameNode | null;
        check(ana, 'no copy named Ana');
        same((ana.findAll((n) => n.type === 'TEXT') as TextNode[]).map((t) => t.characters), ['Hello Ana', 'Pro plan', '{{Nmae}}'], 'copy texts');
        check(ana.x > f.template.x, 'copy was not placed beside the template');
        for (const name of ['Ana', 'Bo']) f.page.findOne((n) => n.name === name)?.remove();
      },
    },
    {
      name: 'Generate: localized copies translate by position and count the rest',
      async run() {
        figma.currentPage.selection = [f.home];
        const translations = { ko: { [f.title.id]: '다시 오신 것을 환영합니다' } };
        const done = pick(await s.ask({ type: 'localize', locales: ['ko'], translations }), 'generated');
        same([done.count, done.untranslated], [1, 3], 'copies, untranslated');
        const copy = f.page.findOne((n) => n.name === 'Home — ko') as FrameNode | null;
        check(copy, 'no copy named "Home — ko"');
        same((copy.findOne((n) => n.name === 'Title') as TextNode).characters, '다시 오신 것을 환영합니다', 'translated title');
        copy.remove();
      },
    },
    {
      name: 'Tasks: a second task is refused, and Stop rolls a merge back',
      async run() {
        figma.currentPage.selection = [f.template];
        // Enough rows that the run always spans several slices, so Stop lands
        // mid-run however fast the machine is.
        const rows = Array.from({ length: 2000 }, (_, i) => ({ Name: `R${i}`, Plan: 'x' }));
        const start = s.sent.length;
        // Not awaited: the task guard is set before the handler's first await.
        const running = s.handler.handle({ type: 'merge', rows });
        const refused = await s.ask({ type: 'extract', scope: 'page', includeHidden: true, contextColumns: false });
        check(refused.some((m) => m.type === 'error' && /Another task/.test(m.message)), 'a second task was not refused');
        await s.ask({ type: 'stop-task' });
        await running;
        check(s.sent.slice(start).some((m) => m.type === 'task-stopped'), 'the merge did not stop');
        check(!f.page.findOne((n) => n.name.startsWith('R') && /^R\d+$/.test(n.name)), 'copies were left after Stop');
      },
    },
    {
      name: 'Export: a selected frame becomes a PDF',
      async run() {
        figma.currentPage.selection = [f.home];
        const files = pick(await s.ask({ type: 'export-pdf' }), 'pdf-exported').files;
        same(files.map((x) => x.name), ['Home'], 'files');
        same(Array.from(files[0].data.slice(0, 4)), [37, 80, 68, 70], 'PDF signature (%PDF)');
        return `${files[0].data.length} bytes`;
      },
    },
    {
      name: 'Navigate: a layer on another page switches to that page',
      async run() {
        const sent = await s.ask({ type: 'navigate', nodeId: f.elsewhere.id });
        check(!sent.some((m) => m.type === 'error'), 'navigation reported an error');
        same(figma.currentPage.id, f.otherPage.id, 'current page');
        await figma.setCurrentPageAsync(f.page);
      },
    },
    {
      name: 'Snippets: saved, read back, applied through review, added as a layer',
      async run() {
        const snippets = [{ id: 'self-test', name: 'Test snippet', text: 'Snippet text' }];
        same(pick(await s.ask({ type: 'save-snippets', snippets }), 'snippets').snippets, snippets, 'saved');
        same(pick(await s.ask({ type: 'get-snippets' }), 'snippets').snippets, snippets, 'read back');
        figma.currentPage.selection = [f.loose];
        const set = pick(await s.ask({ type: 'plan-snippet', text: 'Snippet text' }), 'change-set').changeSet;
        same([set.changes.map((c) => c.after), set.scope], [['Snippet text'], 'selection'], 'planned change');
        pick(await s.ask({ type: 'add-snippet-layer', name: 'Test snippet', text: 'Snippet text' }), 'notice');
        const added = f.page.findOne((n) => n.type === 'TEXT' && n.name === 'Test snippet') as TextNode | null;
        check(added && added.characters === 'Snippet text', 'the snippet layer was not added');
        added.remove();
      },
    },
    {
      name: 'Glossary: saved in the file and read back',
      async run() {
        const entries = [{ avoid: 'e-mail', use: 'email', caseSensitive: false, wholeWord: true }];
        same(pick(await s.ask({ type: 'save-glossary', entries }), 'glossary').entries, entries, 'saved');
        same(pick(await s.ask({ type: 'get-glossary' }), 'glossary').entries, entries, 'read back');
      },
    },
    {
      name: 'Settings: saved and sent back on the next open',
      async run() {
        await s.ask({ type: 'save-settings', settings: { tab: 'check', scope: 'document' } });
        const settings = pick(await s.ask({ type: 'ui-ready' }), 'settings').settings;
        same([settings.tab, settings.scope], ['check', 'document'], 'tab and scope');
      },
    },
    {
      name: 'Contract: every message Copydesk sent would be accepted by its UI',
      async run() {
        same(s.rejected, [], 'rejected message types');
        return `${s.sent.length} messages checked`;
      },
    },
  ];
}

/** Optional: how long the slow paths take on a page of `count` text layers. */
export function performanceSuite(s: Session, count: number): TestCase[] {
  return [
    {
      name: `Performance: extract, search and check on ${count.toLocaleString('en-US')} layers`,
      async run() {
        await figma.loadFontAsync(REGULAR);
        const page = figma.createPage();
        page.name = 'Copydesk self-test (performance)';
        await figma.setCurrentPageAsync(page);
        try {
          for (let i = 0; i < count; i += 20) {
            const holder = frame(page, `Frame ${i / 20}`, (i / 20) % 50 * 400, Math.floor(i / 1000) * 300);
            for (let j = 0; j < 20 && i + j < count; j++) text(holder, `Text ${i + j}`, `Sign up  for plan ${i + j}`, j * 12);
            if (i % 1000 === 0) await tick();
          }
          const time = async (raw: Record<string, unknown>, answer: MainToUi['type']) => {
            const start = Date.now();
            const sent = await s.ask(raw);
            pick(sent, answer);
            return { ms: Date.now() - start, progress: sent.filter((m) => m.type === 'progress').length };
          };
          const ex = await time({ type: 'extract', scope: 'page', includeHidden: true, contextColumns: true }, 'extracted');
          const se = await time({ type: 'search', query: 'plan', scope: 'page', includeHidden: true, ...NO_MATCH }, 'search-results');
          const ch = await time({ type: 'check', scope: 'page', includeHidden: true, rules: ['double-space', 'edge-space'], glossary: [] }, 'check-results');
          return `extract ${ex.ms} ms (${ex.progress} progress reports), search ${se.ms} ms, check ${ch.ms} ms`;
        } finally {
          const back = figma.root.children.find((p) => p !== page);
          if (back) await figma.setCurrentPageAsync(back);
          page.remove();
        }
      },
    },
  ];
}

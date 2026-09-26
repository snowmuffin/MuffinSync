import type { MatchOptions, ReplaceTarget, Scope, TaskKind, TextLayerData } from '../shared/types';
import type { ExportedFile, MainToUi } from '../shared/messages';
import { unwrapUiMessage } from '../shared/messages';
import { collectTextLayers, resolveRoots, type TraversableNode } from './traverse';
import { applyTextChanges, type ApplicableNode } from './apply';
import { buildChangeSet, type ChangeTarget } from './plan';
import { matchingLayers, replaceMatches } from '../shared/match';
import { centreOnNode } from './navigate';
import { runChunked, type TaskControl } from './chunked';
import { createFontCache, type FontRef } from './fonts';
import { localizeFrames, mergeRows, type GenerateResult, type SetText } from './generate';
import { buildPathIndex, resolveRows, type PathIndex, type PathMatch } from './pathmatch';
import { isSnippets, type Snippet } from '../shared/generate';
import { COMMAND_TABS, parseSettings } from '../shared/settings';

figma.showUI(__html__, { width: 400, height: 500 });

function send(message: MainToUi): void {
  figma.ui.postMessage(message);
}

/**
 * The UI cannot ask Figma what is selected, so the sandbox tells it: once the
 * iframe says it is listening, and again on every change. This only feeds the
 * visible choice in the scope control -- it does not affect what `rootsFor`
 * resolves.
 *
 * The first report cannot be sent in the `showUI` tick: the iframe has not
 * loaded and its `window.onmessage` is not installed yet, so that message is
 * dropped and the plugin opens showing Selection as chosen and enabled with
 * nothing selected. It waits for `ui-ready` instead.
 */
const reportSelection = () =>
  send({ type: 'selection', present: figma.currentPage.selection.length > 0 });

figma.on('selectionchange', reportSelection);

/**
 * Resolve a scope to the roots a walk starts from. See spec section 3.1.
 *
 * An empty selection falls back to the whole page. The plugin has always
 * behaved this way — selecting nothing and extracting searches the page —
 * and the spec keeps the rule, so scope: 'selection' with an empty selection
 * must not return nothing.
 */
async function rootsFor(scope: Scope): Promise<ReadonlyArray<TraversableNode>> {
  // Under `documentAccess: dynamic-page`, pages other than the current one
  // must be loaded before they can be walked.
  if (scope === 'document') await figma.loadAllPagesAsync();
  const nodes = resolveRoots<unknown>(
    scope,
    figma.currentPage.selection,
    figma.currentPage.children,
    figma.root.children
  );
  // SceneNode satisfies TraversableNode structurally; TypeScript cannot see
  // that through the SceneNode union, so state it once here.
  return nodes as unknown as ReadonlyArray<TraversableNode>;
}

/**
 * The long task running now, if any. Long tasks yield between time slices, so
 * without this a second request could interleave with the first. The UI
 * disables its triggers while a task runs; this is the backstop.
 */
let running: TaskKind | null = null;
let stopRequested = false;

function controlFor(task: TaskKind): TaskControl {
  return {
    onProgress: (done, total) => send({ type: 'progress', task, done, total }),
    // Apply is never stopped halfway: the review that justified the batch
    // would no longer describe the document (spec 2026-09-26 §6).
    isStopped: () => task !== 'apply' && stopRequested,
    yieldToHost: () => new Promise((resolve) => setTimeout(resolve, 0)),
    now: () => Date.now(),
  };
}

/** Runs `body` as the one long task, or refuses if another is running. */
async function runTask(task: TaskKind, body: (control: TaskControl) => Promise<void>): Promise<void> {
  if (running) {
    send({
      type: 'error',
      message: 'Another task is still running. Wait for it to finish, or stop it.',
    });
    return;
  }
  running = task;
  stopRequested = false;
  try {
    await body(controlFor(task));
  } finally {
    running = null;
    stopRequested = false;
  }
}

/**
 * Collect text layers for extract or search. With hidden layers excluded,
 * Figma is also told to skip invisible instance children, which spares it
 * building nodes the filter would drop anyway; the flag is global, so it is
 * put back afterwards.
 */
async function collectFor(
  scope: Scope,
  includeHidden: boolean,
  control: TaskControl,
  extras: { withFrames?: boolean; withPaths?: boolean } = {}
): Promise<TextLayerData[] | 'stopped'> {
  const roots = await rootsFor(scope);
  if (includeHidden) return collectTextLayers(roots, control, extras);
  figma.skipInvisibleInstanceChildren = true;
  try {
    return await collectTextLayers(roots, control, { ...extras, includeHidden: false });
  } finally {
    figma.skipInvisibleInstanceChildren = false;
  }
}

/** A text writer that loads each font once for the run it belongs to. */
function textWriter(): SetText {
  const ensureFonts = createFontCache((font) => figma.loadFontAsync(font));
  return async (node, text) => {
    await ensureFonts(fontsOf(node as unknown as ApplicableNode));
    node.characters = text;
  };
}

const SNIPPETS_KEY = 'snippets';
const SETTINGS_KEY = 'settings';

async function loadSnippets(): Promise<Snippet[]> {
  const stored: unknown = await figma.clientStorage.getAsync(SNIPPETS_KEY);
  return isSnippets(stored) ? stored : [];
}

/** Sends a finished generate run: a stop, or a summary. */
function sendGenerated(kind: 'merge' | 'localize', result: GenerateResult): void {
  send(
    result.outcome === 'stopped'
      ? { type: 'task-stopped', task: 'generate' }
      : {
          type: 'generated',
          kind,
          count: result.count,
          missingTags: result.missingTags,
          untranslated: result.untranslated,
        }
  );
}

/** Top-level layer types worth exporting when nothing is selected. */
const FRAME_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION', 'INSTANCE', 'GROUP']);

/** The selection, or else every top-level frame on the page. */
function framesToExport(): SceneNode[] {
  const selection = figma.currentPage.selection;
  if (selection.length > 0) return [...selection];
  return figma.currentPage.children.filter((node) => FRAME_TYPES.has(node.type));
}

/** Every font a layer uses, including the mixed-font case. */
function fontsOf(node: ApplicableNode): FontRef[] {
  const textNode = node as unknown as TextNode;
  return textNode.fontName === figma.mixed
    ? textNode.getRangeAllFontNames(0, textNode.characters.length)
    : [textNode.fontName];
}

/**
 * What a find & replace target becomes. Every occurrence, unless the user
 * picked some -- and picked indices only name the same matches in the text
 * they were picked in, so a layer edited since the search is refused (`null`,
 * blocked as `changed`) rather than having other occurrences replaced.
 */
function replaceTarget(
  current: string,
  target: ReplaceTarget,
  query: string,
  replacement: string,
  opts: MatchOptions
): string | null {
  if (!target.occurrences) return replaceMatches(current, query, replacement, opts);
  if (current !== target.expected) return null;
  return replaceMatches(current, query, replacement, opts, new Set(target.occurrences));
}

/**
 * For import rows whose id no longer names a text layer but which carry a
 * path, finds the layer by path: the current page first, then every page if
 * rows are still unmatched. Rows whose id works are left alone. Returns an
 * empty map when no row needs it, without walking anything.
 */
async function matchByPath(
  rows: ReadonlyArray<TextLayerData>,
  control: TaskControl
): Promise<Map<string, PathMatch> | 'stopped'> {
  const needsPath = new Set<string>();
  for (const row of rows) {
    if (!row.path) continue;
    const node = await getNode(row.id);
    if (!node || node.type !== 'TEXT') needsPath.add(row.id);
  }
  if (needsPath.size === 0) return new Map();

  const indexes: PathIndex[] = [];
  const pageLayers = await collectTextLayers(
    figma.currentPage.children as unknown as ReadonlyArray<TraversableNode>,
    control,
    { withPaths: true }
  );
  if (pageLayers === 'stopped') return 'stopped';
  indexes.push(buildPathIndex(pageLayers));

  let result = resolveRows(rows, needsPath, indexes);
  const unmatched = Array.from(result.values()).some((match) => match.kind === 'none');
  if (unmatched && figma.root.children.length > 1) {
    await figma.loadAllPagesAsync();
    const others = figma.root.children.filter((page) => page !== figma.currentPage);
    const allLayers = await collectTextLayers(others as unknown as ReadonlyArray<TraversableNode>, control, {
      withPaths: true,
    });
    if (allLayers === 'stopped') return 'stopped';
    indexes.push(buildPathIndex(allLayers));
    result = resolveRows(rows, needsPath, indexes);
  }
  return result;
}

/** Reads a node for planning and applying. */
const getNode = async (id: string) =>
  (await figma.getNodeByIdAsync(id)) as ApplicableNode | null;

figma.ui.onmessage = async (event: unknown) => {
  const message = unwrapUiMessage(event);
  if (!message) return;

  try {
    switch (message.type) {
      case 'ui-ready': {
        // Selection first, so a remembered 'selection' scope is only restored
        // when something is selected; then settings; then the menu command's
        // tab, which wins over the remembered one.
        reportSelection();
        send({ type: 'settings', settings: parseSettings(await figma.clientStorage.getAsync(SETTINGS_KEY)) });
        const tab = COMMAND_TABS[figma.command];
        if (tab) send({ type: 'open-tab', tab });
        break;
      }
      case 'save-settings':
        await figma.clientStorage.setAsync(SETTINGS_KEY, message.settings);
        break;
      case 'extract': {
        try {
          await runTask('extract', async (control) => {
            const rows = await collectFor(message.scope, message.includeHidden, control, {
              withFrames: true,
              withPaths: message.contextColumns,
            });
            if (rows === 'stopped') {
              send({ type: 'task-stopped', task: 'extract' });
            } else {
              send(rows.length === 0 ? { type: 'no-text-found' } : { type: 'extracted', rows });
            }
          });
        } catch (error) {
          throw new Error(
            `Error occurred during text extraction: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'plan-import': {
        try {
          await runTask('plan', async (control) => {
            const matches = await matchByPath(message.rows, control);
            if (matches === 'stopped') {
              send({ type: 'task-stopped', task: 'plan' });
              return;
            }
            const changeSet = await buildChangeSet(
              message.rows.map((row) => {
                const match = matches.get(row.id);
                return {
                  id: row.id,
                  fallbackName: row.name,
                  after: () => row.characters,
                  resolvedId: match?.kind === 'unique' ? match.id : undefined,
                  ambiguous: match?.kind === 'ambiguous',
                };
              }),
              'import',
              { getNode, control }
            );
            send(
              changeSet === 'stopped'
                ? { type: 'task-stopped', task: 'plan' }
                : { type: 'change-set', changeSet }
            );
          });
        } catch (error) {
          throw new Error(
            `Error occurred while planning the import: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'apply': {
        try {
          await runTask('apply', async (control) => {
            // One cache per run: a font loaded for one row is loaded for all.
            const ensureFonts = createFontCache((font) => figma.loadFontAsync(font));
            const result = await applyTextChanges(message.changes, {
              getNode,
              loadFonts: (node) => ensureFonts(fontsOf(node)),
              control,
            });
            send({ type: 'import-complete', ...result });
          });
        } catch (error) {
          throw new Error(
            `Error occurred during text import: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'search': {
        try {
          await runTask('search', async (control) => {
            const rows = await collectFor(message.scope, message.includeHidden, control);
            if (rows === 'stopped') {
              send({ type: 'task-stopped', task: 'search' });
              return;
            }
            const matches = matchingLayers(rows, message.query, {
              caseSensitive: message.caseSensitive,
              wholeWord: message.wholeWord,
              regex: message.regex,
            });
            send({ type: 'search-results', matches, scope: message.scope });
          });
        } catch (error) {
          throw new Error(
            `Error occurred during search: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'plan-replace': {
        try {
          const opts = {
            caseSensitive: message.caseSensitive,
            wholeWord: message.wholeWord,
            regex: message.regex,
          };
          // Each node is re-read and the replacement recomputed here, so the
          // set's `before` is the document's text now, not at search time.
          const targets: ChangeTarget[] = message.targets.map((target) => ({
            id: target.nodeId,
            fallbackName: target.layerName,
            after: (current) => replaceTarget(current, target, message.query, message.replacement, opts),
          }));
          await runTask('plan', async (control) => {
            const changeSet = await buildChangeSet(
              targets,
              'find-replace',
              { getNode, control },
              Date.now(),
              message.scope
            );
            send(
              changeSet === 'stopped'
                ? { type: 'task-stopped', task: 'plan' }
                : { type: 'change-set', changeSet }
            );
          });
        } catch (error) {
          throw new Error(
            `Error occurred while planning the replacement: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'navigate': {
        try {
          const result = await centreOnNode(message.nodeId);
          if (result === 'not-found') {
            send({ type: 'error', message: 'That layer no longer exists.' });
          }
        } catch (error) {
          throw new Error(
            `Error occurred while navigating: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'export-pdf': {
        try {
          await runTask('export', async (control) => {
            const nodes = framesToExport();
            if (nodes.length === 0) {
              send({ type: 'error', message: 'There are no frames on this page to export.' });
              return;
            }
            const files: ExportedFile[] = [];
            const outcome = await runChunked(
              nodes,
              async (node) => {
                files.push({ name: node.name, data: await node.exportAsync({ format: 'PDF' }) });
              },
              control
            );
            send(
              outcome === 'stopped'
                ? { type: 'task-stopped', task: 'export' }
                : { type: 'pdf-exported', files }
            );
          });
        } catch (error) {
          throw new Error(
            `Error occurred while exporting frames: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'get-snippets':
        send({ type: 'snippets', snippets: await loadSnippets() });
        break;
      case 'save-snippets':
        await figma.clientStorage.setAsync(SNIPPETS_KEY, message.snippets);
        send({ type: 'snippets', snippets: await loadSnippets() });
        break;
      case 'plan-snippet': {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          send({ type: 'error', message: 'Select the text layers to put the snippet in.' });
          break;
        }
        await runTask('plan', async (control) => {
          const rows = await collectTextLayers(
            selection as unknown as ReadonlyArray<TraversableNode>,
            control
          );
          if (rows === 'stopped') {
            send({ type: 'task-stopped', task: 'plan' });
            return;
          }
          if (rows.length === 0) {
            send({ type: 'error', message: 'The selection has no text layers.' });
            return;
          }
          const changeSet = await buildChangeSet(
            rows.map((row) => ({ id: row.id, fallbackName: row.name, after: () => message.text })),
            'snippet',
            { getNode, control },
            Date.now(),
            // Built from the selection, so a selection change invalidates it.
            'selection'
          );
          send(
            changeSet === 'stopped'
              ? { type: 'task-stopped', task: 'plan' }
              : { type: 'change-set', changeSet }
          );
        });
        break;
      }
      case 'add-snippet-layer': {
        const font = { family: 'Inter', style: 'Regular' };
        await figma.loadFontAsync(font);
        const node = figma.createText();
        node.fontName = font;
        node.characters = message.text;
        node.name = message.name || 'Snippet';
        const centre = figma.viewport.center;
        node.x = centre.x - node.width / 2;
        node.y = centre.y - node.height / 2;
        figma.currentPage.appendChild(node);
        send({ type: 'notice', message: `Added "${node.name}" as a new text layer.` });
        break;
      }
      case 'merge': {
        const selection = figma.currentPage.selection;
        if (selection.length !== 1) {
          send({ type: 'error', message: 'Select exactly one template frame to merge into.' });
          break;
        }
        if (message.rows.length === 0) {
          send({ type: 'error', message: 'The data file has no rows.' });
          break;
        }
        await runTask('generate', async (control) => {
          sendGenerated('merge', await mergeRows(selection[0], message.rows, control, textWriter()));
        });
        break;
      }
      case 'localize': {
        const frames = [...figma.currentPage.selection];
        if (frames.length === 0) {
          send({ type: 'error', message: 'Select the frames to localize.' });
          break;
        }
        if (message.locales.length === 0) {
          send({ type: 'error', message: 'The file has no language columns besides id, name and characters.' });
          break;
        }
        await runTask('generate', async (control) => {
          sendGenerated(
            'localize',
            await localizeFrames(frames, message.locales, message.translations, control, textWriter())
          );
        });
        break;
      }
      case 'stop-task':
        // Nothing to stop, or a task that cannot be: ignore rather than error,
        // since the task may simply have finished as the click arrived.
        if (running !== null && running !== 'apply') stopRequested = true;
        break;
      case 'cancel':
        figma.closePlugin();
        break;
    }
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

import type { MatchOptions, ReplaceTarget, Scope, TaskKind, TextLayerData } from '../shared/types';
import type { MainToUi } from '../shared/messages';
import { unwrapUiMessage } from '../shared/messages';
import { collectTextLayers, resolveRoots, type TraversableNode } from './traverse';
import { applyTextChanges, type ApplicableNode } from './apply';
import { buildChangeSet, type ChangeTarget } from './plan';
import { matchingLayers, replaceMatches } from '../shared/match';
import { centreOnNode } from './navigate';
import type { TaskControl } from './chunked';
import { createFontCache, type FontRef } from './fonts';

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
  control: TaskControl
): Promise<TextLayerData[] | 'stopped'> {
  const roots = await rootsFor(scope);
  if (includeHidden) return collectTextLayers(roots, control);
  figma.skipInvisibleInstanceChildren = true;
  try {
    return await collectTextLayers(roots, control, { includeHidden: false });
  } finally {
    figma.skipInvisibleInstanceChildren = false;
  }
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

/** Reads a node for planning and applying. */
const getNode = async (id: string) =>
  (await figma.getNodeByIdAsync(id)) as ApplicableNode | null;

figma.ui.onmessage = async (event: unknown) => {
  const message = unwrapUiMessage(event);
  if (!message) return;

  try {
    switch (message.type) {
      case 'ui-ready':
        reportSelection();
        break;
      case 'extract': {
        try {
          await runTask('extract', async (control) => {
            const rows = await collectFor(message.scope, message.includeHidden, control);
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
            const changeSet = await buildChangeSet(
              message.rows.map((row) => ({
                id: row.id,
                fallbackName: row.name,
                after: () => row.characters,
              })),
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

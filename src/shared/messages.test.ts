import { describe, it, expect } from 'vitest';
import { unwrapUiMessage, unwrapMainMessage } from './messages';

/** Drops one field, so a fixture can break exactly one check at a time. */
function omit(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...source };
  delete copy[key];
  return copy;
}

describe('unwrapUiMessage', () => {
  it('reads a bare message object', () => {
    expect(unwrapUiMessage({ type: 'cancel' })).toEqual({ type: 'cancel' });
  });

  it('reads a pluginMessage envelope', () => {
    expect(unwrapUiMessage({ pluginMessage: { type: 'cancel' } })).toEqual({
      type: 'cancel',
    });
  });

  it('reads a data.pluginMessage envelope', () => {
    expect(
      unwrapUiMessage({ data: { pluginMessage: { type: 'cancel' } } })
    ).toEqual({ type: 'cancel' });
  });

  it('keeps the payload of a typed message', () => {
    expect(unwrapUiMessage({ pluginMessage: { type: 'extract', scope: 'page' } }))
      .toEqual({ type: 'extract', scope: 'page' });
  });

  it('returns null for an unknown type', () => {
    expect(unwrapUiMessage({ type: 'nonsense' })).toBeNull();
  });

  it('returns null for junk', () => {
    expect(unwrapUiMessage(null)).toBeNull();
    expect(unwrapUiMessage('cancel')).toBeNull();
    expect(unwrapUiMessage({})).toBeNull();
  });

  it('rejects extract without a scope', () => {
    expect(unwrapUiMessage({ type: 'extract' })).toBeNull();
  });

  it('rejects extract with an unknown scope', () => {
    expect(unwrapUiMessage({ type: 'extract', scope: 'document' })).toBeNull();
  });

  const change = {
    nodeId: '1:1',
    layerName: 'Title',
    before: 'old',
    after: 'new',
    source: 'import',
    accepted: true,
  };

  it('accepts plan-import with well-formed rows', () => {
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(unwrapUiMessage({ type: 'plan-import', rows })).toEqual({
      type: 'plan-import',
      rows,
    });
  });

  it('rejects plan-import without rows', () => {
    expect(unwrapUiMessage({ type: 'plan-import' })).toBeNull();
  });

  it('rejects plan-import whose rows are not layer records', () => {
    expect(unwrapUiMessage({ type: 'plan-import', rows: [{ id: 1 }] })).toBeNull();
    expect(unwrapUiMessage({ type: 'plan-import', rows: 'not an array' })).toBeNull();
  });

  // Each of these omits exactly one field, so the check for that field is the
  // only thing that can reject the row. A fixture missing two fields at once
  // would pass even if one of the two checks were deleted.
  it('rejects a row missing only id', () => {
    expect(
      unwrapUiMessage({ type: 'plan-import', rows: [{ name: 'A', characters: 'x' }] })
    ).toBeNull();
  });

  it('rejects a row missing only name', () => {
    expect(
      unwrapUiMessage({ type: 'plan-import', rows: [{ id: '1:1', characters: 'x' }] })
    ).toBeNull();
  });

  it('rejects a row missing only characters', () => {
    expect(
      unwrapUiMessage({ type: 'plan-import', rows: [{ id: '1:1', name: 'A' }] })
    ).toBeNull();
  });

  it('accepts apply with well-formed changes', () => {
    expect(unwrapUiMessage({ type: 'apply', changes: [change] })).toEqual({
      type: 'apply',
      changes: [change],
    });
  });

  it('rejects apply whose changes are not proposals', () => {
    expect(unwrapUiMessage({ type: 'apply', changes: [{ nodeId: 1 }] })).toBeNull();
  });

  it('rejects apply without changes', () => {
    expect(unwrapUiMessage({ type: 'apply' })).toBeNull();
  });

  // One case per field, each breaking that field alone on an otherwise valid
  // change. `{ nodeId: 1 }` fails on the first check, so without these no
  // later check is ever the deciding factor in any test.
  const broken: Array<[string, Record<string, unknown>]> = [
    ['a non-string nodeId', { ...change, nodeId: 1 }],
    ['a non-string layerName', { ...change, layerName: 7 }],
    ['no before text', omit(change, 'before')],
    ['no after text', omit(change, 'after')],
    ['a source outside the known set', { ...change, source: 'banana' }],
    ['a non-string source', { ...change, source: 3 }],
    ['a non-boolean accepted', { ...change, accepted: 'yes' }],
  ];

  for (const [label, bad] of broken) {
    it(`rejects a change with ${label}`, () => {
      expect(unwrapUiMessage({ type: 'apply', changes: [bad] })).toBeNull();
    });
  }

  it('accepts ui-ready in either envelope', () => {
    expect(unwrapUiMessage({ type: 'ui-ready' })).toEqual({ type: 'ui-ready' });
    expect(unwrapUiMessage({ pluginMessage: { type: 'ui-ready' } })).toEqual({
      type: 'ui-ready',
    });
  });

  it('rejects a ui-ready that is not a message at all', () => {
    // The type is the entire payload, so the only way to get it wrong is to
    // send something that never reaches the discriminant.
    expect(unwrapUiMessage({ type: 'ui-readyy' })).toBeNull();
    expect(unwrapUiMessage({ pluginMessage: { type: 42 } })).toBeNull();
  });

  it('no longer recognises the old import message', () => {
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(unwrapUiMessage({ type: 'import', rows })).toBeNull();
  });

  it('accepts a search message', () => {
    expect(
      unwrapUiMessage({
        type: 'search',
        query: 'Sign up',
        scope: 'page',
        caseSensitive: false,
        wholeWord: true,
        regex: false,
      })
    ).toEqual({
      type: 'search',
      query: 'Sign up',
      scope: 'page',
      caseSensitive: false,
      wholeWord: true,
      regex: false,
    });
  });

  it('rejects a search message whose query is not a string', () => {
    expect(
      unwrapUiMessage({ type: 'search', query: 5, scope: 'page', caseSensitive: false, wholeWord: false, regex: false })
    ).toBeNull();
  });

  it('rejects a search message whose scope is not a known scope', () => {
    expect(
      unwrapUiMessage({ type: 'search', query: 'x', scope: 'everywhere', caseSensitive: false, wholeWord: false, regex: false })
    ).toBeNull();
  });

  it('rejects a search message whose caseSensitive is not a boolean', () => {
    expect(
      unwrapUiMessage({ type: 'search', query: 'x', scope: 'page', caseSensitive: 'yes', wholeWord: false, regex: false })
    ).toBeNull();
  });

  it('rejects a search message whose wholeWord is not a boolean', () => {
    expect(
      unwrapUiMessage({ type: 'search', query: 'x', scope: 'page', caseSensitive: false, wholeWord: 1, regex: false })
    ).toBeNull();
  });

  it('accepts a plan-replace message', () => {
    expect(
      unwrapUiMessage({
        type: 'plan-replace',
        query: 'Sign up',
        replacement: 'Get started',
        targets: [{ nodeId: '1:1', layerName: 'Hero' }],
        scope: 'selection',
        caseSensitive: true,
        wholeWord: false,
        regex: false,
      })
    ).toEqual({
      type: 'plan-replace',
      query: 'Sign up',
      replacement: 'Get started',
      targets: [{ nodeId: '1:1', layerName: 'Hero' }],
      scope: 'selection',
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    });
  });

  it('rejects a plan-replace message whose replacement is missing', () => {
    expect(
      unwrapUiMessage({
        type: 'plan-replace',
        query: 'x',
        targets: [],
        scope: 'page',
        caseSensitive: false,
        wholeWord: false,
        regex: false,
      })
    ).toBeNull();
  });

  it('rejects a plan-replace target without a nodeId', () => {
    expect(
      unwrapUiMessage({
        type: 'plan-replace',
        query: 'x',
        replacement: 'y',
        targets: [{ layerName: 'Hero' }],
        scope: 'page',
        caseSensitive: false,
        wholeWord: false,
        regex: false,
      })
    ).toBeNull();
  });

  it('rejects a plan-replace target without a layerName', () => {
    expect(
      unwrapUiMessage({
        type: 'plan-replace',
        query: 'x',
        replacement: 'y',
        targets: [{ nodeId: '1:1' }],
        scope: 'page',
        caseSensitive: false,
        wholeWord: false,
        regex: false,
      })
    ).toBeNull();
  });

  // One case per remaining plan-replace check, each breaking that field alone
  // on an otherwise valid message. Without these, deleting any of the four
  // leaves the suite green -- `search` has its own fixtures, but they exercise
  // a different case of the switch.
  const replaceMessage = {
    type: 'plan-replace',
    query: 'Sign up',
    replacement: 'Get started',
    targets: [{ nodeId: '1:1', layerName: 'Hero' }],
    scope: 'page',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  };

  const badReplace: Array<[string, Record<string, unknown>]> = [
    ['query is not a string', { ...replaceMessage, query: 5 }],
    ['scope is not a known scope', { ...replaceMessage, scope: 'everywhere' }],
    ['caseSensitive is not a boolean', { ...replaceMessage, caseSensitive: 'yes' }],
    ['wholeWord is not a boolean', { ...replaceMessage, wholeWord: 1 }],
    ['regex is not a boolean', { ...replaceMessage, regex: 'yes' }],
    ['target picks occurrences without the text they were picked in', {
      ...replaceMessage,
      targets: [{ nodeId: '1:1', layerName: 'Hero', occurrences: [0] }],
    }],
    ['target picks a negative occurrence', {
      ...replaceMessage,
      targets: [{ nodeId: '1:1', layerName: 'Hero', occurrences: [-1], expected: 'x' }],
    }],
    ['target picks a fractional occurrence', {
      ...replaceMessage,
      targets: [{ nodeId: '1:1', layerName: 'Hero', occurrences: [0.5], expected: 'x' }],
    }],
    ['target carries a non-string expected', {
      ...replaceMessage,
      targets: [{ nodeId: '1:1', layerName: 'Hero', expected: 5 }],
    }],
  ];

  it('accepts a plan-replace target with chosen occurrences and the text they were chosen in', () => {
    const targets = [{ nodeId: '1:1', layerName: 'Hero', occurrences: [0, 2], expected: 'a b a b a' }];
    expect(unwrapUiMessage({ ...replaceMessage, targets })).toEqual({ ...replaceMessage, targets });
  });

  it('rejects a search message whose regex is not a boolean', () => {
    expect(
      unwrapUiMessage({ type: 'search', query: 'x', scope: 'page', caseSensitive: false, wholeWord: false, regex: 1 })
    ).toBeNull();
  });

  for (const [label, bad] of badReplace) {
    it(`rejects a plan-replace message whose ${label}`, () => {
      expect(unwrapUiMessage(bad)).toBeNull();
    });
  }

  it('accepts a navigate message', () => {
    expect(unwrapUiMessage({ type: 'navigate', nodeId: '1:1' })).toEqual({
      type: 'navigate',
      nodeId: '1:1',
    });
  });

  it('rejects a navigate message whose nodeId is not a string', () => {
    expect(unwrapUiMessage({ type: 'navigate', nodeId: null })).toBeNull();
  });
});

describe('unwrapMainMessage', () => {
  it('reads a typed main message', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'no-text-found' } }))
      .toEqual({ type: 'no-text-found' });
  });

  it('returns null for a UI-bound type', () => {
    expect(unwrapMainMessage({ type: 'cancel' })).toBeNull();
    expect(unwrapMainMessage({ type: 'ui-ready' })).toBeNull();
  });

  it('rejects import-complete with missing counts', () => {
    expect(unwrapMainMessage({ type: 'import-complete', updated: 1 })).toBeNull();
  });

  it('rejects error without a message string', () => {
    expect(unwrapMainMessage({ type: 'error' })).toBeNull();
  });

  it('accepts an extracted message and keeps its rows', () => {
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(unwrapMainMessage({ pluginMessage: { type: 'extracted', rows } })).toEqual({
      type: 'extracted',
      rows,
    });
  });

  it('rejects extracted whose rows are not layer records', () => {
    expect(
      unwrapMainMessage({ pluginMessage: { type: 'extracted', rows: [{ id: 1 }] } })
    ).toBeNull();
    expect(
      unwrapMainMessage({ pluginMessage: { type: 'extracted', rows: [{ characters: 'x' }] } })
    ).toBeNull();
  });

  it('accepts an import-complete message and keeps its counts', () => {
    expect(
      unwrapMainMessage({
        pluginMessage: {
          type: 'import-complete',
          updated: 3,
          failed: 1,
          errors: ['boom'],
        },
      })
    ).toEqual({ type: 'import-complete', updated: 3, failed: 1, errors: ['boom'] });
  });

  it('accepts an error message and keeps its text', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'error', message: 'nope' } })).toEqual(
      { type: 'error', message: 'nope' }
    );
  });

  it('reads the envelope the UI actually receives at runtime', () => {
    // figma.ui.postMessage arrives in the iframe as event.data.pluginMessage.
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(
      unwrapMainMessage({ data: { pluginMessage: { type: 'extracted', rows } } })
    ).toEqual({ type: 'extracted', rows });
  });

  const change = {
    nodeId: '1:1',
    layerName: 'Title',
    before: 'old',
    after: 'new',
    source: 'import',
    accepted: true,
  };

  it('accepts a change-set and keeps its contents', () => {
    const changeSet = {
      changes: [change],
      blocked: [{ nodeId: '1:2', layerName: 'Gone', reason: 'missing' }],
      unchangedCount: 7,
      createdAt: 1700000000000,
    };
    expect(unwrapMainMessage({ pluginMessage: { type: 'change-set', changeSet } })).toEqual(
      { type: 'change-set', changeSet }
    );
  });

  it('rejects a change-set missing its counts', () => {
    expect(
      unwrapMainMessage({
        pluginMessage: {
          type: 'change-set',
          changeSet: { changes: [], blocked: [] },
        },
      })
    ).toBeNull();
  });

  it('rejects a change-set whose blocked reason is unknown', () => {
    expect(
      unwrapMainMessage({
        pluginMessage: {
          type: 'change-set',
          changeSet: {
            changes: [],
            blocked: [{ nodeId: '1:1', layerName: 'x', reason: 'banana' }],
            unchangedCount: 0,
            createdAt: 1,
          },
        },
      })
    ).toBeNull();
  });

  it('accepts a selection message reporting a present selection', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'selection', present: true } })).toEqual(
      { type: 'selection', present: true }
    );
  });

  it('accepts a selection message reporting no selection', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'selection', present: false } })).toEqual(
      { type: 'selection', present: false }
    );
  });

  it('rejects a selection message missing present', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'selection' } })).toBeNull();
  });

  it('rejects a selection message whose present is not a boolean', () => {
    expect(
      unwrapMainMessage({ pluginMessage: { type: 'selection', present: 'yes' } })
    ).toBeNull();
  });

  it('accepts search results', () => {
    const matches = [
      { nodeId: '1:1', layerName: 'Hero', characters: 'Sign up free', matchCount: 1 },
    ];
    expect(unwrapMainMessage({ type: 'search-results', matches, scope: 'page' })).toEqual({
      type: 'search-results',
      matches,
      scope: 'page',
    });
  });

  it('rejects search results whose matchCount is not a number', () => {
    expect(
      unwrapMainMessage({
        type: 'search-results',
        matches: [{ nodeId: '1:1', layerName: 'Hero', characters: 'x', matchCount: 'one' }],
        scope: 'page',
      })
    ).toBeNull();
  });

  it('rejects search results whose characters field is missing', () => {
    expect(
      unwrapMainMessage({
        type: 'search-results',
        matches: [{ nodeId: '1:1', layerName: 'Hero', matchCount: 1 }],
        scope: 'page',
      })
    ).toBeNull();
  });

  // The other two fields of a match, each broken alone on an otherwise valid
  // row -- `characters` and `matchCount` are pinned above, these were not.
  it('rejects search results whose nodeId is not a string', () => {
    expect(
      unwrapMainMessage({
        type: 'search-results',
        matches: [{ nodeId: 1, layerName: 'Hero', characters: 'x', matchCount: 1 }],
        scope: 'page',
      })
    ).toBeNull();
  });

  it('rejects search results whose layerName is missing', () => {
    expect(
      unwrapMainMessage({
        type: 'search-results',
        matches: [{ nodeId: '1:1', characters: 'x', matchCount: 1 }],
        scope: 'page',
      })
    ).toBeNull();
  });

  it('rejects search results whose scope is unknown', () => {
    expect(unwrapMainMessage({ type: 'search-results', matches: [], scope: 'all' })).toBeNull();
  });

  it('accepts a change set carrying a scope', () => {
    const changeSet = { changes: [], blocked: [], unchangedCount: 0, createdAt: 1, scope: 'page' };
    expect(unwrapMainMessage({ type: 'change-set', changeSet })).toEqual({
      type: 'change-set',
      changeSet,
    });
  });

  it('rejects a change set whose scope is unknown', () => {
    expect(
      unwrapMainMessage({
        type: 'change-set',
        changeSet: { changes: [], blocked: [], unchangedCount: 0, createdAt: 1, scope: 'all' },
      })
    ).toBeNull();
  });
});

describe('task messages', () => {
  it('accepts stop-task, which carries nothing', () => {
    expect(unwrapUiMessage({ type: 'stop-task' })).toEqual({ type: 'stop-task' });
  });

  it('accepts a progress report', () => {
    const msg = { type: 'progress', task: 'search', done: 4200, total: 20000 };
    expect(unwrapMainMessage(msg)).toEqual(msg);
  });

  it('accepts progress at zero of zero, which an empty page reports', () => {
    const msg = { type: 'progress', task: 'extract', done: 0, total: 0 };
    expect(unwrapMainMessage(msg)).toEqual(msg);
  });

  // Each breaks exactly one check on an otherwise valid report.
  const brokenProgress: Array<[string, Record<string, unknown>]> = [
    ['an unknown task', { task: 'export', done: 1, total: 2 }],
    ['a non-numeric done', { task: 'search', done: '1', total: 2 }],
    ['a fractional done', { task: 'search', done: 1.5, total: 2 }],
    ['a negative done', { task: 'search', done: -1, total: 2 }],
    ['a non-numeric total', { task: 'search', done: 1, total: null }],
    ['done beyond total', { task: 'search', done: 3, total: 2 }],
  ];
  for (const [label, fields] of brokenProgress) {
    it(`rejects progress with ${label}`, () => {
      expect(unwrapMainMessage({ type: 'progress', ...fields })).toBeNull();
    });
  }

  it('accepts task-stopped for each task kind', () => {
    for (const task of ['extract', 'search', 'plan', 'apply']) {
      expect(unwrapMainMessage({ type: 'task-stopped', task })).toEqual({
        type: 'task-stopped',
        task,
      });
    }
  });

  it('rejects task-stopped without a known task', () => {
    expect(unwrapMainMessage({ type: 'task-stopped' })).toBeNull();
    expect(unwrapMainMessage({ type: 'task-stopped', task: 'toString' })).toBeNull();
  });
});

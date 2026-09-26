/** One Figma text layer, as it crosses the sandbox/UI boundary. */
export interface TextLayerData {
  id: string;
  name: string;
  characters: string;
  /**
   * The name of the layer's top-level frame, set by extract so document
   * exports can group by it. Never written to CSV or JSON, and never read
   * from an imported file.
   */
  frame?: string;
}

/**
 * Which roots a document walk starts from. See spec section 3.1. `document` is
 * every page in the file (local features spec §3).
 */
export type Scope = 'selection' | 'page' | 'document';

/** How a query is compared against a layer's text. See spec section 3.4. */
export interface MatchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Treat the query as a regular expression. Off by default. */
  regex: boolean;
}

/** One layer the query occurs in. See spec section 3.4. */
export interface SearchMatch {
  nodeId: string;
  layerName: string;
  characters: string;   // the layer's current text
  matchCount: number;
}

/**
 * A text export. CSV and JSON round-trip through import; the rest are for
 * reading and sharing (local features spec §4).
 */
export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'docx' | 'md' | 'epub';

/**
 * A long piece of document work the sandbox reports progress on. Only one runs
 * at a time. See docs/superpowers/specs/2026-09-26-large-documents-design.md §5.
 */
export type TaskKind = 'extract' | 'search' | 'plan' | 'apply' | 'export' | 'generate';

/** A text change the user may accept. See spec section 3. */
export interface ProposedChange {
  nodeId: string;
  layerName: string;
  before: string;
  after: string;
  source: 'import' | 'find-replace' | 'snippet';
  accepted: boolean;      // the user's decision in review
}

/** A row naming a target the document cannot offer. Never applied. */
export interface BlockedChange {
  nodeId: string;
  layerName: string;
  /**
   * `changed`: the user picked some occurrences in a layer whose text has
   * changed since the search, so the picked indices may name other matches.
   */
  reason: 'missing' | 'not-text' | 'changed';
}

/** One node the user chose to replace in. See spec section 3.4. */
export interface ReplaceTarget {
  nodeId: string;
  /**
   * Carried so a node deleted between searching and replacing can still be
   * named in the blocked row; a missing node cannot be asked its name.
   */
  layerName: string;
  /**
   * The occurrences to replace, by index among the layer's matches (0-based,
   * left to right). Absent: replace every occurrence.
   */
  occurrences?: number[];
  /**
   * The layer's text when it was searched. Required with `occurrences`: the
   * indices only mean something against this text.
   */
  expected?: string;
}

export interface ChangeSet {
  changes: ProposedChange[];   // only rows whose text actually differs
  blocked: BlockedChange[];    // shown in review, never selectable
  unchangedCount: number;      // counted, not listed
  createdAt: number;
  /**
   * Set when a traversal produced this set, so the UI can tell whether a
   * selection change invalidates it. Absent for 'import', whose targets come
   * from a file. See spec section 3.1.
   */
  scope?: Scope;
}

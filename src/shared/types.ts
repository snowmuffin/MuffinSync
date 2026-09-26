/** One Figma text layer, as it crosses the sandbox/UI boundary. */
export interface TextLayerData {
  id: string;
  name: string;
  characters: string;
}

/** Which roots a document walk starts from. See spec section 3.1. */
export type Scope = 'selection' | 'page';

/** How a query is compared against a layer's text. See spec section 3.4. */
export interface MatchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

/** One layer the query occurs in. See spec section 3.4. */
export interface SearchMatch {
  nodeId: string;
  layerName: string;
  characters: string;   // the layer's current text
  matchCount: number;
}

export type ExportFormat = 'csv' | 'json';

/** A text change the user may accept. See spec section 3. */
export interface ProposedChange {
  nodeId: string;
  layerName: string;
  before: string;
  after: string;
  source: 'import' | 'find-replace';
  accepted: boolean;      // the user's decision in review
}

/** A row naming a target the document cannot offer. Never applied. */
export interface BlockedChange {
  nodeId: string;
  layerName: string;
  reason: 'missing' | 'not-text';
}

/** One node the user chose to replace in. See spec section 3.4. */
export interface ReplaceTarget {
  nodeId: string;
  /**
   * Carried so a node deleted between searching and replacing can still be
   * named in the blocked row; a missing node cannot be asked its name.
   */
  layerName: string;
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

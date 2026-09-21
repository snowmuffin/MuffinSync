/** One Figma text layer, as it crosses the sandbox/UI boundary. */
export interface TextLayerData {
  id: string;
  name: string;
  characters: string;
}

/** Which roots a document walk starts from. See spec section 3.1. */
export type Scope = 'selection' | 'page';

export type ExportFormat = 'csv' | 'json';

const EXPORT_FORMATS: readonly string[] = ['csv', 'json'];

export function isExportFormat(value: string): value is ExportFormat {
  return EXPORT_FORMATS.includes(value);
}

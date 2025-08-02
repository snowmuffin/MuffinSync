// Global type definitions for Figma Plugin

declare const figma: PluginAPI;
declare const __html__: string;

interface PluginAPI {
  showUI(html: string, options?: ShowUIOptions): void;
  closePlugin(message?: string): void;
  ui: UIAPI;
  currentPage: PageNode;
  getNodeById(id: string): SceneNode | null;
  getNodeByIdAsync(id: string): Promise<BaseNode | null>;
  loadFontAsync(fontName: FontName): Promise<void>;
}

interface UIAPI {
  postMessage(message: any): void;
  onmessage: ((event: { data: { pluginMessage: any } }) => void) | null;
}

interface ShowUIOptions {
  width?: number;
  height?: number;
  themeColors?: boolean;
}

interface BaseNode {
  readonly id: string;
  readonly parent: (BaseNode & ChildrenMixin) | null;
  name: string;
  readonly removed: boolean;
  readonly type: NodeType;
}

interface SceneNode extends BaseNode {
  visible: boolean;
  locked: boolean;
}

interface TextNode extends SceneNode {
  readonly type: "TEXT";
  characters: string;
  fontName: FontName | PluginAPI['mixed'];
}

interface PageNode extends BaseNode {
  readonly type: "PAGE";
  children: ReadonlyArray<SceneNode>;
  selection: ReadonlyArray<SceneNode>;
}

interface ChildrenMixin {
  readonly children: ReadonlyArray<SceneNode>;
}

interface FontName {
  readonly family: string;
  readonly style: string;
}

type NodeType = "PAGE" | "FRAME" | "GROUP" | "COMPONENT_SET" | "COMPONENT" | "INSTANCE" | "BOOLEAN_OPERATION" | "VECTOR" | "STAR" | "LINE" | "ELLIPSE" | "POLYGON" | "RECTANGLE" | "TEXT" | "SLICE" | "STICKY" | "SHAPE_WITH_TEXT" | "CONNECTOR" | "SECTION" | "WIDGET" | "EMBED" | "LINK_UNFURL" | "MEDIA";

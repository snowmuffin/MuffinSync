/**
 * The test document: one new page of frames, texts, a hidden frame, a
 * component instance with a hidden child, a mixed-font layer, twins that share
 * a path, and a merge template -- plus one frame on the page the run started
 * from, so there is a layer on another page. Only one page is created: Figma's
 * Starter plan allows three per file. Everything is removed afterwards.
 */

export const REGULAR: FontName = { family: 'Inter', style: 'Regular' };
export const BOLD: FontName = { family: 'Inter', style: 'Bold' };

export interface Fixture {
  page: PageNode;
  /** The page the run started from; holds `otherFrame` during the run. */
  otherPage: PageNode;
  otherFrame: FrameNode;
  home: FrameNode;
  title: TextNode;
  body: TextNode;
  mixed: TextNode;
  quote: TextNode;
  hiddenFrame: FrameNode;
  secret: TextNode;
  instance: InstanceNode;
  twins: FrameNode;
  template: FrameNode;
  loose: TextNode;
  elsewhere: TextNode;
}

export function text(parent: BaseNode & ChildrenMixin, name: string, characters: string, y = 0): TextNode {
  const node = figma.createText();
  node.fontName = REGULAR;
  node.characters = characters;
  node.name = name;
  node.y = y;
  parent.appendChild(node);
  return node;
}

export function frame(parent: BaseNode & ChildrenMixin, name: string, x: number, y = 0): FrameNode {
  const node = figma.createFrame();
  node.name = name;
  node.resize(360, 240);
  node.x = x;
  node.y = y;
  parent.appendChild(node);
  return node;
}

/** Figma refuses a page beyond the plan's limit; say what to do about it. */
export function newPage(name: string): PageNode {
  try {
    const page = figma.createPage();
    page.name = name;
    return page;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not add a test page (${reason}). The self-test needs room for one more page: ` +
        'run it in a new file, or one with fewer pages than your plan allows.'
    );
  }
}

export async function buildFixture(otherPage: PageNode): Promise<Fixture> {
  await Promise.all([figma.loadFontAsync(REGULAR), figma.loadFontAsync(BOLD)]);

  const page = newPage('Copydesk self-test');
  let otherFrame: FrameNode | null = null;
  try {
    return await populate(page, otherPage, (made) => (otherFrame = made));
  } catch (error) {
    // Half a fixture is still the user's clutter: take it away before failing.
    await figma.setCurrentPageAsync(otherPage);
    if (otherFrame && !(otherFrame as FrameNode).removed) (otherFrame as FrameNode).remove();
    if (!page.removed) page.remove();
    throw error;
  }
}

async function populate(
  page: PageNode,
  otherPage: PageNode,
  onOtherFrame: (frame: FrameNode) => void
): Promise<Fixture> {
  await figma.setCurrentPageAsync(page);

  const home = frame(page, 'Home', 0);
  const title = text(home, 'Title', 'Welcome home', 0);
  const body = text(home, 'Body', 'Sign up  today ', 40);
  const mixed = text(home, 'Mixed', 'Bold start, regular end', 80);
  mixed.setRangeFontName(0, 10, BOLD);
  const quote = text(home, 'Quote', 'He said "hi"', 120);

  const hiddenFrame = frame(page, 'Hidden frame', 400);
  const secret = text(hiddenFrame, 'Secret', 'Secret text');
  hiddenFrame.visible = false;

  const card = figma.createComponent();
  card.name = 'Card';
  card.resize(200, 80);
  card.x = 800;
  page.appendChild(card);
  text(card, 'Card title', 'Card title', 0);
  text(card, 'Card note', 'Card note', 30);
  const instance = card.createInstance();
  instance.x = 800;
  instance.y = 300;
  page.appendChild(instance);
  instance.children[1].visible = false;

  const twins = frame(page, 'Twins', 1200);
  text(twins, 'Text', 'First twin', 0);
  text(twins, 'Text', 'Second twin', 40);

  const template = frame(page, 'Template', 1600);
  text(template, 'Greeting', 'Hello {{Name}}', 0);
  text(template, 'Plan', '{{ Plan }} plan', 40);
  text(template, 'Typo', '{{Nmae}}', 80);

  const loose = text(page, 'Loose', 'Loose text');
  loose.x = 2000;

  // Far from anything the user has on that page, and removed afterwards.
  const otherFrame = frame(otherPage, 'Copydesk self-test (temporary)', -100000, -100000);
  onOtherFrame(otherFrame);
  const elsewhere = text(otherFrame, 'Elsewhere', 'Sign up elsewhere');

  return { page, otherPage, otherFrame, home, title, body, mixed, quote, hiddenFrame, secret, instance, twins, template, loose, elsewhere };
}

export async function removeFixture(fixture: Fixture, returnTo: PageNode): Promise<void> {
  await figma.setCurrentPageAsync(returnTo);
  if (!fixture.otherFrame.removed) fixture.otherFrame.remove();
  if (!fixture.page.removed) fixture.page.remove();
}

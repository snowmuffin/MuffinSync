/**
 * The test document: two pages of frames, texts, a hidden frame, a component
 * instance with a hidden child, a mixed-font layer, twins that share a path,
 * and a merge template. Built fresh for every run and removed afterwards.
 */

export const REGULAR: FontName = { family: 'Inter', style: 'Regular' };
export const BOLD: FontName = { family: 'Inter', style: 'Bold' };

export interface Fixture {
  page: PageNode;
  otherPage: PageNode;
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

export async function buildFixture(): Promise<Fixture> {
  await Promise.all([figma.loadFontAsync(REGULAR), figma.loadFontAsync(BOLD)]);

  const page = figma.createPage();
  page.name = 'Copydesk self-test';
  const otherPage = figma.createPage();
  otherPage.name = 'Copydesk self-test 2';
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

  const other = frame(otherPage, 'Other', 0);
  const elsewhere = text(other, 'Elsewhere', 'Sign up elsewhere');

  return { page, otherPage, home, title, body, mixed, quote, hiddenFrame, secret, instance, twins, template, loose, elsewhere };
}

export async function removeFixture(fixture: Fixture, returnTo: PageNode): Promise<void> {
  await figma.setCurrentPageAsync(returnTo);
  for (const page of [fixture.page, fixture.otherPage]) {
    if (!page.removed) page.remove();
  }
}

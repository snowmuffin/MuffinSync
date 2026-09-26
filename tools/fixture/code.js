// Copydesk fixture plugin -- development only, never published.
//
// Builds pages with thousands of text layers and times the paths Copydesk
// runs over them, for Stage C0 of
// docs/superpowers/specs/2026-09-26-large-documents-design.md.
//
// Plain JavaScript with no build step, so it runs straight from this folder:
// Plugins -> Development -> Import plugin from manifest -> tools/fixture/manifest.json

const FONT = { family: 'Inter', style: 'Regular' };
const TEXTS_PER_FRAME = 20;
const FRAMES_PER_SECTION = 10;
const TEXTS_PER_CARD = 3;
/** Share of layers that live inside component instances. */
const INSTANCE_SHARE = 0.1;
/** Every Nth plain text layer is hidden, as real files have some. */
const HIDDEN_EVERY = 50;

const WORDS = [
  'Sign up', 'Continue', 'Welcome back', 'Your order', 'Settings', 'Learn more',
  'Get started', 'Privacy policy', 'Try again', 'Save changes', 'Hello world',
  'Pricing', 'Contact us', 'Download', 'Terms of service',
];

function now() {
  return Date.now();
}

/** Lets Figma repaint and deliver messages between batches. */
function breathe() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function textFor(i) {
  return WORDS[i % WORDS.length] + ' ' + i;
}

async function createText(parent, i, x, y) {
  const node = figma.createText();
  node.fontName = FONT;
  node.characters = textFor(i);
  node.name = 'Text ' + i;
  node.x = x;
  node.y = y;
  parent.appendChild(node);
  return node;
}

async function buildCard() {
  const card = figma.createComponent();
  card.name = 'Card';
  card.resize(200, 90);
  const labels = ['Card title', 'Card body text', 'Card action'];
  for (let i = 0; i < TEXTS_PER_CARD; i++) {
    const text = figma.createText();
    text.fontName = FONT;
    text.characters = labels[i];
    text.name = labels[i];
    text.y = i * 26;
    card.appendChild(text);
  }
  return card;
}

async function createFixture(total) {
  await figma.loadFontAsync(FONT);

  const page = figma.createPage();
  page.name = 'Fixture - ' + total.toLocaleString('en-US') + ' text layers';
  await figma.setCurrentPageAsync(page);

  const card = await buildCard();
  page.appendChild(card);
  let made = TEXTS_PER_CARD;

  const instanceCount = Math.floor((total * INSTANCE_SHARE) / TEXTS_PER_CARD);
  const instanceRow = figma.createFrame();
  instanceRow.name = 'Instances';
  instanceRow.x = 0;
  instanceRow.y = 200;
  instanceRow.resize(220 * 20, 110 * Math.ceil(instanceCount / 20) + 20);
  page.appendChild(instanceRow);
  for (let i = 0; i < instanceCount; i++) {
    const instance = card.createInstance();
    instance.x = (i % 20) * 220;
    instance.y = Math.floor(i / 20) * 110;
    instanceRow.appendChild(instance);
    // Some instances hide a child, so skipInvisibleInstanceChildren has
    // something to skip.
    if (i % 10 === 9) instance.children[1].visible = false;
    made += TEXTS_PER_CARD;
  }

  let section = null;
  let frame = null;
  let sectionIndex = 0;
  let frameIndex = 0;
  let i = 0;
  const top = instanceRow.y + instanceRow.height + 200;

  while (made < total) {
    if (i % (TEXTS_PER_FRAME * FRAMES_PER_SECTION) === 0) {
      section = figma.createFrame();
      section.name = 'Section ' + sectionIndex;
      section.x = sectionIndex * 2400;
      section.y = top;
      section.resize(2300, FRAMES_PER_SECTION * 560);
      page.appendChild(section);
      sectionIndex++;
      frameIndex = 0;
    }
    if (i % TEXTS_PER_FRAME === 0) {
      frame = figma.createFrame();
      frame.name = 'Frame ' + frameIndex;
      frame.x = 20;
      frame.y = frameIndex * 560;
      frame.resize(2200, 540);
      section.appendChild(frame);
      frameIndex++;
    }
    const slot = i % TEXTS_PER_FRAME;
    const text = await createText(frame, i, 20 + (slot % 4) * 520, 20 + Math.floor(slot / 4) * 100);
    if (i % HIDDEN_EVERY === HIDDEN_EVERY - 1) text.visible = false;
    i++;
    made++;
    if (made % 500 === 0) {
      figma.notify('Creating text layers... ' + made + ' / ' + total, { timeout: 800 });
      await breathe();
    }
  }

  figma.viewport.scrollAndZoomIntoView(page.children);
  figma.closePlugin('Created ' + made.toLocaleString('en-US') + ' text layers on "' + page.name + '".');
}

// --- Measurement -----------------------------------------------------------

/** Today's `collectTextLayers`: recursion over `children`, reading every node. */
function walk(node, found) {
  if (node.type === 'TEXT') {
    found.push({ id: node.id, name: node.name, characters: node.characters });
  }
  if ('children' in node) {
    for (const child of node.children) walk(child, found);
  }
}

function read(nodes) {
  const rows = [];
  for (const node of nodes) {
    rows.push({ id: node.id, name: node.name, characters: node.characters });
  }
  return rows;
}

function fontKey(font) {
  return font.family + '\u0000' + font.style;
}

function fontsOf(node) {
  if (node.fontName === figma.mixed) {
    return node.getRangeAllFontNames(0, node.characters.length);
  }
  return [node.fontName];
}

const UI = `
<style>
  body { font: 12px/1.4 -apple-system, system-ui, sans-serif; margin: 12px; color: #1e293b; }
  textarea { width: 100%; height: 300px; font: 11px/1.4 ui-monospace, monospace; }
  p { margin: 0 0 8px; }
</style>
<p id="state">Measuring... keep this window open.</p>
<textarea id="out" readonly></textarea>
<script>
  onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (!msg) return;
    if (msg.type === 'rows') {
      // Reply at once: the sandbox times the round trip.
      parent.postMessage({ pluginMessage: { type: 'ack', received: msg.rows.length } }, '*');
    } else if (msg.type === 'step') {
      document.getElementById('state').textContent = msg.text;
    } else if (msg.type === 'report') {
      document.getElementById('state').textContent =
        'Done. Copy everything below and paste it back into the Copydesk session.';
      const out = document.getElementById('out');
      out.value = msg.text;
      out.select();
    }
  };
</script>
`;

function step(text) {
  figma.ui.postMessage({ type: 'step', text: text });
}

function roundTrip(rows) {
  return new Promise((resolve) => {
    const start = now();
    figma.ui.onmessage = (msg) => {
      if (msg && msg.type === 'ack') resolve({ ms: now() - start, received: msg.received });
    };
    figma.ui.postMessage({ type: 'rows', rows: rows });
  });
}

async function measure() {
  figma.showUI(UI, { width: 440, height: 380 });
  const page = figma.currentPage;
  const results = {};
  const t = {};

  step('1/6 Walking the page by recursion (the panel may freeze)...');
  await breathe();
  let start = now();
  const walked = [];
  for (const child of page.children) walk(child, walked);
  t.walkRecursion = now() - start;
  results.textLayers = walked.length;

  step('2/6 findAllWithCriteria...');
  await breathe();
  start = now();
  const found = page.findAllWithCriteria({ types: ['TEXT'] });
  t.findAllWithCriteria = now() - start;
  start = now();
  const foundRows = read(found);
  t.readFoundNodes = now() - start;
  results.findCount = found.length;
  results.sameOrderAsRecursion =
    found.length === walked.length && foundRows.every((row, i) => row.id === walked[i].id);

  figma.skipInvisibleInstanceChildren = true;
  start = now();
  const visibleOnly = page.findAllWithCriteria({ types: ['TEXT'] });
  t.findAllSkippingInvisibleInstanceChildren = now() - start;
  figma.skipInvisibleInstanceChildren = false;
  results.findCountSkippingInvisibleInstanceChildren = visibleOnly.length;

  step('3/6 Sending every row to the UI...');
  await breathe();
  const trip = await roundTrip(walked);
  t.postMessageRoundTrip = trip.ms;
  results.rowsReceivedByUi = trip.received;

  step('4/6 Looking up every node by id (plan)...');
  await breathe();
  start = now();
  for (const row of walked) await figma.getNodeByIdAsync(row.id);
  t.getNodeByIdAsyncEach = now() - start;

  step('5/6 Apply without a font cache (writes each text back unchanged)...');
  await breathe();
  start = now();
  for (const node of found) {
    await Promise.all(fontsOf(node).map((font) => figma.loadFontAsync(font)));
    node.characters = node.characters;
  }
  t.applyNoFontCache = now() - start;

  step('6/6 Apply with a font cache...');
  await breathe();
  start = now();
  const loaded = new Set();
  for (const node of found) {
    const missing = fontsOf(node).filter((font) => !loaded.has(fontKey(font)));
    await Promise.all(missing.map((font) => figma.loadFontAsync(font)));
    missing.forEach((font) => loaded.add(fontKey(font)));
    node.characters = node.characters;
  }
  t.applyWithFontCache = now() - start;
  results.distinctFonts = loaded.size;

  const per1000 = (ms) => Math.round((ms / Math.max(results.textLayers, 1)) * 1000 * 10) / 10;
  const report = {
    page: page.name,
    results: results,
    timingsMs: t,
    msPer1000Layers: {
      walkRecursion: per1000(t.walkRecursion),
      readFoundNodes: per1000(t.readFoundNodes),
      getNodeByIdAsyncEach: per1000(t.getNodeByIdAsyncEach),
      applyNoFontCache: per1000(t.applyNoFontCache),
      applyWithFontCache: per1000(t.applyWithFontCache),
    },
    editorType: figma.editorType,
    measuredAt: new Date().toISOString(),
  };
  const text = JSON.stringify(report, null, 2);
  console.log('[Copydesk fixture]\n' + text);
  figma.ui.postMessage({ type: 'report', text: text });
}

const COUNTS = { 'create-1000': 1000, 'create-5000': 5000, 'create-20000': 20000 };

if (figma.command in COUNTS) {
  createFixture(COUNTS[figma.command]).catch((error) => figma.closePlugin('Failed: ' + error.message));
} else if (figma.command === 'measure') {
  measure().catch((error) => {
    console.error(error);
    figma.notify('Measurement failed: ' + error.message, { error: true });
  });
} else {
  figma.closePlugin('Pick a command from the plugin menu.');
}

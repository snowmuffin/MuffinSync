# 📝 Copydesk

**Extract, edit, find & replace, and review text layers in Figma**

Copydesk (formerly MuffinSync) is a powerful and user-friendly plugin for Figma, designed to streamline the workflow of extracting, editing, and importing text layers directly from your design files. This plugin facilitates efficient collaboration by allowing designers and content creators to modify text content externally and seamlessly integrate those changes back into their Figma projects.

## ✨ Key Features

### 1️⃣ Text Layer Extraction (Export)
- **Comprehensive Traversal**: Copydesk walks every text layer in the selection, the current page, or **all pages**, and can leave out hidden layers (**Include hidden layers**).
- **Detailed Extraction**: Extracts essential text layer information including:
  - `id`: Unique Figma Node ID
  - `name`: Descriptive layer name
  - `characters`: Actual text content of the layer
- **Automatic Downloads**: CSV or JSON for editing and importing back; **Excel, Word, Markdown or EPUB** for reading and sharing, with text grouped under each layer's top-level frame.
- **Frames to PDF**: **Export frames as PDF** saves the selected frames (or every top-level frame on the page) using Figma's own PDF export — one PDF, or a ZIP of PDFs for several.

### 2️⃣ Text Data Modification (External)
- **Flexible Editing**: The plugin allows the extracted CSV or JSON files to be opened in any external text editor (like VS Code or Notepad), enabling users to modify text content efficiently.
- ⚠️ **Important**: Users must avoid altering layer IDs or names to ensure proper functionality during the import phase.

### 3️⃣ Review, Then Apply (Import)
- **Nothing changes on file choice.** Selecting a file only parses it and shows what it would do — the plugin compares each row against the current document and presents a review screen before touching anything.
- **Three kinds of row.** Rows whose text would actually change are listed individually with their before/after text. Rows already matching the document are counted, not listed. Rows the document cannot take are listed under "Cannot apply" — because the layer id no longer exists, or the node is no longer a text layer — before anything is applied.
- **One row per layer.** A file that names the same layer id twice is rejected, listing the repeated ids, rather than guessing which row to keep.
- **Uncheck what you don't want.** Each changed row has its own checkbox (plus a "select all"); only checked rows are sent when you click Apply. Cancelling closes the review and applies nothing.
- **Automatic Font Handling**: Every font a text layer uses is loaded before its content is replaced. Layers with mixed fonts across character ranges are handled too — each range's font is loaded via `getRangeAllFontNames()`, so multi-font layers import without errors.

### 4️⃣ Find & Replace
- **Its own tab.** The plugin panel opens on Extract; the **Find** tab holds Find & Replace. It keeps its own Find/Replace text and matching options when you switch away and back; the scope choice (Selection, Current page or All pages) and Include hidden layers are shared between the two tabs by design — it's one choice with a visible copy in each panel, not two independent settings.
- **Two steps, same review screen as import.** Searching walks the chosen scope and lists every layer the query occurs in, with that layer's current text and how many times the query occurs in it. Pick which rows to act on; replacing re-reads each chosen layer, recomputes the replacement, and sends the result through the same review screen import uses — nothing is written to the document until it is applied there.
- **Leave "Replace with" empty to search without replacing.** The results list still shows where the query occurs, but with no checkboxes and no Replace button — only a Close button and each row's jump action.
- **Case sensitivity, whole word, and regular expressions.** By default a query is matched literally. Tick **Regular expression** to use a pattern; the replacement can then use `$1`, `$&`, `$<name>` and `$$`. An invalid pattern is reported before searching. A pathological pattern can stall the plugin — regular expressions are opt-in for that reason. Whole word treats letters by Unicode category rather than by script-specific word rules, so it is close to useless for languages that don't delimit words with spaces (e.g. Korean).
- **Matches are highlighted, and each one can be left alone.** Click a highlighted match to skip that occurrence; the row checkbox shows a dash when only some are chosen. If a layer's text changes between searching and replacing, a layer with only some occurrences chosen is listed under "Cannot apply" instead of guessing which occurrences you meant. **Select all** covers every row.
- **Long lists are paged.** Results and review show 200 rows at a time with a "Show more" button. Counts, "select all", Replace and Apply always cover every row, shown or not.
- **Jump to a layer without selecting it.** Any row whose layer is still in the document — in the results list or in review, including a "Cannot apply" row for a layer that is no longer a text layer — has a "Show" button that centres it in the viewport, switching page first if the layer is on another one. It never changes the current selection. A row for a layer that no longer exists has nothing to centre, so it has no "Show".

### 5️⃣ Large Documents
- **Work runs in slices.** Extracting, searching, checking what would change, and applying hand control back to Figma every few milliseconds, so the canvas keeps repainting on pages with thousands of text layers.
- **Progress you can see.** The status line counts up while a task runs, e.g. "Searching text layers... 4,200 of 20,000".
- **Stop.** Extract, search and the "checking what would change" step have a **Stop** button; stopping produces nothing and changes nothing. Applying has no Stop — a half-applied batch would no longer match what you reviewed — but it reports progress.
- **One task at a time.** Extract, Import and Search are unavailable while a task runs.

### 6️⃣ Generate
- **Data merge.** Select one template frame whose text uses `{{Column}}` tags, choose a CSV or JSON file, and get one copy per row beside the template, each named after the row's first column. Tags that match no column are left as written and listed.
- **Localized copies.** Select frames, choose an extracted CSV (or JSON) with a column added per language (`ko`, `ja`, …), and get one copy per frame and language, named `Frame — ko`. Layers without a translation keep the source text and are counted.
- Both add new frames only, can be undone with Figma's undo, show progress, and can be stopped — a stopped run removes the copies it made.

### 7️⃣ Snippets
- **A personal library.** Save named pieces of text; they're kept with `figma.clientStorage`, on this device, for your Figma account — they never leave the machine.
- **Use them two ways.** **Apply to selection** puts the snippet into every text layer in the selection, through the same review screen as import. **Add as layer** creates a new text layer in the middle of the view.

### 8️⃣ Check
- **Rule-based copy checks** over the selection, page or all pages: double spaces, leading or trailing spaces, space before punctuation, repeated words, three dots (`...` → `…`), straight quotes, placeholder text (Lorem ipsum, TODO, TBD…), empty layers. Turn rules on or off; three dots and straight quotes are off by default.
- **Glossary.** List terms to avoid and what to use instead (`Log in → Sign in`). The glossary is saved in the file, so everyone editing it checks against the same list; import and export it as CSV.
- **Fix through review.** Findings are highlighted per layer with a checkbox per rule; **Fix** recomputes the fixes on each layer's current text and sends them to the review screen. Placeholder and empty findings are shown, not fixed.

### 9️⃣ Conveniences
- **Remembered settings**: the tab, scope, hidden-layer choice, match options, context columns and check rules come back next time.
- **Menu entries**: Plugins → Copydesk → Extract & import, Find & replace, Check copy, Generate or Snippets opens that tab directly.
- **Copy JSON / Paste to import**: move copy to a chat, a translation tool or a doc and back without saving files. Pasted text goes through the same review as a file.
- **Statistics**: after extracting, layers, words and characters, in total and per frame.
- **Context columns**: tick **Add context columns** to include `path` (e.g. `Checkout / Summary / Total`) and `length` in CSV and JSON. Import ignores them — except that a row whose id no longer exists is matched to the layer at the same path, so an edited file can be imported into a duplicated design.

## 🚀 How to Use

1. **Run the Plugin**: Access the plugin via Plugins > Copydesk in your Figma application.
2. **Extract Text**:
   - Choose the extraction scope: **Selection** (the layers inside what's currently selected) or **Current page** (everything on the page). Selection is disabled when nothing is selected.
   - Click the "Extract Text Layers" button to initiate the export.
   - Download the result with **CSV Download** or **JSON Download**.
3. **Edit Externally**: Open the saved file in your preferred text editor, make necessary text changes, and save the file.
4. **Import Changes**: Use the "Select File to Import" button to choose your edited file. The plugin shows a review screen listing what would change; uncheck anything you don't want and click **Apply** to write the accepted changes, or **Cancel** to close the review without changing anything.
5. **Find & Replace**: Switch to the **Find** tab. Type the text to find, and optionally what to replace it with; choose Selection, Current page or All pages, then click **Search** (or press Enter). The results list shows every matching layer with its text and match count. Uncheck any layers you don't want, then click **Replace N layers** to send them to the same review screen import uses, or **Close** to leave the document untouched. Leaving "Replace with" empty turns Search into a pure lookup — the results list has no checkboxes or Replace button, only Close.

### 💡 File Saving Tips
- **Mac Users**: Recommended to use TextEdit.app or Visual Studio Code (VS Code).
- **Windows Users**: Notepad or Visual Studio Code are suitable options.
- **Naming Convention**: Use a filename format like `figma-text-layers-[timestamp].csv` or `.json` for organization.
- **File Format**: Ensure to save with the correct extension (.csv or .json) to prevent errors during import.

## 📋 Supported File Formats

### CSV Format
```csv
id,name,characters
"123:456","Title Text","Hello World"
"123:457","Body Text","This is body text"
```

### JSON Format
```json
[
  {
    "id": "123:456",
    "name": "Title Text", 
    "characters": "Hello World"
  },
  {
    "id": "123:457",
    "name": "Body Text",
    "characters": "This is body text"
  }
]
```

## 🛠️ Development Setup

### Requirements
- **Node.js**: Version 22 or higher
- **npm**: Node package manager

### Installation and Build
To set up the development environment, follow these commands:
```bash
# Install dependencies
npm install

# Create a development build
npm run dev

# Create a production build  
npm run build

# Activate watch mode for live changes
npm run build:watch

# Run the test suite
npm test

# Re-run on change
npm run test:watch

# Build the development-only self-test plugin (tools/self-test)
npm run build:self-test
```

### Project Structure
```
Copydesk/
├── src/
│   ├── main/            # Figma sandbox. No DOM, no network.
│   │   ├── index.ts     # opens the UI and wires figma.ui to the handler
│   │   ├── handler.ts   # createHandler: every UI message, scope resolution, the one-task-at-a-time guard
│   │   ├── chunked.ts   # runChunked: time-sliced loops with progress and stop
│   │   ├── fonts.ts     # createFontCache: each font loaded once per apply
│   │   ├── traverse.ts  # collectTextLayers (findAllWithCriteria, sliced; hidden filter, frame names), resolveRoots, isWithin, pageOf
│   │   ├── plan.ts      # buildChangeSet: diffs imported/proposed rows against the document
│   │   ├── apply.ts     # applyTextChanges (re-checks each node before writing)
│   │   ├── generate.ts  # mergeRows, localizeFrames: clone frames and fill their text
│   │   ├── pathmatch.ts # buildPathIndex, resolveRows: import rows matched by layer path
│   │   └── navigate.ts  # centreOnNode: switches page if needed and zooms, without changing selection
│   ├── shared/          # imported by both sides
│   │   ├── types.ts     # TextLayerData, Scope, MatchOptions, SearchMatch, ExportFormat, ChangeSet, ProposedChange, BlockedChange, ReplaceTarget
│   │   ├── messages.ts  # UiToMain, MainToUi, unwrapUiMessage, unwrapMainMessage
│   │   ├── match.ts     # findMatches, replaceMatches, checkQuery: literal and regex matching for both sides
│   │   ├── generate.ts  # Snippet, fillTags, localesOf, buildTranslations, gridPosition
│   │   ├── checks.ts    # copy check rules, findIssues, fixText, glossary tables
│   │   └── settings.ts  # Settings, parseSettings, TAB_NAMES, COMMAND_TABS
│   ├── ui/              # iframe. DOM, no Figma API.
│   │   ├── index.ts     # mounts the status banner, routes inbound messages
│   │   ├── dom.ts       # byId, debugLog, messageOf
│   │   ├── status.tsx   # Preact status banner, with an optional action button
│   │   ├── post.ts      # typed postMessage to the sandbox
│   │   ├── download.ts  # filenameFor, mimeTypeFor, safeFileName, attemptDownload (text or bytes)
│   │   ├── clipboard.ts # copyText, with an execCommand fallback
│   │   ├── features/
│   │   │   ├── extract.ts        # extract and PDF buttons, the download row for every format
│   │   │   ├── import.ts         # parses the chosen file, posts plan-import
│   │   │   ├── scope.ts          # the shared scope and Include hidden layers choice; disables Selection when nothing is selected
│   │   │   ├── tabs.ts           # switches the Extract / Find / Check / Generate / Snippets panels
│   │   │   ├── settings.ts       # applies and saves remembered settings
│   │   │   ├── generate.ts       # data merge and localization: read the file, summarise, post
│   │   │   ├── task.ts           # the running task: busy state, progress text, Stop
│   │   │   ├── show-more.tsx     # paging for long lists
│   │   │   ├── find-replace/
│   │   │   │   ├── index.ts      # owns the remembered search, posts search/plan-replace, mounts ResultList
│   │   │   │   └── results.tsx   # ResultList: highlighted matches, per-occurrence choice, Select all
│   │   │   ├── check/
│   │   │   │   ├── index.ts      # runs checks, shows results, keeps the glossary in step with the file
│   │   │   │   ├── options.tsx   # CheckOptions: rule toggles and glossary editor
│   │   │   │   └── results.tsx   # CheckResults: findings per layer, fixes per rule
│   │   │   ├── snippets/
│   │   │   │   ├── index.ts      # the stored library: get/save, apply to selection, add as layer
│   │   │   │   └── list.tsx      # SnippetList: pure Preact form and list
│   │   │   └── review/
│   │   │       ├── index.ts      # mounts/unmounts ReviewScreen, turns its decision into apply/cancel, invalidates on selection change
│   │   │       └── screen.tsx    # ReviewScreen: pure Preact component rendering the change set
│   │   └── format/      # csv, json, rows (duplicate ids), table (any columns), zip (stored ZIP + CRC-32),
│   │                    # documents (XLSX, DOCX, Markdown, EPUB), stats, read-zip (test support)
│   └── ui.html          # markup and styles only; the bundle is inlined at build time
├── tools/fixture/        # Dev-only Figma plugin that builds pages of thousands of text layers
├── tools/self-test/      # Dev-only Figma plugin that runs Copydesk's sandbox handler against a real document
├── dist/                 # Build output (generated; not committed)
├── manifest.json         # Figma plugin manifest file
├── package.json          # Project metadata and dependencies
├── tsconfig.json         # Base TypeScript config; never compiled directly
├── tsconfig.main.json    # Extends the base for src/main + src/shared (no DOM types)
├── tsconfig.ui.json      # Extends the base for src/ui + src/shared (DOM + Preact JSX)
├── vitest.config.ts      # Test runner configuration
└── webpack.config.js     # Bundles src/main and src/ui, inlines the UI bundle into ui.html
```

Tests sit beside the code they cover, as `*.test.ts`.

## ⚙️ Installing Plugin in Figma

> **Build first:** The `dist/` folder is not committed to the repository. Run `npm install && npm run build` before importing so that `dist/code.js` and `dist/ui.html` exist.

1. Open the Figma desktop application.
2. Navigate to **Plugins** > **Development** > **Import plugin from manifest...**.
3. Select the `manifest.json` file located in this project directory.
4. The plugin will be added to your development section for testing.

> **Publishing to the Figma Community** is done manually from the Figma desktop app (**Plugins → Development → Manage plugins in development → Publish**). Figma does not provide a CLI or API for marketplace publishing, and there is no CI: build and check locally before publishing.
>
> ```bash
> git pull && npm ci && npm run typecheck && npm test && npm run build
> ```

## ⚠️ Important Notes

- **Editing Guidance**: Always modify only the `characters` field in your external files. Changing the `id` or `name` fields will disrupt the matching process during import.
- **Performance Consideration**: Large pages take longer, but the plugin shows progress and extract, search and planning can be stopped.
- **Font Issues**: If fonts are not loaded when importing, errors may occur, so ensure fonts are available in your Figma project.

## 📊 Project Status

[`docs/status.md`](docs/status.md) tracks which phases have merged, how far the
manual verification in [`docs/verification/`](docs/verification/) has got, and the
known items deferred with their reasons.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🤝 Contributing

We welcome contributions to Copydesk! To get started, please refer to our [Contributing Guide](CONTRIBUTING.md) for detailed instructions on how to fork, clone, and submit changes to the project. 

Bug reports and feature suggestions are always welcome and can be submitted through GitHub issues. Thank you for your interest in making Copydesk better! 📝
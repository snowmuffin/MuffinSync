# 📝 Copydesk

**Extract, edit, find & replace, and review text layers in Figma**

Copydesk (formerly MuffinSync) is a powerful and user-friendly plugin for Figma, designed to streamline the workflow of extracting, editing, and importing text layers directly from your design files. This plugin facilitates efficient collaboration by allowing designers and content creators to modify text content externally and seamlessly integrate those changes back into their Figma projects.

## ✨ Key Features

### 1️⃣ Text Layer Extraction (Export)
- **Comprehensive Traversal**: Copydesk can navigate through all text layers within selected frames or an entire page.
- **Detailed Extraction**: Extracts essential text layer information including:
  - `id`: Unique Figma Node ID
  - `name`: Descriptive layer name
  - `characters`: Actual text content of the layer
- **Automatic Downloads**: Users can download the extracted data as CSV or JSON files for easy manipulation.

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
- **A separate tab from Extract.** The plugin panel opens on Extract; a tab bar switches to Find & Replace. The Find & Replace panel keeps its own Find/Replace text and matching options when you switch away and back; the scope choice (Selection or Current page) is shared between the two tabs by design — it's one choice with a visible copy in each panel, not two independent settings.
- **Two steps, same review screen as import.** Searching walks the chosen scope (Selection or Current page) and lists every layer the query occurs in, with that layer's current text and how many times the query occurs in it. Pick which rows to act on; replacing re-reads each chosen layer, recomputes the replacement, and sends the result through the same review screen import uses — nothing is written to the document until it is applied there.
- **Leave "Replace with" empty to search without replacing.** The results list still shows where the query occurs, but with no checkboxes and no Replace button — only a Close button and each row's jump action.
- **Case sensitivity and whole word, not regular expressions.** A query is matched literally. Whole word treats letters by Unicode category rather than by script-specific word rules, so it is close to useless for languages that don't delimit words with spaces (e.g. Korean).
- **Replacement is per layer.** A layer with several matches is one row in the results, accepted or refused as a whole; the match count is shown, but replacing only one occurrence within a layer isn't offered.
- **Long lists are paged.** Results and review show 200 rows at a time with a "Show more" button. Counts, "select all", Replace and Apply always cover every row, shown or not.
- **Jump to a layer without selecting it.** Any row whose layer is still in the document — in the results list or in review, including a "Cannot apply" row for a layer that is no longer a text layer — has a "Show" button that centres it in the viewport. It only zooms; it never changes the current selection. A row for a layer that no longer exists has nothing to centre, so it has no "Show".

### 5️⃣ Large Documents
- **Work runs in slices.** Extracting, searching, checking what would change, and applying hand control back to Figma every few milliseconds, so the canvas keeps repainting on pages with thousands of text layers.
- **Progress you can see.** The status line counts up while a task runs, e.g. "Searching text layers... 4,200 of 20,000".
- **Stop.** Extract, search and the "checking what would change" step have a **Stop** button; stopping produces nothing and changes nothing. Applying has no Stop — a half-applied batch would no longer match what you reviewed — but it reports progress.
- **One task at a time.** Extract, Import and Search are unavailable while a task runs.

## 🚀 How to Use

1. **Run the Plugin**: Access the plugin via Plugins > Copydesk in your Figma application.
2. **Extract Text**:
   - Choose the extraction scope: **Selection** (the layers inside what's currently selected) or **Current page** (everything on the page). Selection is disabled when nothing is selected.
   - Click the "Extract Text Layers" button to initiate the export.
   - Download the result with **CSV Download** or **JSON Download**.
3. **Edit Externally**: Open the saved file in your preferred text editor, make necessary text changes, and save the file.
4. **Import Changes**: Use the "Select File to Import" button to choose your edited file. The plugin shows a review screen listing what would change; uncheck anything you don't want and click **Apply** to write the accepted changes, or **Cancel** to close the review without changing anything.
5. **Find & Replace**: Switch to the **Find & Replace** tab. Type the text to find, and optionally what to replace it with; choose Selection or Current page, then click **Search** (or press Enter). The results list shows every matching layer with its text and match count. Uncheck any layers you don't want, then click **Replace N layers** to send them to the same review screen import uses, or **Close** to leave the document untouched. Leaving "Replace with" empty turns Search into a pure lookup — the results list has no checkboxes or Replace button, only Close.

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
```

### Project Structure
```
Copydesk/
├── src/
│   ├── main/            # Figma sandbox. No DOM, no network.
│   │   ├── index.ts     # message router, scope resolution, the one-task-at-a-time guard
│   │   ├── chunked.ts   # runChunked: time-sliced loops with progress and stop
│   │   ├── fonts.ts     # createFontCache: each font loaded once per apply
│   │   ├── traverse.ts  # collectTextLayers (findAllWithCriteria, sliced), resolveRoots, isWithin
│   │   ├── plan.ts      # buildChangeSet: diffs imported/proposed rows against the document
│   │   ├── apply.ts     # applyTextChanges (re-checks each node before writing)
│   │   ├── search.ts    # countMatches, replaceAll, matchingLayers (literal matching, case/whole-word options)
│   │   └── navigate.ts  # centreOnNode: zooms the viewport to a node without changing selection
│   ├── shared/          # imported by both sides
│   │   ├── types.ts     # TextLayerData, Scope, MatchOptions, SearchMatch, ExportFormat, ChangeSet, ProposedChange, BlockedChange, ReplaceTarget
│   │   └── messages.ts  # UiToMain, MainToUi, unwrapUiMessage, unwrapMainMessage
│   ├── ui/              # iframe. DOM, no Figma API.
│   │   ├── index.ts     # mounts the status banner, routes inbound messages
│   │   ├── dom.ts       # byId, debugLog, messageOf
│   │   ├── status.tsx   # Preact status banner, with an optional action button
│   │   ├── post.ts      # typed postMessage to the sandbox
│   │   ├── download.ts  # filenameFor, mimeTypeFor, attemptDownload, displayDownloadContent
│   │   ├── features/
│   │   │   ├── extract.ts        # extract button, scoped extraction, the CSV/JSON download buttons
│   │   │   ├── import.ts         # parses the chosen file, posts plan-import
│   │   │   ├── scope.ts          # tracks the chosen extraction/search scope, disables Selection when nothing is selected
│   │   │   ├── tabs.ts           # switches the Extract / Find & Replace panels by class toggle
│   │   │   ├── task.ts           # the running task: busy state, progress text, Stop
│   │   │   ├── show-more.tsx     # paging for long lists
│   │   │   ├── find-replace/
│   │   │   │   ├── index.ts      # owns the remembered search, posts search/plan-replace, mounts ResultList
│   │   │   │   └── results.tsx   # ResultList: pure Preact component rendering search results
│   │   │   └── review/
│   │   │       ├── index.ts      # mounts/unmounts ReviewScreen, turns its decision into apply/cancel, invalidates on selection change
│   │   │       └── screen.tsx    # ReviewScreen: pure Preact component rendering the change set
│   │   └── format/      # csv.ts, json.ts, rows.ts (rejects a file naming one layer twice)
│   └── ui.html          # markup and styles only; the bundle is inlined at build time
├── tools/fixture/        # Dev-only Figma plugin that builds pages of thousands of text layers
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
# 🧁 MuffinSync

**Figma Text Layer Extract and Import Plugin**

MuffinSync is a free plugin that extracts text layers from Figma designs, allows external editing, and imports them back to Figma.

## ✨ Key Features

### 1️⃣ Text Layer Extraction (Export)
- Traverse all text layers in selected frames or entire page
- Extract text layer information:
  - `id`: Figma Node ID
  - `name`: Layer name  
  - `characters`: Actual text content
- Automatic download as CSV or JSON files

### 2️⃣ Text Data Modification (External)
- Open extracted CSV/JSON files in external editors for text editing
- ⚠️ **Warning**: Do not modify layer IDs or names

### 3️⃣ Apply Modified Data (Import)
- Upload modified CSV/JSON files
- Find existing Figma text layers and update text content
- Automatic font loading (`loadFontAsync()`)

## 🚀 How to Use

1. **Run Plugin**: Execute Plugins > MuffinSync in Figma
2. **Extract Text**: 
   - Select format (CSV or JSON)
   - Click "Extract Text Layers" button
3. **Copy and Save Data**:
   - Click **📄 CSV Download** or **📋 JSON Download** button
   - When text is auto-selected, copy with `Cmd+C` (Mac) or `Ctrl+C` (Windows)
   - Create a new file in text editor and paste
   - Save with `.csv` or `.json` extension
4. **External Editing**: Open saved file and edit text content
5. **Import**: Upload edited file using "Select File to Import"

### 💡 File Saving Tips
- **Mac**: Use TextEdit.app or VS Code
- **Windows**: Use Notepad or VS Code  
- **Recommended filename**: `figma-text-layers-[timestamp].csv` or `.json`
- **Important**: Always save with correct extension (.csv or .json)

## 🛠️ Development Setup

### Requirements
- Node.js 18+
- npm

### Installation and Build
```bash
# Install dependencies
npm install

# Development build
npm run dev

# Production build  
npm run build

# Watch mode for changes
npm run build:watch
```

### Project Structure
```
MuffinSync/
├── src/
│   ├── code.ts          # Main plugin logic
│   ├── ui.html          # Plugin UI
│   ├── ui.ts            # UI logic
│   └── global.d.ts      # Type definitions
├── dist/                # Build output
├── manifest.json        # Figma plugin manifest
├── package.json
├── tsconfig.json
└── webpack.config.js
```

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

## 🔧 Installing Plugin in Figma

1. Open Figma Desktop app
2. Go to **Plugins** > **Development** > **Import plugin from manifest...**
3. Select the `manifest.json` file from this project
4. Plugin will be added to the development section

## ⚠️ Important Notes

- Only edit the `characters` field when modifying text
- Do not change `id` and `name` fields (matching will fail)
- Processing large numbers of text layers may take time
- Errors may occur if fonts are not loaded

## 📄 License

MIT License

## 🤝 Contributing

Bug reports and feature suggestions are always welcome!

---

Made with ❤️ for Figma designers

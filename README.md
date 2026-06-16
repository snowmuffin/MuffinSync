# 🧁 MuffinSync

**Figma Text Layer Extract and Import Plugin**

MuffinSync is a powerful and user-friendly plugin for Figma, designed to streamline the workflow of extracting, editing, and importing text layers directly from your design files. This plugin facilitates efficient collaboration by allowing designers and content creators to modify text content externally and seamlessly integrate those changes back into their Figma projects.

## ✨ Key Features

### 1️⃣ Text Layer Extraction (Export)
- **Comprehensive Traversal**: MuffinSync can navigate through all text layers within selected frames or an entire page.
- **Detailed Extraction**: Extracts essential text layer information including:
  - `id`: Unique Figma Node ID
  - `name`: Descriptive layer name
  - `characters`: Actual text content of the layer
- **Automatic Downloads**: Users can download the extracted data as CSV or JSON files for easy manipulation.

### 2️⃣ Text Data Modification (External)
- **Flexible Editing**: The plugin allows the extracted CSV or JSON files to be opened in any external text editor (like VS Code or Notepad), enabling users to modify text content efficiently.
- ⚠️ **Important**: Users must avoid altering layer IDs or names to ensure proper functionality during the import phase.

### 3️⃣ Apply Modified Data (Import)
- **Seamless Importing**: Users can upload their modified CSV or JSON files back into Figma, where the plugin locates existing text layers and updates their content accordingly.
- **Automatic Font Handling**: The plugin includes functionality for asynchronous font loading (`loadFontAsync()`), which helps prevent errors related to font availability.

## 🚀 How to Use

1. **Run the Plugin**: Access the plugin via Plugins > MuffinSync in your Figma application.
2. **Extract Text**: 
   - Choose your desired format (CSV or JSON).
   - Click the "Extract Text Layers" button to initiate the export.
3. **Edit Externally**: Open the saved file in your preferred text editor, make necessary text changes, and save the file.
4. **Import Changes**: Use the "Select File to Import" button to upload your edited file back into Figma.

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
- **Node.js**: Version 18 or higher
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
```

### Project Structure
```
MuffinSync/
├── src/
│   ├── code.ts          # Plugin sandbox logic (runs in Figma)
│   └── ui.html          # Self-contained plugin UI (markup + inline script)
├── dist/                # Build output (generated; not committed)
├── manifest.json        # Figma plugin manifest file
├── package.json         # Project metadata and dependencies
├── tsconfig.json        # TypeScript configuration
└── webpack.config.js    # Configuration for module bundling
```

## ⚙️ Installing Plugin in Figma

> **Build first:** The `dist/` folder is not committed to the repository. Run `npm install && npm run build` before importing so that `dist/code.js` and `dist/ui.html` exist.

1. Open the Figma desktop application.
2. Navigate to **Plugins** > **Development** > **Import plugin from manifest...**.
3. Select the `manifest.json` file located in this project directory.
4. The plugin will be added to your development section for testing.

> **Publishing to the Figma Community** is done manually from the Figma desktop app (**Plugins → Development → Manage plugins in development → Publish**). Figma does not provide a CLI or API for marketplace publishing.

## ⚠️ Important Notes

- **Editing Guidance**: Always modify only the `characters` field in your external files. Changing the `id` or `name` fields will disrupt the matching process during import.
- **Performance Consideration**: Processing a large number of text layers may take some time, so patience is advised.
- **Font Issues**: If fonts are not loaded when importing, errors may occur, so ensure fonts are available in your Figma project.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🤝 Contributing

We welcome contributions to MuffinSync! To get started, please refer to our [Contributing Guide](CONTRIBUTING.md) for detailed instructions on how to fork, clone, and submit changes to the project. 

Bug reports and feature suggestions are always welcome and can be submitted through GitHub issues. Thank you for your interest in making MuffinSync better! 🧁
<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# MuffinSync - Figma Plugin Development Instructions

This is a Figma plugin project for extracting, editing, and importing text layers.

## Project Structure
- `src/code.ts` - Main plugin logic that runs in Figma's sandbox
- `src/ui.html` - Plugin UI interface
- `src/ui.ts` - UI TypeScript logic
- `src/global.d.ts` - Custom type definitions for Figma API
- `manifest.json` - Figma plugin manifest
- `webpack.config.js` - Build configuration

## Key Features
1. **Text Layer Extraction**: Extract all text layers from selected frames or entire page
2. **CSV/JSON Export**: Export text data in CSV or JSON format
3. **External Editing**: Edit text content outside of Figma
4. **Import & Update**: Import edited files and update Figma text layers

## Development Guidelines
- Use TypeScript for type safety
- Follow Figma Plugin API best practices
- Handle font loading with `figma.loadFontAsync()`
- Provide user-friendly error messages
- Support both CSV and JSON formats

## Build Commands
- `npm run build` - Production build
- `npm run dev` - Development build
- `npm run build:watch` - Watch mode for development

# Changelog

All notable changes to MuffinSync will be documented in this file.

## [Unreleased]

### Fixed
- **Mixed-font import**: text layers using more than one font across character
  ranges failed to import. Every font in the range is now loaded via
  `getRangeAllFontNames()` before the text is replaced.

### Changed
- Build toolchain updated: webpack 5.111, TypeScript 5.9, ts-loader 9.6,
  html-webpack-plugin 5.6.8, `@figma/plugin-typings` 1.138. This clears all 11
  known advisories previously reported by `npm audit` (all in dev tooling; the
  shipped plugin bundle was never affected).
- Node 22 is now the supported version, in CI and in `engines` (Node 18 is
  end-of-life).
- Console logging is gated behind a `DEBUG` flag instead of always running.
- `ui.html` is now minified in production builds, cutting it from 22.7 KiB to
  12.6 KiB. `code.js` is 1.84 KiB.

### Removed
- Unused `css-loader` / `style-loader` dependencies and their webpack rule — the
  project has no `.css` files; the UI styles are inline in `ui.html`.
- Dead `src/global.d.ts` and `src/ui.ts`, plus stray macOS `._*` metadata files
  and a 1.3 MB unused `icon.png`.

### Added
- GitHub Actions workflow running type check and build on every push and PR.
- `.editorconfig`.

## [1.0.0] - 2025-08-08

### Added
- Initial release of MuffinSync plugin
- Text layer extraction functionality
- Support for CSV and JSON export formats
- Text layer import and update capabilities
- Multi-line content support in CSV parsing
- Enhanced error handling and user feedback
- Comprehensive documentation
- Automated build system with Webpack
- TypeScript support for better code quality

### Features
- 🧁 **Text Extraction**: Extract all text layers from selected frames or entire page
- 📄 **Multiple Formats**: Support for both CSV and JSON export/import
- ✏️ **External Editing**: Edit text content outside of Figma
- 🔄 **Seamless Import**: Update Figma text layers with edited content
- 🛡️ **Robust Parsing**: Handle multi-line text and special characters
- 🎯 **Smart Font Loading**: Automatic font loading for updated text layers

### Technical Details
- Built with TypeScript and Webpack
- Optimized bundle size (22.9 KiB UI, 2.38 KiB code)
- Character-by-character CSV parsing for complex content
- Multiple download fallback methods for browser compatibility
- Comprehensive error handling and user feedback

### Supported Features
- Text layer extraction from selected frames or entire page
- CSV and JSON format support
- Multi-line text content handling
- Font loading and text updates
- Error reporting and status feedback
- Debug logging for development

---

### How to Use This Version
1. Install the plugin in Figma
2. Select frames or use on entire page
3. Extract text layers in your preferred format
4. Edit the downloaded file externally
5. Import back to update Figma text layers

For detailed instructions, see [README.md](README.md)

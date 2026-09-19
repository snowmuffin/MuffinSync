const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

// A Figma plugin UI must be one self-contained HTML file: it cannot load an
// external script. Fold each emitted chunk into the HTML as an inline
// <script>, then drop the now-unreferenced .js asset from the output.
class InlineScriptPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('InlineScriptPlugin', (compilation) => {
      const inlineTag = (tag) => {
        if (tag.tagName !== 'script' || !tag.attributes?.src) return tag;
        const name = path.basename(tag.attributes.src);
        const asset = compilation.assets[name];
        if (!asset) return tag;
        compilation.deleteAsset(name);
        return { tagName: 'script', closeTag: true, innerHTML: asset.source() };
      };

      // A Figma plugin UI cannot load an external <script src>, and a
      // </script> inside an inlined source would close the tag early and
      // truncate the document. Rather than silently ship either of those,
      // fail the build the moment we can prove they happened — an
      // output.filename with a directory segment, or any code-split chunk,
      // is enough to trigger this.
      const assertFullyInlined = (bodyTags, headTags) => {
        const allTags = [...bodyTags, ...headTags];

        const withSrc = allTags.filter((tag) => tag.attributes?.src);
        if (withSrc.length > 0) {
          const srcs = withSrc.map((tag) => tag.attributes.src).join(', ');
          throw new Error(
            `InlineScriptPlugin: could not inline [${srcs}] — the referenced asset was not ` +
              `found in compilation.assets, so the tag was left pointing at an external src. ` +
              `Figma cannot fetch an external script and would show a blank UI. Check ` +
              `output.filename for a directory segment (e.g. "js/[name].js") that would change ` +
              `the asset's basename.`
          );
        }

        const leftoverJs = Object.keys(compilation.assets).filter(
          (name) => name.endsWith('.js') && name !== 'code.js'
        );
        if (leftoverJs.length > 0) {
          throw new Error(
            `InlineScriptPlugin: unexpected .js asset(s) left in the build output: ` +
              `[${leftoverJs.join(', ')}]. Only the sandbox entry (code.js) may remain — the UI ` +
              `must ship as a single self-contained ui.html. This usually means a code-split ` +
              `chunk was emitted with no matching <script> tag to inline; disable code splitting ` +
              `for the ui entry or extend this plugin to inline the extra chunk too.`
          );
        }

        const withTerminator = allTags.filter(
          (tag) => typeof tag.innerHTML === 'string' && tag.innerHTML.includes('</script>')
        );
        if (withTerminator.length > 0) {
          throw new Error(
            `InlineScriptPlugin: inlined script source contains a "</script>" sequence, which ` +
              `would close the <script> tag early and truncate the HTML document. Escape or ` +
              `strip it before inlining.`
          );
        }
      };

      HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tap(
        'InlineScriptPlugin',
        (data) => {
          data.bodyTags = data.bodyTags.map(inlineTag);
          data.headTags = data.headTags.map(inlineTag);
          assertFullyInlined(data.bodyTags, data.headTags);
          return data;
        }
      );
    });
  }
}

module.exports = (env, argv) => ({
  mode: argv.mode === 'production' ? 'production' : 'development',
  devtool: argv.mode === 'production' ? false : 'inline-source-map',

  entry: {
    code: './src/main/index.ts',
    ui: './src/ui/index.ts',
  },

  module: {
    rules: [
      {
        // oneOf: exactly one rule may claim a file. The UI rule is scoped to
        // src/ui only, so src/shared falls through to the main rule below and
        // compiles under tsconfig.main.json. This matters because the UI rule
        // matches .tsx? while the main rule matches only .ts: if src/shared
        // were included here, a future .tsx file under src/shared would be
        // claimed by this rule and compiled with jsxImportSource: preact into
        // the sandbox bundle. Scoped this way, it instead matches no rule and
        // fails the build loudly.
        oneOf: [
          {
            test: /\.tsx?$/,
            include: [path.resolve(__dirname, 'src/ui')],
            use: {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.ui.json',
                // As below: the shared base sets noEmit: true for the
                // typecheck script, and ts-loader needs emitted output.
                compilerOptions: { noEmit: false },
              },
            },
            exclude: /node_modules/,
          },
          {
            test: /\.ts$/,
            include: [
              path.resolve(__dirname, 'src/main'),
              path.resolve(__dirname, 'src/shared'),
            ],
            use: {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.main.json',
                // tsconfig.json's shared base sets noEmit: true (so a bare
                // `tsc -p` typecheck never writes to src/). ts-loader needs
                // emitted output to hand webpack, so override it here, scoped
                // to the build only — the typecheck script is unaffected.
                compilerOptions: { noEmit: false },
              },
            },
            exclude: /node_modules/,
          },
        ],
      },
    ],
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: './src/ui.html',
      filename: 'ui.html',
      chunks: ['ui'],
      inject: 'body',
    }),
    new InlineScriptPlugin(),
  ],
});

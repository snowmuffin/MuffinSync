const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

// A Figma plugin UI must be one self-contained HTML file: it cannot load an
// external script. Fold each emitted chunk into the HTML as an inline
// <script>, then drop the now-unreferenced .js asset from the output.
class InlineScriptPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('InlineScriptPlugin', (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tap(
        'InlineScriptPlugin',
        (data) => {
          data.bodyTags = data.bodyTags.map((tag) => {
            if (tag.tagName !== 'script' || !tag.attributes?.src) return tag;
            const name = path.basename(tag.attributes.src);
            const asset = compilation.assets[name];
            if (!asset) return tag;
            delete compilation.assets[name];
            return { tagName: 'script', closeTag: true, innerHTML: asset.source() };
          });
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
        // oneOf: exactly one rule may claim a file. The src/ui rule comes
        // first; without oneOf, src/shared would match both and compile twice.
        // Being first, this rule claims src/shared for the whole build — that
        // is fine, since shared code touches neither figma nor the DOM.
        oneOf: [
          {
            test: /\.tsx?$/,
            include: [
              path.resolve(__dirname, 'src/ui'),
              path.resolve(__dirname, 'src/shared'),
            ],
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

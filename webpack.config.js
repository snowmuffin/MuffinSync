const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = (env, argv) => ({
  mode: argv.mode === 'production' ? 'production' : 'development',
  devtool: argv.mode === 'production' ? false : 'inline-source-map',

  entry: {
    code: './src/main/index.ts',
  },

  module: {
    rules: [
      {
        // oneOf: exactly one rule may claim a file. Task 5 prepends a rule for
        // src/ui here; without oneOf, src/shared would match both and compile twice.
        oneOf: [
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
    extensions: ['.ts', '.js'],
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: './src/ui.html',
      filename: 'ui.html',
      // The UI is fully self-contained in ui.html (inline script/styles),
      // so don't inject any bundled chunk.
      inject: false,
    }),
  ],
});

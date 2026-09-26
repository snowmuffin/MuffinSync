const path = require('path');
const webpack = require('webpack');

/**
 * The development-only self-test plugin (tools/self-test). Built separately
 * from Copydesk so the shipped bundle is never affected: `npm run build:self-test`.
 * It compiles Copydesk's own src/main and src/shared into its bundle, so it
 * always tests the code in the working tree.
 */
module.exports = {
  mode: 'development',
  devtool: false,
  entry: { code: './tools/self-test/src/index.ts' },
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: [
          path.resolve(__dirname, 'tools/self-test/src'),
          path.resolve(__dirname, 'src/main'),
          path.resolve(__dirname, 'src/shared'),
        ],
        use: {
          loader: 'ts-loader',
          options: { configFile: 'tsconfig.selftest.json', compilerOptions: { noEmit: false } },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: { extensions: ['.ts', '.js'] },
  // Stamped into the bundle so a remote run can tell a stale window from a
  // current one.
  plugins: [new webpack.DefinePlugin({ __BUILT_AT__: JSON.stringify(Date.now()) })],
  output: { filename: '[name].js', path: path.resolve(__dirname, 'tools/self-test/dist') },
};

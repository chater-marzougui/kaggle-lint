const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'cheap-module-source-map',
  watch: true,
  plugins: [
    new webpack.definePlugin({
      'process.env.PYODIDE_PATH': JSON.stringify('src/pyodide/'),
    }),
  ],
  watchOptions: {
    ignored: /node_modules/,
    aggregateTimeout: 300,
    poll: 1000,
  },
  output: {
    publicPath: '/',
  },
  devServer: {
    static: {
      directory: path.join(__dirname, '../dist'),
    },
    hot: false, // Chrome extensions don't support HMR
    port: 3000,
    open: false,
    devMiddleware: {
      writeToDisk: true, // Important for Chrome extension
    },
  },
});

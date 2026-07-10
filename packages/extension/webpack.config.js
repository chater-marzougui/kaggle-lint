const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const ruffWasmDir = path.dirname(require.resolve('@astral-sh/ruff-wasm-web/package.json'));

module.exports = {
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  entry: {
    content: './src/content/index.tsx',
    popup: './src/popup/index.tsx',
    pageExtractor: './src/page/pageExtractor.ts',
    background: './src/background/index.ts',
    offscreen: './src/offscreen/index.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true, // Skip type checking during webpack build
            compilerOptions: {
              noEmit: false,
            },
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@kaggle-lint/core': path.resolve(__dirname, '../core/src'),
      '@kaggle-lint/ui-components': path.resolve(__dirname, '../ui-components/src'),
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      'process.env.DEBUG': JSON.stringify(process.env.DEBUG || 'false'),
      'process.env.EXTENSION_VERSION': JSON.stringify(process.env.EXTENSION_VERSION || '2.0.0'),
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public/manifest.json', to: 'manifest.json' },
        { from: 'public/icons', to: 'icons' },
        // Copy CSS from ui-components
        { 
          from: '../ui-components/src/Overlay/Overlay.css', 
          to: 'content.css' 
        },
        // Copy popup CSS from old-linter
        {
          from: '../../old-linter/src/popup/popup.css',
          to: 'popup.css'
        },
        // Copy pyodide files from core package
        {
          from: '../core/dist/pyodide',
          to: 'pyodide'
        },
        // Copy the ruff wasm asset (resolved via require.resolve since
        // npm workspace hoisting doesn't guarantee a fixed nesting depth)
        {
          from: path.join(ruffWasmDir, 'ruff_wasm_bg.wasm'),
          to: 'ruff/ruff_wasm_bg.wasm',
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './src/offscreen/offscreen.html',
      filename: 'offscreen.html',
      chunks: ['offscreen'],
    }),
  ],
};

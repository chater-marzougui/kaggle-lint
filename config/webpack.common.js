const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');
const ManifestPlugin = require('../scripts/manifest-plugin');

dotenv.config();

module.exports = {
  entry: {
    content: './src/content.js',
    'popup/popup': './src/popup/popup.js',
    'ui/overlay': './src/ui/overlay.js',
    'lintEngine': './src/lintEngine.js',
    'domParser': './src/domParser.js',
    'codeMirror': './src/codeMirror.js',
    'pageInjection': './src/pageInjection.js',
    'flake8Engine': './src/flake8Engine.js',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '../dist'),
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: [
          /node_modules/,
          /pyodide/,
        ],
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.html$/,
        use: ['html-loader'],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'icons/[name][ext]',
        },
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'public',
          to: '.',
          globOptions: {
            ignore: ['**/test/**'],
          },
        },
        {
          from: 'src/popup/popup.html',
          to: 'popup/popup.html',
        },
        {
          from: 'src/popup/popup.css',
          to: 'popup/popup.css',
        },
        {
          from: 'src/ui/styles.css',
          to: 'ui/styles.css',
        },
        {
          from: 'src/pyodide',
          to: 'pyodide',
        },
        {
          from: 'src/rules',
          to: 'rules',
        },
        {
          from: 'icons',
          to: 'icons',
        },
      ],
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      'process.env.DEBUG': JSON.stringify(process.env.DEBUG),
      'process.env.EXTENSION_VERSION': JSON.stringify(process.env.EXTENSION_VERSION),
    }),
    new ManifestPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@rules': path.resolve(__dirname, '../src/rules'),
      '@ui': path.resolve(__dirname, '../src/ui'),
      '@utils': path.resolve(__dirname, '../src/utils'),
    },
  },
};

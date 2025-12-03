module.exports = {
  entry: "./src/content.js",
  output: {
    filename: "linter.bundle.js",
    path: __dirname + "/dist",
  },
  resolve: {
    fallback: {
      fs: false,
      path: false,
      os: false,
    }
  }
};

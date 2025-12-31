const fs = require('fs');
const path = require('path');

class ManifestPlugin {
  constructor(options = {}) {
    this.options = options;
  }

  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync('ManifestPlugin', (compilation, callback) => {
      const isDev = process.env.NODE_ENV === 'development';
      
      const baseManifest = {
        manifest_version: 2,
        name: "Kaggle Linter",
        version: "1.0.0",
        description: "A linter for Kaggle notebooks",
        permissions: ["activeTab", "storage"],
        browser_action: {
          default_popup: "popup/popup.html",
          default_icon: {
            "16": "icons/icon16.png",
            "32": "icons/icon32.png",
            "48": "icons/icon48.png",
            "128": "icons/icon128.png"
          }
        },
        content_scripts: [
          {
            matches: ["*://www.kaggle.com/*"],
            js: ["content.js"],
            css: ["ui/styles.css"],
            run_at: "document_idle"
          }
        ],
        web_accessible_resources: [
          "pyodide/*",
          "rules/*",
          "icons/*"
        ]
      };

      // Development manifest
      const devManifest = {
        ...baseManifest,
        name: "Kaggle Linter (Dev)",
        background: {
          scripts: ["hot-reload.js"],
          persistent: false
        },
        content_security_policy: "script-src 'self' 'unsafe-eval'; object-src 'self'"
      };

      // Production manifest
      const prodManifest = {
        ...baseManifest,
        name: "Kaggle Linter",
        version: "1.0.0",
        content_security_policy: "script-src 'self'; object-src 'self'"
      };

      const manifest = isDev ? devManifest : prodManifest;
      
      const outputPath = compiler.options.output.path;
      const manifestPath = path.resolve(outputPath, 'manifest.json');
      
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      
      console.log(`✓ Manifest generated for ${isDev ? 'development' : 'production'}`);
      
      callback();
    });
  }
}

module.exports = ManifestPlugin;

const fs = require('fs');
const path = require('path');

class ManifestPlugin {
  constructor(options = {}) {
    this.options = options;
  }

  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync('ManifestPlugin', (compilation, callback) => {
      const isDev = process.env.NODE_ENV === 'development';
      const version = '0.1.0';
      
      const baseManifest = {
        manifest_version: 3,
        name: "Kaggle Linter",
        version: version,
        description: "A linter extension for Python code in Kaggle notebooks",
        permissions: ["activeTab", "storage", "scripting"],
        action: {
          default_popup: "popup/popup.html",
          default_icon: {
            "16": "icons/icon16.png",
            "32": "icons/icon32.png",
            "48": "icons/icon48.png",
            "128": "icons/icon128.png",
            "256": "icons/icon256.png",
          },
          default_title: "Kaggle Linter Options"
        },
        host_permissions: [
          "https://www.kaggle.com/*",
          "*://*.kaggle.com/*",
          "*://*.kaggleusercontent.com/*",
          "*://www.kaggle.com/*",
          "https://*.kaggleusercontent.com/*"
        ],
        content_scripts: [
          {
            matches: ["https://www.kaggle.com/code/*/*/edit",
              "https://kkb-production.jupyter-proxy.kaggle.net/*",
              "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/*"],
            js: ["content.js"],
            css: ["ui/styles.css"],
            run_at: "document_idle",
            all_frames: true
          }
        ],
        web_accessible_resources: [
          {
            resources: [
              "pyodide/*",
              "rules/*",
              "icons/*"
            ],
            matches: ["<all_urls>"]
          }
        ]
      };

      // Development manifest
      const devManifest = {
        ...baseManifest,
        name: "Kaggle Linter (Dev)",
        background: {
          scripts: ["hot-reload.js"],
          persistent: false
        }
      };

      // Production manifest
      const prodManifest = {
        ...baseManifest,
        name: "Kaggle Linter",
      };

      const manifest = isDev ? devManifest : prodManifest;
      
      const outputPath = compiler.options.output.path;
      const manifestPath = path.resolve(outputPath, 'manifest.json');
      
      fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), (err) => {
        if (err) {
          console.error('✗ Failed to generate manifest:', err);
          callback(err);
        } else {
          console.log(`✓ Manifest generated for ${isDev ? 'development' : 'production'}`);
          callback();
        }
      });
    });
  }
}

module.exports = ManifestPlugin;

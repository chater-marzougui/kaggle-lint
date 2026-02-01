const fs = require('fs');
const path = require('path');

class ManifestPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync(
      'ManifestPlugin',
      (compilation, callback) => {
        const isDev = process.env.NODE_ENV === 'development';
        const prefix = isDev ? 'src/' : '';

        const manifest = {
          manifest_version: 3,
          name: 'Kaggle Python Linter',
          description: 'A linter extension for Python code in Kaggle notebooks',
          version: '0.1.0',
          permissions: ['activeTab', 'storage', 'scripting'],

          icons: {
            '16': 'icons/icon16.png',
            '32': 'icons/icon32.png',
            '48': 'icons/icon48.png',
            '128': 'icons/icon128.png',
            '256': 'icons/icon256.png',
            '512': 'icons/icon512.png'
          },

          action: {
            default_popup: `${prefix}popup/popup.html`,
            default_icon: {
              '16': 'icons/icon16.png',
              '32': 'icons/icon32.png',
              '48': 'icons/icon48.png',
              '128': 'icons/icon128.png',
              '256': 'icons/icon256.png',
              '512': 'icons/icon512.png'
            },
            default_title: 'Kaggle Python Linter Options'
          },

          host_permissions: [
            'https://www.kaggle.com/*',
            '*://*.kaggle.com/*',
            '*://*.kaggleusercontent.com/*',
            '*://www.kaggle.com/*',
            'https://*.kaggleusercontent.com/*'
          ],

          content_scripts: [
            {
              matches: [
                'https://www.kaggle.com/code/*/*/edit',
                'https://kkb-production.jupyter-proxy.kaggle.net/*',
                'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/*'
              ],

              js: [
                `${prefix}rules/undefinedVariables.js`,
                `${prefix}rules/capitalizationTypos.js`,
                `${prefix}rules/duplicateFunctions.js`,
                `${prefix}rules/importIssues.js`,
                `${prefix}rules/indentationErrors.js`,
                `${prefix}rules/emptyCells.js`,
                `${prefix}rules/unclosedBrackets.js`,
                `${prefix}rules/redefinedVariables.js`,
                `${prefix}rules/missingReturn.js`,
                `${prefix}lintEngine.js`,
                `${prefix}pyodide/pyodide.js`,
                `${prefix}flake8Engine.js`,
                `${prefix}domParser.js`,
                `${prefix}codeMirror.js`,
                `${prefix}ui/overlay.js`,
                `${prefix}pageInjection.js`,
                `${prefix}content.js`
              ],

              css: [`${prefix}ui/styles.css`],
              run_at: 'document_idle',
              all_frames: true
            }
          ],

          web_accessible_resources: [
            {
              resources: ['*'],
              matches: ['<all_urls>']
            }
          ]
        };

        const outputPath = compiler.options.output.path;
        const manifestPath = path.join(outputPath, 'manifest.json');

        fs.writeFile(
          manifestPath,
          JSON.stringify(manifest, null, 2),
          (err) => {
            if (err) return callback(err);
            console.log(
              `✓ Manifest generated (${isDev ? 'dev' : 'prod'})`
            );
            callback();
          }
        );
      }
    );
  }
}

module.exports = ManifestPlugin;

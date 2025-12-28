/**
 * Standalone Linter Demo
 * Allows testing the linter with .ipynb files without Kaggle
 */

(function() {
    'use strict';

    let currentNotebook = null;
    let lintResults = [];

    // DOM elements
    const uploadBox = document.getElementById('upload-box');
    const fileInput = document.getElementById('file-input');
    const contentArea = document.getElementById('content-area');
    const notebookTitle = document.getElementById('notebook-title');
    const notebookContent = document.getElementById('notebook-content');
    const lintSummary = document.getElementById('lint-summary');
    const lintErrors = document.getElementById('lint-errors');

    // Initialize
    function init() {
        setupEventListeners();
        console.log('Linter demo initialized');
    }

    function setupEventListeners() {
        // Click to upload
        uploadBox.addEventListener('click', () => {
            fileInput.click();
        });

        // File selected
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFile(file);
            }
        });

        // Drag and drop
        uploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadBox.classList.add('dragover');
        });

        uploadBox.addEventListener('dragleave', () => {
            uploadBox.classList.remove('dragover');
        });

        uploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadBox.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.ipynb')) {
                handleFile(file);
            } else {
                alert('Please drop a .ipynb file');
            }
        });
    }

    function handleFile(file) {
        console.log('Loading file:', file.name);
        showLoading();

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const notebook = JSON.parse(e.target.result);
                currentNotebook = notebook;
                processNotebook(notebook);
            } catch (error) {
                console.error('Error parsing notebook:', error);
                alert('Error parsing notebook file. Please ensure it\'s a valid .ipynb file.');
                hideLoading();
            }
        };
        reader.readAsText(file);
    }

    function showLoading() {
        contentArea.style.display = 'grid';
        notebookContent.innerHTML = '<div class="loading"><div class="spinner"></div><div>Loading notebook...</div></div>';
        lintErrors.innerHTML = '<div class="loading"><div class="spinner"></div><div>Running linter...</div></div>';
    }

    function hideLoading() {
        // Loading hidden when content is displayed
    }

    function processNotebook(notebook) {
        console.log('Processing notebook:', notebook);

        // Extract code cells
        const codeCells = notebook.cells.filter(cell => cell.cell_type === 'code');
        
        if (codeCells.length === 0) {
            notebookContent.innerHTML = '<div class="notebook-empty">No code cells found in this notebook</div>';
            lintErrors.innerHTML = '<div class="no-errors"><div>No code to lint</div></div>';
            return;
        }

        // Display notebook
        displayNotebook(codeCells);

        // Run linter
        runLinter(codeCells);
    }

    function displayNotebook(codeCells) {
        notebookTitle.textContent = `Notebook (${codeCells.length} code cells)`;
        
        let html = '';
        codeCells.forEach((cell, index) => {
            const code = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
            const escapedCode = escapeHtml(code);
            
            html += `
                <div class="code-cell" id="cell-${index}">
                    <div class="cell-header">
                        <span class="cell-number">Cell ${index + 1}</span>
                        <span class="cell-errors" id="cell-errors-${index}"></span>
                    </div>
                    <div class="cell-code">${escapedCode}</div>
                </div>
            `;
        });

        notebookContent.innerHTML = html;
    }

    function runLinter(codeCells) {
        console.log('Running linter on', codeCells.length, 'cells');

        // Initialize lint engine
        if (typeof LintEngine === 'undefined') {
            console.error('LintEngine not loaded');
            lintErrors.innerHTML = '<div class="no-errors"><div style="color: #e74c3c;">Error: Linter engine not loaded</div></div>';
            return;
        }

        LintEngine.initializeRules();
        
        lintResults = [];
        let lineOffset = 0;

        codeCells.forEach((cell, cellIndex) => {
            const code = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
            const cellErrors = LintEngine.lintCode(code, lineOffset);
            
            // Add cell index to each error
            cellErrors.forEach(error => {
                error.cellIndex = cellIndex;
                lintResults.push(error);
            });

            // Update line offset for next cell
            const lineCount = code.split('\n').length;
            lineOffset += lineCount;
        });

        console.log('Lint results:', lintResults);
        displayLintResults();
    }

    function displayLintResults() {
        // Count by severity
        const counts = {
            error: lintResults.filter(e => e.severity === 'error').length,
            warning: lintResults.filter(e => e.severity === 'warning').length,
            info: lintResults.filter(e => e.severity === 'info').length
        };

        // Update cell error counts
        const cellErrorCounts = {};
        lintResults.forEach(error => {
            const cellIndex = error.cellIndex;
            if (!cellErrorCounts[cellIndex]) {
                cellErrorCounts[cellIndex] = 0;
            }
            cellErrorCounts[cellIndex]++;
        });

        Object.entries(cellErrorCounts).forEach(([cellIndex, count]) => {
            const elem = document.getElementById(`cell-errors-${cellIndex}`);
            if (elem) {
                elem.textContent = `${count} issue${count !== 1 ? 's' : ''}`;
            }
        });

        // Display summary
        lintSummary.innerHTML = `
            <div class="results-summary">
                <div class="summary-item errors">
                    <div class="summary-count">${counts.error}</div>
                    <div class="summary-label">Errors</div>
                </div>
                <div class="summary-item warnings">
                    <div class="summary-count">${counts.warning}</div>
                    <div class="summary-label">Warnings</div>
                </div>
                <div class="summary-item info">
                    <div class="summary-count">${counts.info}</div>
                    <div class="summary-label">Info</div>
                </div>
            </div>
        `;

        // Display errors
        if (lintResults.length === 0) {
            lintErrors.innerHTML = `
                <div class="no-errors">
                    <div class="success-icon">✅</div>
                    <div class="success-text">No issues found!</div>
                </div>
            `;
            return;
        }

        let html = '<ul class="error-list">';
        lintResults.forEach((error, index) => {
            const icon = getSeverityIcon(error.severity);
            html += `
                <li class="error-item ${error.severity}" data-cell="${error.cellIndex}" onclick="scrollToCell(${error.cellIndex})">
                    <div class="error-header">
                        <span class="error-icon">${icon}</span>
                        <span>Cell ${error.cellIndex + 1}, Line ${error.line}</span>
                    </div>
                    <div class="error-message">${escapeHtml(error.msg)}</div>
                </li>
            `;
        });
        html += '</ul>';

        lintErrors.innerHTML = html;
    }

    function getSeverityIcon(severity) {
        const icons = {
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[severity] || '•';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Global function for onclick handlers
    window.scrollToCell = function(cellIndex) {
        const cell = document.getElementById(`cell-${cellIndex}`);
        if (cell) {
            cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cell.style.background = '#fff9e6';
            setTimeout(() => {
                cell.style.background = '';
            }, 2000);
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

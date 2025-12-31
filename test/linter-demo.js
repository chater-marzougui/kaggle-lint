/**
 * Standalone Linter Demo
 * Allows testing the linter with .ipynb files without Kaggle
 * Supports both custom rules and Flake8
 */

(function() {
    'use strict';

    let currentNotebook = null;
    let lintResults = [];
    let currentLinter = 'custom'; // 'custom' or 'flake8'
    let flake8Ready = false;
    let flake8Loading = false;

    // DOM elements
    const uploadBox = document.getElementById('upload-box');
    const fileInput = document.getElementById('file-input');
    const contentArea = document.getElementById('content-area');
    const notebookTitle = document.getElementById('notebook-title');
    const notebookContent = document.getElementById('notebook-content');
    const lintSummary = document.getElementById('lint-summary');
    const lintErrors = document.getElementById('lint-errors');
    const linterSelect = document.getElementById('linter-select');

    // Initialize
    function init() {
        setupEventListeners();
        console.log('Linter demo initialized');
    }

    function setupEventListeners() {
        // Linter selector
        linterSelect.addEventListener('change', (e) => {
            currentLinter = e.target.value;
            console.log('Switched to', currentLinter, 'linter');
            
            // If there's a notebook loaded, re-lint it
            if (currentNotebook) {
                relintNotebook();
            }
        });

        // Re-lint button
        document.getElementById('relint-btn').addEventListener('click', () => {
            relintNotebook();
        });
        
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
        
        notebookContent.innerHTML = '';
        
        codeCells.forEach((cell, index) => {
            const code = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
            
            const cellDiv = document.createElement('div');
            cellDiv.className = 'code-cell';
            cellDiv.id = `cell-${index}`;
            
            const lines = code.split('\n');
            const lineNumbers = lines.map((_, i) => i + 1).join('\n');
            
            cellDiv.innerHTML = `
                <div class="cell-header">
                    <span class="cell-number">Cell ${index + 1}</span>
                    <span class="cell-errors" id="cell-errors-${index}"></span>
                </div>
                <div class="cell-code">
                    <div class="line-numbers" id="line-numbers-${index}">${lineNumbers}</div>
                    <textarea class="code-editor" id="code-editor-${index}" spellcheck="false">${code}</textarea>
                </div>
            `;
            
            notebookContent.appendChild(cellDiv);
            
            // Add input listener to update line numbers
            const editor = document.getElementById(`code-editor-${index}`);
            editor.addEventListener('input', () => updateLineNumbers(index));
            editor.addEventListener('scroll', () => syncScroll(index));
        });
        
        // Show re-lint button
        document.getElementById('relint-btn').style.display = 'inline-block';
    }
    
    function updateLineNumbers(cellIndex) {
        const editor = document.getElementById(`code-editor-${cellIndex}`);
        const lineNumbersDiv = document.getElementById(`line-numbers-${cellIndex}`);
        
        if (!editor || !lineNumbersDiv) return;
        
        const lines = editor.value.split('\n');
        lineNumbersDiv.textContent = lines.map((_, i) => i + 1).join('\n');
    }
    
    function syncScroll(cellIndex) {
        const editor = document.getElementById(`code-editor-${cellIndex}`);
        const lineNumbersDiv = document.getElementById(`line-numbers-${cellIndex}`);
        
        if (!editor || !lineNumbersDiv) return;
        
        lineNumbersDiv.scrollTop = editor.scrollTop;
    }

    async function runLinter(codeCells) {
        console.log('Running', currentLinter, 'linter on', codeCells.length, 'cells');

        if (currentLinter === 'flake8') {
            await runFlake8Linter(codeCells);
        } else {
            runCustomLinter(codeCells);
        }
    }

    function runCustomLinter(codeCells) {
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

    async function runFlake8Linter(codeCells) {
        // Check if Flake8Engine is available
        if (typeof Flake8Engine === 'undefined') {
            console.error('Flake8Engine not loaded');
            lintErrors.innerHTML = '<div class="no-errors"><div style="color: #e74c3c;">Error: Flake8 engine not loaded</div></div>';
            return;
        }

        try {
            // Load Flake8 if not ready (this handles the loading synchronization internally)
            if (!Flake8Engine.getIsReady()) {
                lintErrors.innerHTML = '<div class="loading"><div class="spinner"></div><div>Loading Flake8 (first time may take a while)...</div></div>';
                
                if (!flake8Loading) {
                    flake8Loading = true;
                    console.log('Loading Flake8 for the first time...');
                    await Flake8Engine.load();
                    flake8Ready = true;
                    flake8Loading = false;
                    console.log('Flake8 loaded successfully');
                } else {
                    // Another call is already loading, wait for it
                    while (flake8Loading) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }

            // Show linting state
            lintErrors.innerHTML = '<div class="loading"><div class="spinner"></div><div>Running Flake8 linter...</div></div>';

            // Prepare cells for Flake8
            const cells = codeCells.map((cell, index) => ({
                code: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
                cellIndex: index,
            }));

            // Run Flake8 on all cells
            const errors = await Flake8Engine.lintNotebook(cells);
            
            // Convert Flake8 errors to our format
            lintResults = errors.map(error => ({
                line: error.line,
                msg: error.msg,
                severity: error.severity || 'warning',
                cellIndex: error.cellIndex,
            }));

            console.log('Flake8 results:', lintResults);
            displayLintResults();
        } catch (error) {
            console.error('Flake8 error:', error);
            flake8Loading = false; // Reset on error
            lintErrors.innerHTML = `<div class="no-errors"><div style="color: #e74c3c;">Error running Flake8: ${error.message}</div></div>`;
        }
    }
    
    async function relintNotebook() {
        console.log('Re-linting notebook...');
        
        // Clear existing error highlights
        document.querySelectorAll('.code-cell').forEach(cell => {
            cell.classList.remove('has-errors');
        });
        
        // Gather current code from editors
        const codeCells = [];
        let cellIndex = 0;
        
        while (true) {
            const editor = document.getElementById(`code-editor-${cellIndex}`);
            if (!editor) break;
            
            codeCells.push({
                cell_type: 'code',
                source: editor.value
            });
            cellIndex++;
        }
        
        if (codeCells.length === 0) {
            alert('No code cells to lint');
            return;
        }
        
        // Show loading state
        lintErrors.innerHTML = '<div class="loading"><div class="spinner"></div><div>Re-linting...</div></div>';
        
        // Run linter (with delay for custom, immediate for flake8 since it has its own loading)
        if (currentLinter === 'custom') {
            setTimeout(() => {
                runLinter(codeCells);
            }, 100);
        } else {
            await runLinter(codeCells);
        }
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
            
            // Add visual indicator for cells with errors
            const cell = document.getElementById(`cell-${cellIndex}`);
            if (cell) {
                cell.classList.add('has-errors');
            }
        });

        // Display summary
        const linterName = currentLinter === 'flake8' ? 'Flake8' : 'Custom Rules';
        lintSummary.innerHTML = `
            <div style="text-align: center; margin-bottom: 10px; color: #666; font-size: 12px;">
                Using: ${linterName}
            </div>
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

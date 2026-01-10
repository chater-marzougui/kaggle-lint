# Migration Plan: Vanilla JS to TypeScript + React Monorepo

## Overview

This document outlines a comprehensive step-by-step plan to migrate the Kaggle Python Linter Chrome extension from vanilla JavaScript to a modern stack using **TypeScript**, **React**, and a **monorepo architecture**. The goal is to improve code maintainability, type safety, testability, and developer experience.

### Current Stack
- **Language**: Vanilla JavaScript (ES6+)
- **Build Tool**: Webpack 5
- **Testing**: Node.js native test runner with jsdom
- **Architecture**: Modular but tightly coupled with global scope usage
- **UI**: Vanilla JS DOM manipulation
- **Extension Type**: Chrome Extension (Manifest V3)

### Target Stack
- **Language**: TypeScript 5.x
- **Framework**: React 18+ with hooks
- **Build Tool**: Webpack 5 or Vite (for better DX)
- **Monorepo**: Turborepo or Nx
- **Testing**: Jest + React Testing Library
- **Linting**: ESLint + Prettier
- **Type Checking**: TypeScript strict mode
- **Package Manager**: npm or pnpm (for monorepo optimization)

---

## Phase 1: Project Setup & Infrastructure

### Step 1.1: Initialize Monorepo Structure

**Goal**: Create a monorepo structure that separates concerns and enables code sharing.

**Actions**:
1. Create a new directory structure:
   ```
   kaggle-lint/
   ├── packages/
   │   ├── core/              # Core linting logic (shared)
   │   │   ├── src/
   │   │   │   ├── rules/     # All lint rules
   │   │   │   ├── engines/   # Lint engine, Flake8 engine
   │   │   │   └── types/     # Shared TypeScript types
   │   │   ├── package.json
   │   │   └── tsconfig.json
   │   ├── extension/         # Chrome extension (UI + content scripts)
   │   │   ├── src/
   │   │   │   ├── components/  # React components
   │   │   │   ├── content/     # Content scripts
   │   │   │   ├── background/  # Background scripts (if needed)
   │   │   │   ├── popup/       # Extension popup
   │   │   │   └── utils/       # Extension-specific utilities
   │   │   ├── public/
   │   │   │   ├── manifest.json
   │   │   │   └── icons/
   │   │   ├── package.json
   │   │   └── tsconfig.json
   │   └── ui-components/     # Shared React UI components
   │       ├── src/
   │       │   ├── Overlay/
   │       │   ├── ErrorList/
   │       │   └── index.ts
   │       ├── package.json
   │       └── tsconfig.json
   ├── apps/                  # Applications (optional: demo app)
   │   └── demo/              # Standalone demo application
   │       ├── src/
   │       ├── package.json
   │       └── tsconfig.json
   ├── tools/                 # Build tools and scripts
   │   └── webpack/           # Shared webpack configs
   ├── package.json           # Root package.json
   ├── turbo.json             # Turborepo config (or nx.json for Nx)
   ├── tsconfig.base.json     # Base TypeScript config
   └── .eslintrc.js           # Root ESLint config
   ```

2. Initialize the monorepo:
   ```bash
   # Option 1: Using Turborepo
   npx create-turbo@latest kaggle-lint-monorepo
   
   # Option 2: Using Nx
   npx create-nx-workspace@latest kaggle-lint-monorepo
   
   # Option 3: Manual setup with npm workspaces
   npm init -y
   # Add to root package.json:
   # "workspaces": ["packages/*", "apps/*"]
   ```

3. Create workspace package.json files for each package

**Validation**:
- Run `npm install` successfully at root
- Verify workspace linking with `npm ls --workspaces`

---

### Step 1.2: Setup TypeScript Configuration

**Goal**: Configure TypeScript with strict mode and proper module resolution.

**Actions**:
1. Create `tsconfig.base.json` at root:
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "ESNext",
       "lib": ["ES2020", "DOM", "DOM.Iterable"],
       "jsx": "react-jsx",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "moduleResolution": "bundler",
       "resolveJsonModule": true,
       "isolatedModules": true,
       "noEmit": true,
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true
     }
   }
   ```

2. Create package-specific `tsconfig.json` files that extend the base:
   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

3. Install TypeScript and related dependencies:
   ```bash
   npm install -D typescript @types/node @types/chrome @types/react @types/react-dom
   ```

**Validation**:
- Run `npx tsc --noEmit` in each package without errors

---

### Step 1.3: Setup Build Tools

**Goal**: Configure build tools for development and production builds.

**Actions**:
1. **For Webpack** (keeping current tool):
   - Create shared webpack configs in `tools/webpack/`
   - Configure `ts-loader` or `babel-loader` with TypeScript preset
   - Setup source maps for debugging
   - Configure output for Chrome extension format

2. **Alternative: Vite** (recommended for better DX):
   - Install Vite and plugins:
     ```bash
     npm install -D vite @vitejs/plugin-react vite-plugin-chrome-extension
     ```
   - Create `vite.config.ts` for extension package
   - Configure build for multiple entry points

3. Setup build scripts in each package.json:
   ```json
   {
     "scripts": {
       "build": "tsc && vite build",
       "dev": "vite build --watch",
       "type-check": "tsc --noEmit"
     }
   }
   ```

**Validation**:
- Run `npm run build` in each package
- Verify output in `dist/` directories
- Test hot reload in development mode

---

### Step 1.4: Setup Linting & Formatting

**Goal**: Enforce code quality and consistency.

**Actions**:
1. Install ESLint and Prettier:
   ```bash
   npm install -D eslint prettier eslint-config-prettier
   npm install -D @typescript-eslint/parser @typescript-eslint/eslint-plugin
   npm install -D eslint-plugin-react eslint-plugin-react-hooks
   ```

2. Create `.eslintrc.js`:
   ```javascript
   module.exports = {
     root: true,
     parser: '@typescript-eslint/parser',
     extends: [
       'eslint:recommended',
       'plugin:@typescript-eslint/recommended',
       'plugin:react/recommended',
       'plugin:react-hooks/recommended',
       'prettier'
     ],
     plugins: ['@typescript-eslint', 'react', 'react-hooks'],
     env: {
       browser: true,
       node: true,
       es2020: true,
       webextensions: true
     },
     settings: {
       react: {
         version: 'detect'
       }
     }
   };
   ```

3. Create `.prettierrc.json`:
   ```json
   {
     "semi": true,
     "trailingComma": "es5",
     "singleQuote": true,
     "printWidth": 80,
     "tabWidth": 2
   }
   ```

4. Add scripts to root package.json:
   ```json
   {
     "scripts": {
       "lint": "eslint packages/ apps/ --ext .ts,.tsx",
       "lint:fix": "eslint packages/ apps/ --ext .ts,.tsx --fix",
       "format": "prettier --write \"**/*.{ts,tsx,json,md}\""
     }
   }
   ```

**Validation**:
- Run `npm run lint` without errors
- Run `npm run format` successfully

---

## Phase 2: Core Package Migration

### Step 2.1: Define TypeScript Types

**Goal**: Create type definitions for all core entities.

**Actions**:
1. Create `packages/core/src/types/index.ts`:
   ```typescript
   export type Severity = 'error' | 'warning' | 'info';

   export interface LintError {
     line: number;
     column?: number;
     msg: string;
     severity: Severity;
     rule?: string;
     cellIndex?: number;
   }

   export interface LintContext {
     definedNames?: Set<string>;
     importedModules?: Set<string>;
     functionNames?: Set<string>;
   }

   export interface LintResult {
     errors: LintError[];
     newContext?: LintContext;
   }

   export interface LintRule {
     name: string;
     run(
       code: string,
       cellOffset: number,
       context?: LintContext
     ): LintError[] | LintResult;
   }

   export interface LintEngineConfig {
     rules?: string[];
     severityLevels?: Record<string, Severity>;
   }

   export interface CodeCell {
     code: string;
     index: number;
     offset: number;
   }
   ```

2. Create additional type files:
   - `packages/core/src/types/rules.ts` - Rule-specific types
   - `packages/core/src/types/kaggle.ts` - Kaggle DOM types
   - `packages/core/src/types/pyodide.ts` - Pyodide types

**Validation**:
- Types compile without errors
- Export types from package entry point

---

### Step 2.2: Migrate Lint Rules to TypeScript

**Goal**: Convert all lint rules from vanilla JS to TypeScript classes/modules.

**Actions**:
1. Create base rule class:
   ```typescript
   // packages/core/src/rules/BaseRule.ts
   import { LintError, LintContext } from '../types';

   export abstract class BaseRule {
     abstract name: string;
     abstract run(
       code: string,
       cellOffset: number,
       context?: LintContext
     ): LintError[];

     protected createError(
       line: number,
       msg: string,
       severity: 'error' | 'warning' | 'info'
     ): LintError {
       return { line, msg, severity, rule: this.name };
     }
   }
   ```

2. Migrate each rule (example for undefinedVariables):
   ```typescript
   // packages/core/src/rules/UndefinedVariablesRule.ts
   import { BaseRule } from './BaseRule';
   import { LintError, LintContext } from '../types';

   export class UndefinedVariablesRule extends BaseRule {
     name = 'undefinedVariables';
     private accumulatedContext = new Set<string>();

     private readonly PYTHON_BUILTINS = new Set([
       'abs', 'all', 'any', // ... etc
     ]);

     run(
       code: string,
       cellOffset: number = 0,
       context?: LintContext
     ): LintError[] {
       const errors: LintError[] = [];
       // ... migration of existing logic
       return errors;
     }
   }
   ```

3. Migrate all 9 rules:
   - UndefinedVariablesRule
   - CapitalizationTyposRule
   - DuplicateFunctionsRule
   - ImportIssuesRule
   - IndentationErrorsRule
   - EmptyCellsRule
   - UnclosedBracketsRule
   - RedefinedVariablesRule
   - MissingReturnRule

4. Create rule registry:
   ```typescript
   // packages/core/src/rules/index.ts
   import { BaseRule } from './BaseRule';
   import { UndefinedVariablesRule } from './UndefinedVariablesRule';
   // ... other imports

   export const DEFAULT_RULES: BaseRule[] = [
     new UndefinedVariablesRule(),
     new CapitalizationTyposRule(),
     // ... other rules
   ];

   export * from './BaseRule';
   export * from './UndefinedVariablesRule';
   // ... other exports
   ```

**Validation**:
- Each rule compiles without TypeScript errors
- Run unit tests for each rule
- Verify rule outputs match original behavior

---

### Step 2.3: Migrate Lint Engine to TypeScript

**Goal**: Convert LintEngine to TypeScript with proper typing.

**Actions**:
1. Create `packages/core/src/engines/LintEngine.ts`:
   ```typescript
   import { LintError, LintContext, LintRule, CodeCell } from '../types';
   import { DEFAULT_RULES } from '../rules';

   export class LintEngine {
     private rules: Map<string, LintRule> = new Map();

     constructor(rules: LintRule[] = DEFAULT_RULES) {
       rules.forEach(rule => this.registerRule(rule));
     }

     registerRule(rule: LintRule): void {
       this.rules.set(rule.name, rule);
     }

     lintCell(
       code: string,
       cellOffset: number = 0,
       cellIndex: number = 0,
       context: LintContext = {}
     ): { errors: LintError[], newContext: LintContext } {
       const allErrors: LintError[] = [];
       let cellDefinedNames = new Set<string>();

       this.rules.forEach(rule => {
         try {
           const result = rule.run(code, cellOffset, context);
           const errors = Array.isArray(result) ? result : result.errors;
           allErrors.push(...errors);

           if (!Array.isArray(result) && result.newContext) {
             // Handle context updates
           }
         } catch (error) {
           console.error(`Error in rule ${rule.name}:`, error);
         }
       });

       return { errors: allErrors, newContext: { definedNames: cellDefinedNames } };
     }

     lintCells(cells: CodeCell[]): LintError[] {
       const allErrors: LintError[] = [];
       let globalContext: LintContext = {};

       cells.forEach(cell => {
         const result = this.lintCell(
           cell.code,
           cell.offset,
           cell.index,
           globalContext
         );
         allErrors.push(...result.errors);
         globalContext = { ...globalContext, ...result.newContext };
       });

       return allErrors;
     }
   }
   ```

2. Create `packages/core/src/engines/Flake8Engine.ts`:
   - Migrate Flake8 integration
   - Add proper types for Pyodide

**Validation**:
- LintEngine compiles without errors
- Test with sample Python code
- Verify cross-cell context tracking works

---

### Step 2.4: Setup Core Package Tests

**Goal**: Migrate tests to Jest with TypeScript support.

**Actions**:
1. Install Jest and dependencies:
   ```bash
   cd packages/core
   npm install -D jest @types/jest ts-jest
   ```

2. Create `jest.config.js`:
   ```javascript
   module.exports = {
     preset: 'ts-jest',
     testEnvironment: 'node',
     roots: ['<rootDir>/src'],
     testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts'],
     collectCoverageFrom: [
       'src/**/*.ts',
       '!src/**/*.d.ts',
       '!src/**/__tests__/**'
     ]
   };
   ```

3. Migrate existing tests:
   - Convert `test/rules.test.js` to `packages/core/src/__tests__/rules.test.ts`
   - Update test syntax to Jest
   - Add type assertions

4. Example test migration:
   ```typescript
   // packages/core/src/__tests__/UndefinedVariablesRule.test.ts
   import { UndefinedVariablesRule } from '../rules/UndefinedVariablesRule';

   describe('UndefinedVariablesRule', () => {
     let rule: UndefinedVariablesRule;

     beforeEach(() => {
       rule = new UndefinedVariablesRule();
     });

     it('should detect undefined variables', () => {
       const code = 'print(x)';
       const errors = rule.run(code, 0);
       
       expect(errors).toHaveLength(1);
       expect(errors[0].msg).toContain('x');
       expect(errors[0].severity).toBe('error');
     });

     // ... more tests
   });
   ```

5. Add test scripts to package.json:
   ```json
   {
     "scripts": {
       "test": "jest",
       "test:watch": "jest --watch",
       "test:coverage": "jest --coverage"
     }
   }
   ```

**Validation**:
- All tests pass with `npm test`
- Coverage reports generate correctly
- Tests can import and use TypeScript code

---

## Phase 3: UI Components Package

### Step 3.1: Setup React UI Components Package

**Goal**: Create reusable React components for the extension UI.

**Actions**:
1. Initialize `packages/ui-components`:
   ```bash
   cd packages/ui-components
   npm init -y
   npm install react react-dom
   npm install -D @types/react @types/react-dom
   ```

2. Create component structure:
   ```
   packages/ui-components/src/
   ├── Overlay/
   │   ├── Overlay.tsx
   │   ├── Overlay.module.css
   │   └── index.ts
   ├── ErrorList/
   │   ├── ErrorList.tsx
   │   ├── ErrorItem.tsx
   │   ├── ErrorList.module.css
   │   └── index.ts
   ├── ErrorBadge/
   │   ├── ErrorBadge.tsx
   │   ├── ErrorBadge.module.css
   │   └── index.ts
   └── index.ts
   ```

3. Migrate overlay to React:
   ```typescript
   // packages/ui-components/src/Overlay/Overlay.tsx
   import React, { useState, useEffect } from 'react';
   import { LintError } from '@kaggle-lint/core';
   import { ErrorList } from '../ErrorList';
   import styles from './Overlay.module.css';

   interface OverlayProps {
     errors: LintError[];
     onErrorClick?: (error: LintError) => void;
     visible?: boolean;
     theme?: 'light' | 'dark';
   }

   export const Overlay: React.FC<OverlayProps> = ({
     errors,
     onErrorClick,
     visible = true,
     theme = 'light'
   }) => {
     const [isCollapsed, setIsCollapsed] = useState(false);

     const errorCount = errors.filter(e => e.severity === 'error').length;
     const warningCount = errors.filter(e => e.severity === 'warning').length;
     const infoCount = errors.filter(e => e.severity === 'info').length;

     if (!visible) return null;

     return (
       <div className={`${styles.overlay} ${styles[theme]}`}>
         <div className={styles.header}>
           <h3>Python Linter Results</h3>
           <div className={styles.summary}>
             {errorCount > 0 && (
               <span className={styles.errorBadge}>{errorCount} errors</span>
             )}
             {warningCount > 0 && (
               <span className={styles.warningBadge}>{warningCount} warnings</span>
             )}
             {infoCount > 0 && (
               <span className={styles.infoBadge}>{infoCount} info</span>
             )}
           </div>
           <button onClick={() => setIsCollapsed(!isCollapsed)}>
             {isCollapsed ? '▼' : '▲'}
           </button>
         </div>
         {!isCollapsed && (
           <ErrorList errors={errors} onErrorClick={onErrorClick} />
         )}
       </div>
     );
   };
   ```

4. Create ErrorList component:
   ```typescript
   // packages/ui-components/src/ErrorList/ErrorList.tsx
   import React from 'react';
   import { LintError } from '@kaggle-lint/core';
   import { ErrorItem } from './ErrorItem';
   import styles from './ErrorList.module.css';

   interface ErrorListProps {
     errors: LintError[];
     onErrorClick?: (error: LintError) => void;
   }

   export const ErrorList: React.FC<ErrorListProps> = ({
     errors,
     onErrorClick
   }) => {
     if (errors.length === 0) {
       return <div className={styles.noErrors}>✓ No issues found</div>;
     }

     return (
       <div className={styles.errorList}>
         {errors.map((error, index) => (
           <ErrorItem
             key={index}
             error={error}
             onClick={() => onErrorClick?.(error)}
           />
         ))}
       </div>
     );
   };
   ```

**Validation**:
- Components compile without errors
- Storybook stories work (optional)
- Visual regression tests pass

---

### Step 3.2: Setup CSS Modules

**Goal**: Use CSS Modules for scoped styling.

**Actions**:
1. Configure CSS Modules in build tool
2. Convert existing CSS to modular CSS:
   ```css
   /* packages/ui-components/src/Overlay/Overlay.module.css */
   .overlay {
     position: fixed;
     top: 20px;
     right: 20px;
     width: 400px;
     background: white;
     border-radius: 8px;
     box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
     z-index: 10000;
   }

   .overlay.dark {
     background: #1e1e1e;
     color: #e0e0e0;
   }

   .header {
     display: flex;
     justify-content: space-between;
     align-items: center;
     padding: 16px;
     border-bottom: 1px solid #e0e0e0;
   }

   /* ... more styles */
   ```

**Validation**:
- Styles are scoped to components
- Theme switching works
- No style conflicts

---

### Step 3.3: Add React Testing Library Tests

**Goal**: Test React components thoroughly.

**Actions**:
1. Install testing libraries:
   ```bash
   npm install -D @testing-library/react @testing-library/jest-dom
   npm install -D @testing-library/user-event
   ```

2. Create test file:
   ```typescript
   // packages/ui-components/src/Overlay/__tests__/Overlay.test.tsx
   import React from 'react';
   import { render, screen, fireEvent } from '@testing-library/react';
   import '@testing-library/jest-dom';
   import { Overlay } from '../Overlay';
   import { LintError } from '@kaggle-lint/core';

   describe('Overlay', () => {
     const mockErrors: LintError[] = [
       { line: 1, msg: 'Test error', severity: 'error' },
       { line: 2, msg: 'Test warning', severity: 'warning' }
     ];

     it('renders error counts', () => {
       render(<Overlay errors={mockErrors} />);
       expect(screen.getByText(/1 errors/i)).toBeInTheDocument();
       expect(screen.getByText(/1 warnings/i)).toBeInTheDocument();
     });

     it('collapses when header button clicked', () => {
       render(<Overlay errors={mockErrors} />);
       const collapseButton = screen.getByRole('button');
       
       fireEvent.click(collapseButton);
       expect(screen.queryByText('Test error')).not.toBeInTheDocument();
     });

     it('calls onErrorClick when error is clicked', () => {
       const handleClick = jest.fn();
       render(<Overlay errors={mockErrors} onErrorClick={handleClick} />);
       
       fireEvent.click(screen.getByText('Test error'));
       expect(handleClick).toHaveBeenCalledWith(mockErrors[0]);
     });
   });
   ```

**Validation**:
- All component tests pass
- Coverage > 80%
- Accessibility tests pass

---

## Phase 4: Extension Package Migration

### Step 4.1: Setup Chrome Extension with React

**Goal**: Integrate React into Chrome extension architecture.

**Actions**:
1. Setup extension package:
   ```bash
   cd packages/extension
   npm init -y
   npm install react react-dom
   npm install -D @types/chrome
   ```

2. Update manifest.json for TypeScript build output:
   ```json
   {
     "manifest_version": 3,
     "name": "Kaggle Python Linter",
     "version": "2.0.0",
     "content_scripts": [
       {
         "matches": ["https://www.kaggle.com/code/*/*/edit"],
         "js": ["content.js"],
         "css": ["content.css"]
       }
     ],
     "action": {
       "default_popup": "popup.html"
     },
     "web_accessible_resources": [
       {
         "resources": ["overlay.js", "styles.css"],
         "matches": ["<all_urls>"]
       }
     ]
   }
   ```

3. Create React entry points:
   - `packages/extension/src/popup/index.tsx` - Popup with React
   - `packages/extension/src/content/index.tsx` - Content script mounting React
   - `packages/extension/src/content/ContentApp.tsx` - Main React component

**Validation**:
- Extension builds successfully
- Can load unpacked extension in Chrome
- React DevTools recognizes components

---

### Step 4.2: Migrate Content Script to React

**Goal**: Convert content script to use React components.

**Actions**:
1. Create content script entry:
   ```typescript
   // packages/extension/src/content/index.tsx
   import React from 'react';
   import { createRoot } from 'react-dom/client';
   import { ContentApp } from './ContentApp';
   import { LintEngine } from '@kaggle-lint/core';
   import { KaggleDomParser } from './utils/KaggleDomParser';

   // Initialize linting
   const lintEngine = new LintEngine();
   const domParser = new KaggleDomParser();

   // Create React root
   const mountPoint = document.createElement('div');
   mountPoint.id = 'kaggle-linter-root';
   document.body.appendChild(mountPoint);

   const root = createRoot(mountPoint);

   // Main app component
   function Main() {
     return <ContentApp lintEngine={lintEngine} domParser={domParser} />;
   }

   root.render(<Main />);
   ```

2. Create main content app:
   ```typescript
   // packages/extension/src/content/ContentApp.tsx
   import React, { useState, useEffect } from 'react';
   import { Overlay } from '@kaggle-lint/ui-components';
   import { LintEngine, LintError } from '@kaggle-lint/core';
   import { useLinting } from './hooks/useLinting';
   import { useKaggleTheme } from './hooks/useKaggleTheme';

   interface ContentAppProps {
     lintEngine: LintEngine;
     domParser: any;
   }

   export const ContentApp: React.FC<ContentAppProps> = ({
     lintEngine,
     domParser
   }) => {
     const [errors, setErrors] = useState<LintError[]>([]);
     const [visible, setVisible] = useState(true);
     const theme = useKaggleTheme();

     const { runLinter } = useLinting(lintEngine, domParser, setErrors);

     useEffect(() => {
       // Run linter on mount
       runLinter();

       // Setup keyboard shortcuts
       const handleKeyDown = (e: KeyboardEvent) => {
         if (e.ctrlKey && e.shiftKey && e.key === 'L') {
           runLinter();
         }
         if (e.ctrlKey && e.shiftKey && e.key === 'H') {
           setVisible(prev => !prev);
         }
       };

       document.addEventListener('keydown', handleKeyDown);
       return () => document.removeEventListener('keydown', handleKeyDown);
     }, []);

     const handleErrorClick = (error: LintError) => {
       // Scroll to error location
       domParser.scrollToLine(error.line);
     };

     return (
       <Overlay
         errors={errors}
         visible={visible}
         theme={theme}
         onErrorClick={handleErrorClick}
       />
     );
   };
   ```

3. Create custom hooks:
   ```typescript
   // packages/extension/src/content/hooks/useLinting.ts
   import { useCallback } from 'react';
   import { LintEngine, LintError } from '@kaggle-lint/core';

   export function useLinting(
     lintEngine: LintEngine,
     domParser: any,
     setErrors: (errors: LintError[]) => void
   ) {
     const runLinter = useCallback(async () => {
       try {
         const cells = await domParser.extractCells();
         const errors = lintEngine.lintCells(cells);
         setErrors(errors);
       } catch (error) {
         console.error('Linting failed:', error);
       }
     }, [lintEngine, domParser, setErrors]);

     return { runLinter };
   }
   ```

**Validation**:
- Extension loads in Chrome
- Overlay renders correctly
- Linting runs on keyboard shortcut
- Errors display properly

---

### Step 4.3: Migrate Popup to React

**Goal**: Convert extension popup to React.

**Actions**:
1. Create popup entry:
   ```typescript
   // packages/extension/src/popup/index.tsx
   import React from 'react';
   import { createRoot } from 'react-dom/client';
   import { PopupApp } from './PopupApp';

   const root = createRoot(document.getElementById('root')!);
   root.render(<PopupApp />);
   ```

2. Create popup app:
   ```typescript
   // packages/extension/src/popup/PopupApp.tsx
   import React, { useState, useEffect } from 'react';
   import { Settings } from './components/Settings';
   import './popup.css';

   export const PopupApp: React.FC = () => {
     const [settings, setSettings] = useState({
       engine: 'custom',
       autoRun: true,
       showInfo: true
     });

     useEffect(() => {
       // Load settings from chrome.storage
       chrome.storage.sync.get(['linterSettings'], (result) => {
         if (result.linterSettings) {
           setSettings(result.linterSettings);
         }
       });
     }, []);

     const handleSettingsChange = (newSettings: typeof settings) => {
       setSettings(newSettings);
       chrome.storage.sync.set({ linterSettings: newSettings });
       
       // Notify content script
       chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         chrome.tabs.sendMessage(tabs[0].id!, {
           type: 'settingsChanged',
           settings: newSettings
         });
       });
     };

     return (
       <div className="popup">
         <h1>Kaggle Python Linter</h1>
         <Settings settings={settings} onChange={handleSettingsChange} />
       </div>
     );
   };
   ```

**Validation**:
- Popup opens correctly
- Settings save and load
- Settings changes trigger re-linting

---

### Step 4.4: Migrate DOM Parser and CodeMirror Handler

**Goal**: Convert utility modules to TypeScript.

**Actions**:
1. Create `packages/extension/src/utils/KaggleDomParser.ts`:
   ```typescript
   import { CodeCell } from '@kaggle-lint/core';

   export class KaggleDomParser {
     private readonly CELL_SELECTOR = '.CodeMirror';

     async extractCells(): Promise<CodeCell[]> {
       const cells: CodeCell[] = [];
       const cellElements = document.querySelectorAll(this.CELL_SELECTOR);
       
       let offset = 0;
       cellElements.forEach((element, index) => {
         const code = this.extractCodeFromCell(element);
         cells.push({
           code,
           index,
           offset
         });
         offset += code.split('\n').length;
       });

       return cells;
     }

     private extractCodeFromCell(element: Element): string {
       // Extract code from CodeMirror
       const cm = (element as any).CodeMirror;
       if (cm) {
         return cm.getValue();
       }
       return '';
     }

     scrollToLine(line: number): void {
       // Implementation to scroll to line
     }
   }
   ```

2. Create `packages/extension/src/utils/CodeMirrorManager.ts`:
   ```typescript
   export class CodeMirrorManager {
     private cellStorage = new Map<number, string>();

     storeCell(index: number, code: string): void {
       this.cellStorage.set(index, code);
     }

     getCell(index: number): string | undefined {
       return this.cellStorage.get(index);
     }

     clear(): void {
       this.cellStorage.clear();
     }
   }
   ```

**Validation**:
- Can extract cells from Kaggle notebooks
- Handles lazy loading correctly
- Scroll to line works

---

### Step 4.5: Page Injection Script

**Goal**: Migrate page injection for cross-origin iframe access.

**Actions**:
1. Keep as separate vanilla JS if needed for MAIN world injection
2. Or migrate to TypeScript:
   ```typescript
   // packages/extension/src/page-injection/inject.ts
   (function() {
     'use strict';

     // Access CodeMirror from page context
     window.addEventListener('message', (event) => {
       if (event.data.type === 'KAGGLE_LINTER_EXTRACT_CELLS') {
         const cells = extractCellsFromCodeMirror();
         window.postMessage({
           type: 'KAGGLE_LINTER_CELLS_EXTRACTED',
           cells
         }, '*');
       }
     });

     function extractCellsFromCodeMirror() {
       // Implementation
     }
   })();
   ```

**Validation**:
- Can communicate with content script
- Accesses CodeMirror correctly
- Works in iframe context

---

## Phase 5: Testing Infrastructure

### Step 5.1: Setup Jest Configuration for Monorepo

**Goal**: Configure Jest to work across all packages.

**Actions**:
1. Create root `jest.config.js`:
   ```javascript
   module.exports = {
     projects: [
       '<rootDir>/packages/core',
       '<rootDir>/packages/ui-components',
       '<rootDir>/packages/extension'
     ],
     collectCoverageFrom: [
       'packages/*/src/**/*.{ts,tsx}',
       '!packages/*/src/**/*.d.ts',
       '!packages/*/src/**/__tests__/**'
     ],
     coverageThreshold: {
       global: {
         branches: 70,
         functions: 70,
         lines: 70,
         statements: 70
       }
     }
   };
   ```

2. Add test scripts to root package.json:
   ```json
   {
     "scripts": {
       "test": "jest",
       "test:watch": "jest --watch",
       "test:coverage": "jest --coverage",
       "test:core": "jest --selectProjects core",
       "test:ui": "jest --selectProjects ui-components",
       "test:extension": "jest --selectProjects extension"
     }
   }
   ```

**Validation**:
- Run tests from root
- Coverage reports generate
- Can run tests per package

---

### Step 5.2: E2E Testing Setup

**Goal**: Add end-to-end tests for extension.

**Actions**:
1. Install Playwright:
   ```bash
   npm install -D @playwright/test playwright-chromium
   ```

2. Create E2E test config:
   ```typescript
   // playwright.config.ts
   import { defineConfig } from '@playwright/test';

   export default defineConfig({
     testDir: './e2e',
     use: {
       headless: false,
       viewport: { width: 1280, height: 720 },
     },
   });
   ```

3. Create E2E test:
   ```typescript
   // e2e/extension.test.ts
   import { test, expect, chromium } from '@playwright/test';
   import path from 'path';

   test.describe('Kaggle Linter Extension', () => {
     test('should load and show overlay', async () => {
       const extensionPath = path.join(__dirname, '../packages/extension/dist');
       
       const browser = await chromium.launchPersistentContext('', {
         headless: false,
         args: [
           `--disable-extensions-except=${extensionPath}`,
           `--load-extension=${extensionPath}`
         ]
       });

       const page = await browser.newPage();
       await page.goto('https://www.kaggle.com/code/...');
       
       // Wait for overlay
       const overlay = await page.locator('#kaggle-linter-root');
       await expect(overlay).toBeVisible();

       await browser.close();
     });
   });
   ```

**Validation**:
- E2E tests run successfully
- Can test extension in browser
- Tests cover critical paths

---

## Phase 6: Build & CI/CD

### Step 6.1: Setup Turborepo/Nx for Build Orchestration

**Goal**: Optimize build pipeline with caching and parallelization.

**Actions**:
1. Create `turbo.json`:
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "pipeline": {
       "build": {
         "dependsOn": ["^build"],
         "outputs": ["dist/**"]
       },
       "test": {
         "dependsOn": ["build"],
         "outputs": ["coverage/**"]
       },
       "lint": {
         "outputs": []
       },
       "dev": {
         "cache": false,
         "persistent": true
       }
     }
   }
   ```

2. Update scripts:
   ```json
   {
     "scripts": {
       "build": "turbo run build",
       "dev": "turbo run dev --parallel",
       "test": "turbo run test",
       "lint": "turbo run lint"
     }
   }
   ```

**Validation**:
- Builds run in correct order
- Caching works
- Parallel execution speeds up builds

---

### Step 6.2: CI/CD Pipeline

**Goal**: Automate testing and deployment.

**Actions**:
1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI

   on: [push, pull_request]

   jobs:
     lint:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: 18
         - run: npm ci
         - run: npm run lint

     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: 18
         - run: npm ci
         - run: npm run test:coverage
         - uses: codecov/codecov-action@v3

     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: 18
         - run: npm ci
         - run: npm run build
         - uses: actions/upload-artifact@v3
           with:
             name: extension
             path: packages/extension/dist

     e2e:
       runs-on: ubuntu-latest
       needs: build
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: 18
         - run: npm ci
         - run: npx playwright install chromium
         - run: npm run test:e2e
   ```

2. Create release workflow:
   ```yaml
   name: Release

   on:
     push:
       tags:
         - 'v*'

   jobs:
     release:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
         - run: npm ci
         - run: npm run build
         - run: cd packages/extension/dist && zip -r ../../../kaggle-linter.zip .
         - uses: actions/create-release@v1
           with:
             files: kaggle-linter.zip
   ```

**Validation**:
- CI runs on every PR
- Tests must pass before merge
- Releases create artifacts

---

## Phase 7: Documentation & Migration

### Step 7.1: Update Documentation

**Goal**: Document new architecture and development workflow.

**Actions**:
1. Update README.md with new architecture
2. Create CONTRIBUTING.md with development guide
3. Create API documentation for core package
4. Create component documentation (Storybook)
5. Add migration notes

**Validation**:
- Documentation is clear
- Examples work
- Setup instructions are accurate

---

### Step 7.2: Gradual Migration Strategy

**Goal**: Migrate incrementally without breaking production.

**Actions**:
1. **Parallel Development**:
   - Keep old code in `legacy/` folder
   - Build both versions during transition
   - Use feature flags to toggle between versions

2. **Package by Package**:
   - Week 1-2: Core package (rules + engine)
   - Week 3: UI components
   - Week 4-5: Extension package
   - Week 6: Testing & polish

3. **Verification Steps**:
   - After each package migration:
     - Run all tests
     - Manual testing on Kaggle
     - Performance comparison
     - Bug fixes

4. **Switchover**:
   - Release as v2.0.0
   - Keep v1.x available for rollback
   - Monitor for issues

**Validation**:
- Both versions work during transition
- No functionality lost
- Performance maintained or improved

---

## Phase 8: Optimization & Polish

### Step 8.1: Performance Optimization

**Goal**: Ensure the migrated version performs well.

**Actions**:
1. **Bundle Size Optimization**:
   - Use code splitting for large dependencies
   - Tree-shake unused code
   - Compress assets
   - Use production React build

2. **Runtime Performance**:
   - Profile React rendering
   - Optimize re-renders with React.memo
   - Use Web Workers for heavy linting
   - Lazy load rules

3. **Memory Management**:
   - Clean up observers
   - Dispose of unused contexts
   - Monitor memory leaks

**Validation**:
- Bundle size < 2MB
- Linting completes in < 500ms for typical notebooks
- Memory usage stable

---

### Step 8.2: Developer Experience Improvements

**Goal**: Make development easier and faster.

**Actions**:
1. Add debug tools:
   - React DevTools integration
   - Debug logging system
   - Performance profiler

2. Improve hot reload:
   - Fast refresh for React
   - Automatic extension reload

3. Better error messages:
   - TypeScript strict mode
   - Helpful console logs
   - Error boundaries in React

**Validation**:
- Hot reload works consistently
- Error messages are clear
- Debugging is straightforward

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Setup | 1 week | None |
| Phase 2: Core | 2 weeks | Phase 1 |
| Phase 3: UI Components | 1.5 weeks | Phase 1, 2 |
| Phase 4: Extension | 2 weeks | Phase 1, 2, 3 |
| Phase 5: Testing | 1 week | Phase 1-4 |
| Phase 6: CI/CD | 0.5 weeks | Phase 1-5 |
| Phase 7: Docs & Migration | 1 week | Phase 1-6 |
| Phase 8: Optimization | 1 week | Phase 1-7 |
| **Total** | **10 weeks** | |

---

## Benefits of Migration

### Technical Benefits
1. **Type Safety**: Catch errors at compile time with TypeScript
2. **Better DX**: IntelliSense, refactoring tools, better IDE support
3. **Maintainability**: Clear interfaces, modular architecture
4. **Testability**: Easier to test with proper module boundaries
5. **React Ecosystem**: Access to vast library of components and tools
6. **Code Reuse**: Monorepo enables sharing code between packages

### Development Benefits
1. **Faster Development**: React components speed up UI development
2. **Better Testing**: Jest + RTL provide excellent testing experience
3. **Team Collaboration**: Clear package boundaries enable parallel work
4. **Future-Proof**: Modern stack aligns with industry standards

### User Benefits
1. **Better Performance**: Optimized React rendering
2. **Richer UI**: React enables more interactive features
3. **Fewer Bugs**: Type safety and testing reduce issues
4. **Faster Updates**: Better architecture enables quicker feature development

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing functionality | High | Comprehensive testing, parallel development |
| Increased bundle size | Medium | Code splitting, tree shaking |
| Migration takes too long | Medium | Incremental migration, clear milestones |
| Team learning curve | Low | Documentation, pair programming |
| Regression bugs | High | E2E tests, manual QA, beta testing |

---

## Success Criteria

- [ ] All lint rules work identically to original
- [ ] All tests pass (unit, integration, E2E)
- [ ] Bundle size ≤ 2MB
- [ ] Linting performance maintained or improved
- [ ] No functional regressions
- [ ] Documentation complete
- [ ] CI/CD pipeline working
- [ ] Type coverage > 90%
- [ ] Test coverage > 80%
- [ ] Successfully loads and runs on Kaggle notebooks

---

## Maintenance Plan

After migration:
1. **Regular Updates**: Keep dependencies up to date
2. **Monitoring**: Track performance and errors
3. **User Feedback**: Collect and address user issues
4. **Feature Development**: Leverage new architecture for features
5. **Code Quality**: Regular refactoring and improvements

---

## Conclusion

This migration plan provides a comprehensive, step-by-step approach to transforming the Kaggle Python Linter from a vanilla JavaScript Chrome extension into a modern, type-safe, maintainable codebase using TypeScript, React, and a monorepo architecture.

The migration is designed to be:
- **Incremental**: Each phase builds on the previous
- **Safe**: Parallel development prevents breaking production
- **Thorough**: Comprehensive testing at every step
- **Sustainable**: Modern stack ensures long-term maintainability

By following this plan, the project will gain significant technical and development benefits while maintaining all existing functionality and improving the user experience.

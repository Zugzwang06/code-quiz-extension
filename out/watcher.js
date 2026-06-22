"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeWatcher = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const vscode = __importStar(require("vscode"));
// Heuristic: chars added in one change batch = paste
const PASTE_CHAR_THRESHOLD = 120;
const FUNCTION_COMPLETE_PATTERNS = {
    javascript: [/^}\s*$/, /^}\);\s*$/],
    typescript: [/^}\s*$/, /^}\);\s*$/],
    python: [/^\s{0,4}\S/],
    java: [/^    }\s*$/, /^}\s*$/],
    go: [/^}\s*$/],
    rust: [/^}\s*$/],
    c: [/^}\s*$/],
    cpp: [/^}\s*$/],
};
const IGNORED_LANGUAGES = new Set([
    'json', 'markdown', 'plaintext', 'xml', 'yaml', 'toml', 'ini', 'css', 'scss', 'less',
]);
class CodeWatcher {
    constructor(callback) {
        this._disposables = [];
        this._lastContent = new Map();
        this._active = true;
        this._recentTriggers = new Map();
        this.COOLDOWN_MS = 30000;
        this._callback = callback;
        this._startWatching();
    }
    _startWatching() {
        // Cache content of already-open docs
        vscode.workspace.textDocuments.forEach(doc => {
            if (doc.uri.scheme === 'file')
                this._lastContent.set(doc.fileName, doc.getText());
        });
        this._disposables.push(vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.uri.scheme === 'file')
                this._lastContent.set(doc.fileName, doc.getText());
        }), vscode.workspace.onDidChangeTextDocument(e => {
            if (!this._active)
                return;
            if (e.document.uri.scheme !== 'file')
                return;
            if (e.contentChanges.length === 0)
                return;
            const lang = e.document.languageId;
            if (IGNORED_LANGUAGES.has(lang))
                return;
            const fileName = e.document.fileName;
            const current = e.document.getText();
            const previous = this._lastContent.get(fileName) ?? '';
            const charsAdded = e.contentChanges.reduce((sum, c) => sum + Math.max(0, c.text.length - c.rangeLength), 0);
            this._lastContent.set(fileName, current);
            const config = vscode.workspace.getConfiguration('codeQuiz');
            // ── Paste trigger ──────────────────────────────────────────────────
            if (config.get('triggerOnPaste', true) && charsAdded >= PASTE_CHAR_THRESHOLD) {
                if (this._canTrigger(fileName)) {
                    const pasted = e.contentChanges.map((c) => c.text).join('\n');
                    this._fire({ reason: 'paste', code: current, language: lang, fileName, changedLines: pasted.slice(0, 6000) });
                    return;
                }
            }
            // ── Function-complete trigger (debounced) ──────────────────────────
            if (config.get('triggerOnFunctionComplete', true)) {
                const changed = e.contentChanges.map((c) => c.text).join('');
                if (this._looksFunctionEnd(changed, lang)) {
                    const ms = (config.get('debounceSeconds', 6)) * 1000;
                    this._scheduleDebounce(fileName, current, lang, previous, ms);
                }
            }
        }));
    }
    _scheduleDebounce(fileName, content, language, previous, ms) {
        if (this._debounceTimer !== undefined)
            clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            if (!this._canTrigger(fileName))
                return;
            const changedLines = this._extractNewFunctions(previous, content, language);
            if (!changedLines)
                return;
            this._fire({ reason: 'function_complete', code: content, language, fileName, changedLines });
        }, ms);
    }
    _fire(event) {
        this._recentTriggers.set(event.fileName, Date.now());
        this._callback(event);
    }
    _canTrigger(fileName) {
        const last = this._recentTriggers.get(fileName);
        return !last || Date.now() - last > this.COOLDOWN_MS;
    }
    _looksFunctionEnd(text, lang) {
        const pats = FUNCTION_COMPLETE_PATTERNS[lang] ?? [/^}\s*$/];
        return pats.some(p => p.test(text.trim()));
    }
    _extractNewFunctions(previous, current, lang) {
        const prevLines = previous.split('\n');
        const currLines = current.split('\n');
        const newLines = [];
        let inBlock = false;
        let depth = 0;
        for (const line of currLines) {
            if (!prevLines.includes(line) && this._isFunctionStart(line, lang)) {
                inBlock = true;
                depth = 0;
            }
            if (inBlock) {
                newLines.push(line);
                depth += (line.match(/\{/g) ?? []).length;
                depth -= (line.match(/\}/g) ?? []).length;
                if (depth <= 0 && newLines.length > 1) {
                    inBlock = false;
                }
            }
        }
        return newLines.length >= 3 ? newLines.slice(0, 60).join('\n') : null;
    }
    _isFunctionStart(line, lang) {
        const pats = {
            javascript: /\b(function|=>|async)\b|^\s*(const|let|var)\s+\w+\s*=\s*(async\s*)?\(/,
            typescript: /\b(function|=>|async)\b|^\s*(const|let|var)\s+\w+\s*=\s*(async\s*)?\(/,
            python: /^\s*def\s+\w+\s*\(/,
            java: /\b(public|private|protected|static)\b.*\w+\s*\(/,
            go: /^func\s+/,
            rust: /^(pub\s+)?fn\s+/,
            c: /^\w[\w\s*]+\s+\w+\s*\(/,
            cpp: /^\w[\w\s*]+\s+\w+\s*\(/,
        };
        return (pats[lang] ?? /\bfunction\b|\bdef\b|\bfunc\b/).test(line);
    }
    triggerManual(editor) {
        const doc = editor.document;
        const sel = editor.selection;
        // For manual trigger, send the FULL file (or full selection) — no truncation —
        // so the question can be about the whole thing, not just the first chunk.
        const changedLines = sel.isEmpty ? doc.getText() : doc.getText(sel);
        this._fire({
            reason: 'manual',
            code: doc.getText(),
            language: doc.languageId,
            fileName: doc.fileName,
            changedLines,
        });
    }
    setActive(active) { this._active = active; }
    isActive() { return this._active; }
    dispose() {
        if (this._debounceTimer !== undefined)
            clearTimeout(this._debounceTimer);
        this._disposables.forEach(d => d.dispose());
    }
}
exports.CodeWatcher = CodeWatcher;
//# sourceMappingURL=watcher.js.map
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import { TriggerReason } from './types';

export interface TriggerEvent {
  reason: TriggerReason;
  code: string;
  language: string;
  fileName: string;
  changedLines: string;
}

type TriggerCallback = (event: TriggerEvent) => void;

// Heuristic: chars added in one change batch = paste
const PASTE_CHAR_THRESHOLD = 120;

const FUNCTION_COMPLETE_PATTERNS: Record<string, RegExp[]> = {
  javascript:  [/^}\s*$/, /^}\);\s*$/],
  typescript:  [/^}\s*$/, /^}\);\s*$/],
  python:      [/^\s{0,4}\S/],
  java:        [/^    }\s*$/, /^}\s*$/],
  go:          [/^}\s*$/],
  rust:        [/^}\s*$/],
  c:           [/^}\s*$/],
  cpp:         [/^}\s*$/],
};

const IGNORED_LANGUAGES = new Set([
  'json','markdown','plaintext','xml','yaml','toml','ini','css','scss','less',
]);

export class CodeWatcher {
  private readonly _disposables: vscode.Disposable[] = [];
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _lastContent = new Map<string, string>();
  private _active = true;
  private readonly _callback: TriggerCallback;
  private readonly _recentTriggers = new Map<string, number>();
  private readonly COOLDOWN_MS = 30_000;

  constructor(callback: TriggerCallback) {
    this._callback = callback;
    this._startWatching();
  }

  private _startWatching(): void {
    // Cache content of already-open docs
    vscode.workspace.textDocuments.forEach(doc => {
      if (doc.uri.scheme === 'file') this._lastContent.set(doc.fileName, doc.getText());
    });

    this._disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.uri.scheme === 'file') this._lastContent.set(doc.fileName, doc.getText());
      }),
      vscode.workspace.onDidChangeTextDocument(e => {
        if (!this._active) return;
        if (e.document.uri.scheme !== 'file') return;
        if (e.contentChanges.length === 0) return;

        const lang = e.document.languageId;
        if (IGNORED_LANGUAGES.has(lang)) return;

        const fileName = e.document.fileName;
        const current = e.document.getText();
        const previous = this._lastContent.get(fileName) ?? '';

        const charsAdded = e.contentChanges.reduce(
          (sum: number, c: any) => sum + Math.max(0, (c.text as string).length - (c.rangeLength as number)),
          0
        );

        this._lastContent.set(fileName, current);

        const config = vscode.workspace.getConfiguration('codeQuiz');

        // ── Paste trigger ──────────────────────────────────────────────────
        if (config.get<boolean>('triggerOnPaste', true) && charsAdded >= PASTE_CHAR_THRESHOLD) {
          if (this._canTrigger(fileName)) {
            const pasted = e.contentChanges.map((c: any) => c.text as string).join('\n');
            this._fire({ reason: 'paste', code: current, language: lang, fileName, changedLines: pasted.slice(0, 6000) });
            return;
          }
        }

        // ── Function-complete trigger (debounced) ──────────────────────────
        if (config.get<boolean>('triggerOnFunctionComplete', true)) {
          const changed = e.contentChanges.map((c: any) => c.text as string).join('');
          if (this._looksFunctionEnd(changed, lang)) {
            const ms = (config.get<number>('debounceSeconds', 6)) * 1000;
            this._scheduleDebounce(fileName, current, lang, previous, ms);
          }
        }
      })
    );
  }

  private _scheduleDebounce(
    fileName: string, content: string, language: string, previous: string, ms: number
  ): void {
    if (this._debounceTimer !== undefined) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      if (!this._canTrigger(fileName)) return;
      const changedLines = this._extractNewFunctions(previous, content, language);
      if (!changedLines) return;
      this._fire({ reason: 'function_complete', code: content, language, fileName, changedLines });
    }, ms);
  }

  private _fire(event: TriggerEvent): void {
    this._recentTriggers.set(event.fileName, Date.now());
    this._callback(event);
  }

  private _canTrigger(fileName: string): boolean {
    const last = this._recentTriggers.get(fileName);
    return !last || Date.now() - last > this.COOLDOWN_MS;
  }

  private _looksFunctionEnd(text: string, lang: string): boolean {
    const pats = FUNCTION_COMPLETE_PATTERNS[lang] ?? [/^}\s*$/];
    return pats.some(p => p.test(text.trim()));
  }

  private _extractNewFunctions(previous: string, current: string, lang: string): string | null {
    const prevLines = previous.split('\n');
    const currLines = current.split('\n');
    const newLines: string[] = [];
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
        if (depth <= 0 && newLines.length > 1) { inBlock = false; }
      }
    }

    return newLines.length >= 3 ? newLines.slice(0, 60).join('\n') : null;
  }

  private _isFunctionStart(line: string, lang: string): boolean {
    const pats: Record<string, RegExp> = {
      javascript: /\b(function|=>|async)\b|^\s*(const|let|var)\s+\w+\s*=\s*(async\s*)?\(/,
      typescript: /\b(function|=>|async)\b|^\s*(const|let|var)\s+\w+\s*=\s*(async\s*)?\(/,
      python:     /^\s*def\s+\w+\s*\(/,
      java:       /\b(public|private|protected|static)\b.*\w+\s*\(/,
      go:         /^func\s+/,
      rust:       /^(pub\s+)?fn\s+/,
      c:          /^\w[\w\s*]+\s+\w+\s*\(/,
      cpp:        /^\w[\w\s*]+\s+\w+\s*\(/,
    };
    return (pats[lang] ?? /\bfunction\b|\bdef\b|\bfunc\b/).test(line);
  }

  public triggerManual(editor: vscode.TextEditor): void {
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

  public setActive(active: boolean): void { this._active = active; }
  public isActive(): boolean { return this._active; }

  public dispose(): void {
    if (this._debounceTimer !== undefined) clearTimeout(this._debounceTimer);
    this._disposables.forEach(d => d.dispose());
  }
}

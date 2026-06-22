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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const panel_1 = require("./panel");
const watcher_1 = require("./watcher");
const session_1 = require("./session");
const claude_1 = require("./claude");
let quizPanel;
let codeWatcher;
let session;
// Queue of pending questions for the current batch
let questionQueue = [];
let currentQuestionIndex = 0;
const PROFESSOR_REFUSALS = [
    "A professor's job isn't to give you fish. What haven't you verified yet?",
    "Nope. Go back to your assumptions. Which one could break this?",
    "Not yet. Can you reproduce the behavior in 10 lines? Try that first.",
    "Still here? Log the value at each step and come back with evidence.",
    "Questions before answers. What does the code do on line 1? Work down.",
];
function activate(context) {
    console.log('Code Quiz is active');
    session = new session_1.SessionManager();
    quizPanel = new panel_1.QuizPanel(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(panel_1.QuizPanel.viewType, quizPanel));
    quizPanel.onMessage(async (msg) => {
        const config = vscode.workspace.getConfiguration('codeQuiz');
        const apiKey = config.get('geminiApiKey', '');
        const professorMode = config.get('professorMode', false);
        switch (msg.type) {
            case 'ready':
                quizPanel.send({
                    type: 'activeState',
                    payload: { active: codeWatcher?.isActive() ?? true, professorMode },
                });
                quizPanel.send({ type: 'stats', payload: session.getStats() });
                break;
            case 'toggleActive':
                codeWatcher?.setActive(msg.payload);
                break;
            case 'submitAnswer': {
                const { id, answer } = msg.payload;
                session.updateResult(id, 'pending', answer);
                console.log('[CodeQuiz] submitAnswer id:', id, 'apiKey length:', apiKey.length);
                if (!apiKey) {
                    quizPanel.send({ type: 'verdictResult', payload: { correct: false, partial: false, explanation: 'Add your Gemini API key in settings (Code Quiz: Gemini Api Key) to get real answer verification.', followUp: null, historyItem: null, hasNext: false } });
                    return;
                }
                const history = session.getHistory();
                const q = history.find(q => q.id === id);
                if (!q)
                    return;
                let verdict;
                try {
                    verdict = await (0, claude_1.verifyAnswer)(apiKey, q, answer, professorMode);
                    console.log('[CodeQuiz] verdict:', JSON.stringify(verdict));
                }
                catch (err) {
                    console.error('[CodeQuiz] verifyAnswer threw:', err);
                    quizPanel.send({ type: 'verdictResult', payload: { correct: false, partial: false, explanation: 'Error checking answer: ' + String(err), followUp: null, historyItem: null, hasNext: false } });
                    break;
                }
                if (!verdict) {
                    quizPanel.send({ type: 'verdictResult', payload: { correct: false, partial: false, explanation: 'Could not verify — check your API key.', followUp: null, historyItem: null, hasNext: false } });
                    return;
                }
                const result = verdict.correct ? 'correct' : (verdict.explanation.toLowerCase().includes('partial') ? 'partial' : 'incorrect');
                session.updateResult(id, result);
                session.updateVerdict(id, verdict);
                const updatedQ = session.getHistory().find(q => q.id === id);
                const hasNext = currentQuestionIndex < questionQueue.length - 1;
                quizPanel.send({
                    type: 'verdictResult',
                    payload: {
                        correct: verdict.correct,
                        partial: result === 'partial',
                        explanation: verdict.explanation,
                        followUp: verdict.followUp ?? null,
                        historyItem: updatedQ ?? null,
                        hasNext,
                        queueProgress: `${currentQuestionIndex + 1} of ${questionQueue.length}`,
                    },
                });
                quizPanel.send({ type: 'stats', payload: session.getStats() });
                break;
            }
            case 'nextQuestion': {
                currentQuestionIndex++;
                if (currentQuestionIndex < questionQueue.length) {
                    const nextQ = questionQueue[currentQuestionIndex];
                    quizPanel.send({ type: 'newQuestion', payload: { ...nextQ, queueProgress: `${currentQuestionIndex + 1} of ${questionQueue.length}` } });
                }
                else {
                    // All questions done — show summary
                    quizPanel.send({ type: 'quizComplete', payload: session.getStats() });
                }
                break;
            }
            case 'skipQuestion': {
                const { id } = msg.payload;
                session.updateResult(id, 'skipped');
                quizPanel.send({ type: 'stats', payload: session.getStats() });
                currentQuestionIndex++;
                if (currentQuestionIndex < questionQueue.length) {
                    const nextQ = questionQueue[currentQuestionIndex];
                    quizPanel.send({ type: 'newQuestion', payload: { ...nextQ, queueProgress: `${currentQuestionIndex + 1} of ${questionQueue.length}` } });
                }
                else {
                    quizPanel.send({ type: 'quizComplete', payload: session.getStats() });
                }
                break;
            }
            case 'requestHint': {
                const { id } = msg.payload;
                const q = session.getHistory().find(q => q.id === id);
                if (!q)
                    return;
                if (professorMode) {
                    quizPanel.send({ type: 'professorRefusal', payload: { message: PROFESSOR_REFUSALS[Math.floor(Math.random() * PROFESSOR_REFUSALS.length)] } });
                    return;
                }
                const hint = await (0, claude_1.generateHint)(apiKey, q);
                quizPanel.send({ type: 'hint', payload: { hint } });
                break;
            }
        }
    });
    codeWatcher = new watcher_1.CodeWatcher(async (event) => {
        await handleTrigger(event);
    });
    context.subscriptions.push({ dispose: () => codeWatcher.dispose() });
    context.subscriptions.push(vscode.commands.registerCommand('codeQuiz.openPanel', () => {
        vscode.commands.executeCommand('workbench.view.extension.codeQuiz');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codeQuiz.toggleActive', () => {
        const newState = !codeWatcher.isActive();
        codeWatcher.setActive(newState);
        quizPanel.send({ type: 'activeState', payload: { active: newState, professorMode: false } });
        vscode.window.showInformationMessage(`Code Quiz: ${newState ? 'Watching 👀' : 'Paused ⏸'}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codeQuiz.quizNow', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Code Quiz: Open a file first.');
            return;
        }
        codeWatcher.triggerManual(editor);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codeQuiz.showHistory', () => {
        vscode.commands.executeCommand('workbench.view.extension.codeQuiz');
    }));
}
async function handleTrigger(event) {
    const config = vscode.workspace.getConfiguration('codeQuiz');
    const apiKey = config.get('geminiApiKey', '');
    const difficulty = config.get('difficulty', 'standard');
    console.log('[CodeQuiz] handleTrigger fired. reason:', event.reason, 'apiKey length:', apiKey.length, 'language:', event.language);
    vscode.commands.executeCommand('workbench.view.extension.codeQuiz');
    quizPanel.send({ type: 'loading', payload: { message: 'Generating questions...' } });
    const recentTopics = session.getRecentTopics(5);
    const scope = event.reason === 'manual' ? 'full_file' : 'snippet';
    let rawQuestions = null;
    if (apiKey) {
        try {
            rawQuestions = await (0, claude_1.generateQuestions)(apiKey, event.changedLines || event.code, event.language, event.fileName, difficulty, recentTopics, scope);
            console.log('[CodeQuiz] generateQuestions result count:', rawQuestions?.length ?? 0);
        }
        catch (err) {
            console.error('[CodeQuiz] generateQuestions threw:', err);
        }
    }
    else {
        console.log('[CodeQuiz] No API key — using fallback.');
    }
    // Fallback if no API key or AI failed
    if (!rawQuestions || rawQuestions.length === 0) {
        rawQuestions = getFallbackQuestions(event.language);
    }
    // Build question objects and queue them
    questionQueue = rawQuestions.map(q => ({
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        triggerReason: event.reason,
        language: event.language,
        fileName: event.fileName,
        codeSnippet: q.codeSnippet || event.changedLines.slice(0, 300),
        question: q.question,
        category: q.category,
        difficulty,
        result: 'pending',
    }));
    // Add all to session
    questionQueue.forEach(q => session.addQuestion(q));
    currentQuestionIndex = 0;
    // Send first question
    const first = questionQueue[0];
    quizPanel.send({ type: 'newQuestion', payload: { ...first, queueProgress: `1 of ${questionQueue.length}` } });
    quizPanel.send({ type: 'stats', payload: session.getStats() });
}
function getFallbackQuestions(language) {
    const map = {
        javascript: [
            { question: 'What happens to this code if the input is null or undefined?', category: 'edge_case', codeSnippet: '// (the code you just wrote)' },
            { question: 'Could this code throw an unhandled exception? In what scenario?', category: 'bug_risk', codeSnippet: '// (the code you just wrote)' },
            { question: 'What is the time complexity of this code?', category: 'complexity', codeSnippet: '// (the code you just wrote)' },
        ],
        python: [
            { question: 'What would happen if this function received an empty list?', category: 'edge_case', codeSnippet: '# (the code you just wrote)' },
            { question: 'Is this function pure? Does it have side effects?', category: 'side_effect', codeSnippet: '# (the code you just wrote)' },
            { question: 'What is the time complexity of this code?', category: 'complexity', codeSnippet: '# (the code you just wrote)' },
        ],
        cpp: [
            { question: 'Is there a risk of a buffer overflow or out-of-bounds access here?', category: 'bug_risk', codeSnippet: '// (the code you just wrote)' },
            { question: 'Is memory properly managed? Are there any leaks?', category: 'bug_risk', codeSnippet: '// (the code you just wrote)' },
            { question: 'What happens when the array is empty or size is 0?', category: 'edge_case', codeSnippet: '// (the code you just wrote)' },
        ],
    };
    return map[language] ?? map['javascript'];
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
import * as vscode from 'vscode';
import { QuizPanel } from './panel';
import { CodeWatcher, TriggerEvent } from './watcher';
import { SessionManager } from './session';
import { MemoryManager } from './memory';
import { generateQuestions, verifyAnswer, generateHint } from './claude';
import { QuizQuestion, Difficulty } from './types';

let quizPanel: QuizPanel;
let codeWatcher: CodeWatcher;
let session: SessionManager;
let memory: MemoryManager;

let questionQueue: QuizQuestion[] = [];
let currentQuestionIndex = 0;

const PROFESSOR_REFUSALS = [
  "A professor's job isn't to give you fish. What haven't you verified yet?",
  "Nope. Go back to your assumptions. Which one could break this?",
  "Not yet. Can you reproduce the behavior in 10 lines? Try that first.",
  "Still here? Log the value at each step and come back with evidence.",
  "Questions before answers. What does the code do on line 1? Work down.",
];

export function activate(context: vscode.ExtensionContext) {
  console.log('Code Quiz is active');

  session = new SessionManager();
  memory = new MemoryManager(context);

  quizPanel = new QuizPanel(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(QuizPanel.viewType, quizPanel)
  );

  quizPanel.onMessage(async (msg) => {
    const config = vscode.workspace.getConfiguration('codeQuiz');
    const apiKey = config.get<string>('geminiApiKey', '');
    const professorMode = config.get<boolean>('professorMode', false);

    switch (msg.type) {
      case 'ready':
        quizPanel.send({
          type: 'activeState',
          payload: { active: codeWatcher?.isActive() ?? true, professorMode },
        });
        quizPanel.send({ type: 'stats', payload: session.getStats() });
        // Send long-term weak spots on startup
        quizPanel.send({ type: 'weakSpots', payload: memory.getAllTimeStats() });
        break;

      case 'toggleActive':
        codeWatcher?.setActive(msg.payload as boolean);
        break;

      case 'submitAnswer': {
        const { id, answer } = msg.payload as { id: string; answer: string };
        session.updateResult(id, 'pending', answer);
        console.log('[CodeQuiz] submitAnswer id:', id, 'apiKey length:', apiKey.length);

        if (!apiKey) {
          quizPanel.send({ type: 'verdictResult', payload: { correct: false, partial: false, explanation: 'Add your Gemini API key in settings (Code Quiz: Gemini Api Key) to get real answer verification.', followUp: null, historyItem: null, hasNext: false } });
          return;
        }

        const history = session.getHistory();
        const q = history.find(q => q.id === id);
        if (!q) return;

        let verdict;
        try {
          verdict = await verifyAnswer(apiKey, q, answer, professorMode);
          console.log('[CodeQuiz] verdict:', JSON.stringify(verdict));
        } catch (err) {
          console.error('[CodeQuiz] verifyAnswer threw:', err);
          quizPanel.send({ type: 'verdictResult', payload: { correct: false, partial: false, explanation: 'Error: ' + String(err), followUp: null, historyItem: null, hasNext: false } });
          break;
        }

        if (!verdict) {
          quizPanel.send({ type: 'verdictResult', payload: { correct: false, partial: false, explanation: 'Could not verify — check your API key.', followUp: null, historyItem: null, hasNext: false } });
          return;
        }

        const result = verdict.correct ? 'correct' : (verdict.explanation.toLowerCase().includes('partial') ? 'partial' : 'incorrect');
        session.updateResult(id, result);
        session.updateVerdict(id, verdict);

        // ── Record to long-term memory ──────────────────────────────────────
        const stats = session.getStats();
        await memory.record(q.language, q.category, result, q.question, stats.streak);

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
        quizPanel.send({ type: 'stats', payload: stats });
        // Refresh weak spots after every answer
        quizPanel.send({ type: 'weakSpots', payload: memory.getAllTimeStats() });
        break;
      }

      case 'nextQuestion': {
        currentQuestionIndex++;
        if (currentQuestionIndex < questionQueue.length) {
          const nextQ = questionQueue[currentQuestionIndex];
          quizPanel.send({ type: 'newQuestion', payload: { ...nextQ, queueProgress: `${currentQuestionIndex + 1} of ${questionQueue.length}` } });
        } else {
          quizPanel.send({ type: 'quizComplete', payload: { ...session.getStats(), weakSpots: memory.getWeakSpots(questionQueue[0]?.language, 3) } });
        }
        break;
      }

      case 'skipQuestion': {
        const { id } = msg.payload as { id: string };
        session.updateResult(id, 'skipped');

        const skippedQ = session.getHistory().find(q => q.id === id);
        if (skippedQ) {
          await memory.record(skippedQ.language, skippedQ.category, 'skipped', skippedQ.question, 0);
        }

        quizPanel.send({ type: 'stats', payload: session.getStats() });

        currentQuestionIndex++;
        if (currentQuestionIndex < questionQueue.length) {
          const nextQ = questionQueue[currentQuestionIndex];
          quizPanel.send({ type: 'newQuestion', payload: { ...nextQ, queueProgress: `${currentQuestionIndex + 1} of ${questionQueue.length}` } });
        } else {
          quizPanel.send({ type: 'quizComplete', payload: { ...session.getStats(), weakSpots: memory.getWeakSpots(questionQueue[0]?.language, 3) } });
        }
        break;
      }

      case 'requestHint': {
        const { id } = msg.payload as { id: string };
        const q = session.getHistory().find(q => q.id === id);
        if (!q) return;

        if (professorMode) {
          quizPanel.send({ type: 'professorRefusal', payload: { message: PROFESSOR_REFUSALS[Math.floor(Math.random() * PROFESSOR_REFUSALS.length)] } });
          return;
        }

        const hint = await generateHint(apiKey, q);
        quizPanel.send({ type: 'hint', payload: { hint } });
        break;
      }
    }
  });

  codeWatcher = new CodeWatcher(async (event: TriggerEvent) => {
    await handleTrigger(event);
  });
  context.subscriptions.push({ dispose: () => codeWatcher.dispose() });

  context.subscriptions.push(
    vscode.commands.registerCommand('codeQuiz.openPanel', () => {
      vscode.commands.executeCommand('workbench.view.extension.codeQuiz');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeQuiz.toggleActive', () => {
      const newState = !codeWatcher.isActive();
      codeWatcher.setActive(newState);
      quizPanel.send({ type: 'activeState', payload: { active: newState, professorMode: false } });
      vscode.window.showInformationMessage(`Code Quiz: ${newState ? 'Watching 👀' : 'Paused ⏸'}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeQuiz.quizNow', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Code Quiz: Open a file first.');
        return;
      }
      codeWatcher.triggerManual(editor);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeQuiz.showHistory', () => {
      vscode.commands.executeCommand('workbench.view.extension.codeQuiz');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeQuiz.clearMemory', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Clear all Code Quiz learning history? This cannot be undone.',
        'Clear', 'Cancel'
      );
      if (confirm === 'Clear') {
        await memory.clearMemory();
        quizPanel.send({ type: 'weakSpots', payload: memory.getAllTimeStats() });
        vscode.window.showInformationMessage('Code Quiz: Learning history cleared.');
      }
    })
  );
}

async function handleTrigger(event: TriggerEvent) {
  const config = vscode.workspace.getConfiguration('codeQuiz');
  const apiKey = config.get<string>('geminiApiKey', '');
  const difficulty = config.get<Difficulty>('difficulty', 'standard');

  console.log('[CodeQuiz] handleTrigger fired. reason:', event.reason, 'apiKey length:', apiKey.length, 'language:', event.language);

  vscode.commands.executeCommand('workbench.view.extension.codeQuiz');
  quizPanel.send({ type: 'loading', payload: { message: 'Generating questions...' } });

  await memory.incrementSession(event.language);

  const recentTopics = session.getRecentTopics(5);
  const scope: 'snippet' | 'full_file' = event.reason === 'manual' ? 'full_file' : 'snippet';

  // Build personalised context from long-term memory
  const memoryContext = memory.buildPromptContext(event.language);
  const weakSpots = memory.getWeakSpots(event.language, 3);

  let rawQuestions: Array<{ question: string; category: string; codeSnippet: string }> | null = null;

  if (apiKey) {
    try {
      rawQuestions = await generateQuestions(
        apiKey,
        event.changedLines || event.code,
        event.language,
        event.fileName,
        difficulty,
        recentTopics,
        scope,
        memoryContext,
        weakSpots
      );
      console.log('[CodeQuiz] generateQuestions result count:', rawQuestions?.length ?? 0);
    } catch (err) {
      console.error('[CodeQuiz] generateQuestions threw:', err);
    }
  } else {
    console.log('[CodeQuiz] No API key — using fallback.');
  }

  if (!rawQuestions || rawQuestions.length === 0) {
    rawQuestions = getFallbackQuestions(event.language);
  }

  questionQueue = rawQuestions.map(q => ({
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    triggerReason: event.reason,
    language: event.language,
    fileName: event.fileName,
    codeSnippet: q.codeSnippet || event.changedLines.slice(0, 300),
    question: q.question,
    category: q.category as QuizQuestion['category'],
    difficulty,
    result: 'pending' as const,
  }));

  questionQueue.forEach(q => session.addQuestion(q));
  currentQuestionIndex = 0;

  const first = questionQueue[0];
  quizPanel.send({ type: 'newQuestion', payload: { ...first, queueProgress: `1 of ${questionQueue.length}` } });
  quizPanel.send({ type: 'stats', payload: session.getStats() });
  quizPanel.send({ type: 'weakSpots', payload: memory.getAllTimeStats() });
}

function getFallbackQuestions(language: string) {
  const map: Record<string, Array<{ question: string; category: string; codeSnippet: string }>> = {
    javascript: [
      { question: 'What happens if the input is null or undefined?', category: 'edge_case', codeSnippet: '// (the code you just wrote)' },
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

export function deactivate() {}

export type TriggerReason = 'paste' | 'function_complete' | 'manual' | 'idle';
export type Difficulty = 'gentle' | 'standard' | 'rigorous';
export type AnswerResult = 'correct' | 'partial' | 'incorrect' | 'skipped' | 'pending';

export interface QuizQuestion {
  id: string;
  timestamp: number;
  triggerReason: TriggerReason;
  language: string;
  fileName: string;
  codeSnippet: string;
  question: string;
  followUpQuestion?: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  answer?: string;
  aiVerdict?: AiVerdict;
  result: AnswerResult;
}

export type QuestionCategory =
  | 'intent'
  | 'edge_case'
  | 'complexity'
  | 'bug_risk'
  | 'alternative'
  | 'side_effect';

export interface AiVerdict {
  correct: boolean;
  explanation: string;
  followUp?: string;
}

export interface SessionStats {
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
  skipped: number;
  streak: number;
  topicsCovered: string[];
}

// ─── Long-term memory types ────────────────────────────────────────────────

export interface CategoryRecord {
  correct: number;
  incorrect: number;
  partial: number;
  skipped: number;
  lastSeen: number; // timestamp
}

export interface LanguageRecord {
  categories: Record<QuestionCategory, CategoryRecord>;
  totalSessions: number;
  lastActive: number;
}

export interface LongTermMemory {
  // language -> category -> record
  byLanguage: Record<string, LanguageRecord>;
  // flat list of the last N completed questions for context
  recentHistory: Array<{
    timestamp: number;
    language: string;
    category: QuestionCategory;
    result: AnswerResult;
    question: string;
  }>;
  allTimeBestStreak: number;
  totalQuestionsAnswered: number;
}

export interface WeakSpot {
  category: QuestionCategory;
  language: string;
  accuracy: number; // 0–1
  count: number;    // total attempts
}

export interface WebviewMessage {
  type:
    | 'submitAnswer'
    | 'skipQuestion'
    | 'requestHint'
    | 'newSession'
    | 'toggleActive'
    | 'openSettings'
    | 'nextQuestion'
    | 'ready';
  payload?: unknown;
}

export interface ExtensionMessage {
  type:
    | 'newQuestion'
    | 'verdictResult'
    | 'loading'
    | 'idle'
    | 'stats'
    | 'activeState'
    | 'professorRefusal'
    | 'quizComplete'
    | 'weakSpots'
    | 'hint';
  payload?: unknown;
}


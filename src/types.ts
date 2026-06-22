export type TriggerReason = 'paste' | 'function_complete' | 'manual' | 'idle';
export type Difficulty = 'gentle' | 'standard' | 'rigorous';
export type AnswerResult = 'correct' | 'partial' | 'incorrect' | 'skipped' | 'pending';

export interface QuizQuestion {
  id: string;
  timestamp: number;
  triggerReason: TriggerReason;
  language: string;
  fileName: string;
  codeSnippet: string;        // the chunk of code the question is about
  question: string;
  followUpQuestion?: string;  // professor mode follow-up
  category: QuestionCategory;
  difficulty: Difficulty;
  answer?: string;            // user's typed answer
  aiVerdict?: AiVerdict;     // what Claude thinks of the answer
  result: AnswerResult;
}

export type QuestionCategory =
  | 'intent'        // what does this code actually do?
  | 'edge_case'     // what happens when X?
  | 'complexity'    // what's the time/space complexity?
  | 'bug_risk'      // what could go wrong here?
  | 'alternative'   // why this approach and not Y?
  | 'side_effect';  // what else does this affect?

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
    | 'hint';
  payload?: unknown;
}

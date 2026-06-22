import { QuizQuestion, SessionStats, AnswerResult } from './types';

export class SessionManager {
  private _questions: QuizQuestion[] = [];
  private _streak = 0;
  private _topicsCovered: Set<string> = new Set();

  addQuestion(q: QuizQuestion) {
    this._questions.push(q);
    this._topicsCovered.add(q.category);
  }

  updateResult(id: string, result: AnswerResult, answer?: string) {
    const q = this._questions.find(q => q.id === id);
    if (!q) return;
    q.result = result;
    if (answer !== undefined) q.answer = answer;

    if (result === 'correct') {
      this._streak++;
    } else if (result === 'incorrect' || result === 'skipped') {
      this._streak = 0;
    }
  }

  updateVerdict(id: string, verdict: NonNullable<QuizQuestion['aiVerdict']>) {
    const q = this._questions.find(q => q.id === id);
    if (q) q.aiVerdict = verdict;
  }

  getStats(): SessionStats {
    const byResult = (r: AnswerResult) => this._questions.filter(q => q.result === r).length;
    return {
      total: this._questions.length,
      correct: byResult('correct'),
      partial: byResult('partial'),
      incorrect: byResult('incorrect'),
      skipped: byResult('skipped'),
      streak: this._streak,
      topicsCovered: Array.from(this._topicsCovered),
    };
  }

  getRecentTopics(n = 5): string[] {
    return this._questions.slice(-n).map(q => q.category);
  }

  getHistory(): QuizQuestion[] {
    return [...this._questions].reverse();
  }

  reset() {
    this._questions = [];
    this._streak = 0;
    this._topicsCovered.clear();
  }
}

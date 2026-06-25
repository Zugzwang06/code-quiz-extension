import * as vscode from 'vscode';
import {
  LongTermMemory,
  QuestionCategory,
  AnswerResult,
  WeakSpot,
  LanguageRecord,
  CategoryRecord,
} from './types';

const MEMORY_KEY = 'codeQuiz.longTermMemory';
const MAX_RECENT_HISTORY = 200;

const ALL_CATEGORIES: QuestionCategory[] = [
  'intent', 'edge_case', 'complexity', 'bug_risk', 'alternative', 'side_effect'
];

function emptyCategory(): CategoryRecord {
  return { correct: 0, incorrect: 0, partial: 0, skipped: 0, lastSeen: 0 };
}

function emptyLanguage(): LanguageRecord {
  const categories = {} as Record<QuestionCategory, CategoryRecord>;
  for (const cat of ALL_CATEGORIES) {
    categories[cat] = emptyCategory();
  }
  return { categories, totalSessions: 0, lastActive: Date.now() };
}

function emptyMemory(): LongTermMemory {
  return {
    byLanguage: {},
    recentHistory: [],
    allTimeBestStreak: 0,
    totalQuestionsAnswered: 0,
  };
}

export class MemoryManager {
  private _context: vscode.ExtensionContext;
  private _memory: LongTermMemory;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this._memory = this._load();
  }

  private _load(): LongTermMemory {
    const stored = this._context.globalState.get<LongTermMemory>(MEMORY_KEY);
    if (!stored) return emptyMemory();
    // Ensure all categories exist for all languages (handles schema migrations)
    for (const lang of Object.keys(stored.byLanguage)) {
      const rec = stored.byLanguage[lang];
      for (const cat of ALL_CATEGORIES) {
        if (!rec.categories[cat]) {
          rec.categories[cat] = emptyCategory();
        }
      }
    }
    return stored;
  }

  private async _save(): Promise<void> {
    await this._context.globalState.update(MEMORY_KEY, this._memory);
  }

  // ─── Record a question result ─────────────────────────────────────────────

  async record(
    language: string,
    category: QuestionCategory,
    result: AnswerResult,
    question: string,
    currentStreak: number
  ): Promise<void> {
    if (result === 'pending') return;

    // Ensure language record exists
    if (!this._memory.byLanguage[language]) {
      this._memory.byLanguage[language] = emptyLanguage();
    }

    const langRec = this._memory.byLanguage[language];
    const catRec = langRec.categories[category];
    const now = Date.now();

    // Update category record
    if (result === 'correct') catRec.correct++;
    else if (result === 'incorrect') catRec.incorrect++;
    else if (result === 'partial') catRec.partial++;
    else if (result === 'skipped') catRec.skipped++;

    catRec.lastSeen = now;
    langRec.lastActive = now;

    // Update global stats
    this._memory.totalQuestionsAnswered++;
    if (currentStreak > this._memory.allTimeBestStreak) {
      this._memory.allTimeBestStreak = currentStreak;
    }

    // Append to recent history (capped)
    this._memory.recentHistory.push({
      timestamp: now,
      language,
      category,
      result,
      question: question.slice(0, 120),
    });
    if (this._memory.recentHistory.length > MAX_RECENT_HISTORY) {
      this._memory.recentHistory = this._memory.recentHistory.slice(-MAX_RECENT_HISTORY);
    }

    await this._save();
  }

  async incrementSession(language: string): Promise<void> {
    if (!this._memory.byLanguage[language]) {
      this._memory.byLanguage[language] = emptyLanguage();
    }
    this._memory.byLanguage[language].totalSessions++;
    await this._save();
  }

  // ─── Compute weak spots ───────────────────────────────────────────────────

  getWeakSpots(language?: string, topN = 3): WeakSpot[] {
    const spots: WeakSpot[] = [];

    const langs = language ? [language] : Object.keys(this._memory.byLanguage);

    for (const lang of langs) {
      const langRec = this._memory.byLanguage[lang];
      if (!langRec) continue;

      for (const cat of ALL_CATEGORIES) {
        const rec = langRec.categories[cat];
        const total = rec.correct + rec.incorrect + rec.partial + rec.skipped;
        if (total < 2) continue; // not enough data

        // Weight: correct = 1, partial = 0.5, incorrect/skipped = 0
        const score = (rec.correct + rec.partial * 0.5) / total;
        spots.push({
          category: cat,
          language: lang,
          accuracy: Math.round(score * 100) / 100,
          count: total,
        });
      }
    }

    // Sort by accuracy ascending (worst first), then by count descending (most-seen first)
    spots.sort((a, b) => {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return b.count - a.count;
    });

    return spots.slice(0, topN);
  }

  // ─── Build a context string for the Gemini prompt ────────────────────────

  buildPromptContext(language: string): string {
    const weakSpots = this.getWeakSpots(language, 3);
    if (weakSpots.length === 0) return '';

    const langRec = this._memory.byLanguage[language];
    const total = this._memory.totalQuestionsAnswered;

    const weakList = weakSpots
      .map(w => `${w.category} (${Math.round(w.accuracy * 100)}% accuracy over ${w.count} attempts)`)
      .join(', ');

    let context = `LEARNER CONTEXT (use this to personalise questions):\n`;
    context += `- Total questions answered across all sessions: ${total}\n`;
    if (langRec) {
      context += `- Sessions in ${language}: ${langRec.totalSessions}\n`;
    }
    context += `- Weakest areas in ${language}: ${weakList}\n`;
    context += `- PRIORITY: Generate at least one question targeting the weakest category above.\n`;

    return context;
  }

  // ─── Stats for the sidebar panel ─────────────────────────────────────────

  getAllTimeStats() {
    const byLang: Record<string, { correct: number; total: number }> = {};

    for (const [lang, rec] of Object.entries(this._memory.byLanguage)) {
      let correct = 0, total = 0;
      for (const cat of ALL_CATEGORIES) {
        const c = rec.categories[cat];
        correct += c.correct + c.partial * 0.5;
        total += c.correct + c.incorrect + c.partial + c.skipped;
      }
      byLang[lang] = { correct: Math.round(correct), total };
    }

    return {
      totalAnswered: this._memory.totalQuestionsAnswered,
      bestStreak: this._memory.allTimeBestStreak,
      byLanguage: byLang,
      weakSpots: this.getWeakSpots(undefined, 5),
      recentHistory: this._memory.recentHistory.slice(-20).reverse(),
    };
  }

  async clearMemory(): Promise<void> {
    this._memory = emptyMemory();
    await this._save();
  }
}

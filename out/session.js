"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
class SessionManager {
    constructor() {
        this._questions = [];
        this._streak = 0;
        this._topicsCovered = new Set();
    }
    addQuestion(q) {
        this._questions.push(q);
        this._topicsCovered.add(q.category);
    }
    updateResult(id, result, answer) {
        const q = this._questions.find(q => q.id === id);
        if (!q)
            return;
        q.result = result;
        if (answer !== undefined)
            q.answer = answer;
        if (result === 'correct') {
            this._streak++;
        }
        else if (result === 'incorrect' || result === 'skipped') {
            this._streak = 0;
        }
    }
    updateVerdict(id, verdict) {
        const q = this._questions.find(q => q.id === id);
        if (q)
            q.aiVerdict = verdict;
    }
    getStats() {
        const byResult = (r) => this._questions.filter(q => q.result === r).length;
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
    getRecentTopics(n = 5) {
        return this._questions.slice(-n).map(q => q.category);
    }
    getHistory() {
        return [...this._questions].reverse();
    }
    reset() {
        this._questions = [];
        this._streak = 0;
        this._topicsCovered.clear();
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=session.js.map
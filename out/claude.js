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
exports.generateQuestions = generateQuestions;
exports.generateQuestion = generateQuestion;
exports.verifyAnswer = verifyAnswer;
exports.generateHint = generateHint;
/* eslint-disable @typescript-eslint/no-explicit-any */
const https = __importStar(require("https"));
function callGemini(apiKey, prompt, systemPrompt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
        });
        const path = `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        reject(new Error(parsed.error.message));
                        return;
                    }
                    const text = (parsed.candidates?.[0]?.content?.parts?.[0]?.text) ?? '';
                    resolve(text);
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
function safeParseJson(text) {
    try {
        const clean = text.replace(/```json|```/g, '').trim();
        return JSON.parse(clean);
    }
    catch {
        return null;
    }
}
// ─── Generate MULTIPLE questions from a code snippet ──────────────────────────
async function generateQuestions(apiKey, code, language, fileName, difficulty, recentTopics, scope = 'snippet') {
    const difficultyGuide = {
        gentle: 'Focus on intent and basic understanding.',
        standard: 'Mix of intent, edge cases, and tradeoffs.',
        rigorous: 'Focus on edge cases, failure modes, complexity, and subtle bugs.',
    };
    const avoidTopics = recentTopics.length > 0
        ? `Avoid questions about these recently covered topics: ${recentTopics.join(', ')}.`
        : '';
    // How many questions based on scope and code size
    const numQuestions = scope === 'full_file' ? 5 : Math.min(5, Math.max(2, Math.floor(code.length / 150)));
    console.log('[CodeQuiz claude.ts] scope:', scope, 'code.length:', code.length, 'numQuestions:', numQuestions);
    const scopeIntro = scope === 'full_file'
        ? `A developer wants to be thoroughly quizzed on their ENTIRE ${language} file (${fileName}). Generate questions that cover different parts and aspects of the whole file.`
        : `A developer just pasted this ${language} code in ${fileName}. Generate questions that test understanding of different parts of it.`;
    const system = [
        'You are a Socratic programming tutor. You generate quiz questions to test genuine understanding.',
        'You NEVER explain or teach — only ask questions.',
        'Each question must target a DIFFERENT part or concept of the code.',
        difficultyGuide[difficulty],
        avoidTopics,
        'Respond with valid JSON only. No preamble, no markdown fences.',
    ].join('\n');
    const prompt = `${scopeIntro}

\`\`\`${language}
${code.slice(0, 12000)}
\`\`\`

Generate exactly ${numQuestions} Socratic questions. Each must:
- Target a DIFFERENT function, class, concept, or line range
- Cover different categories across the set
- Reveal whether the developer truly understands that part

Respond with this exact JSON:
{
  "questions": [
    {
      "question": "your question here",
      "category": "one of: intent|edge_case|complexity|bug_risk|alternative|side_effect",
      "codeSnippet": "the specific 1-5 lines this question is about (copied exactly from the code)"
    }
  ]
}`;
    try {
        const response = await callGemini(apiKey, prompt, system);
        console.log('[CodeQuiz claude.ts] raw response (first 300 chars):', response.slice(0, 300));
        console.log('[CodeQuiz claude.ts] raw response total length:', response.length);
        const parsed = safeParseJson(response);
        if (!parsed?.questions?.length) {
            console.error('[CodeQuiz claude.ts] failed to parse questions. Raw:', response);
            return null;
        }
        console.log('[CodeQuiz claude.ts] parsed question count:', parsed.questions.length, '(requested:', numQuestions, ')');
        return parsed.questions;
    }
    catch (err) {
        console.error('[CodeQuiz claude.ts] callGemini threw:', err);
        return null;
    }
}
// ─── Keep single-question function as alias for compatibility ──────────────────
async function generateQuestion(apiKey, code, language, fileName, difficulty, recentTopics, scope = 'snippet') {
    const questions = await generateQuestions(apiKey, code, language, fileName, difficulty, recentTopics, scope);
    return questions?.[0] ?? null;
}
// ─── Verify the developer's answer ──────────────────────────────────────────
async function verifyAnswer(apiKey, question, answer, professorMode) {
    const system = [
        'You are a rigorous but fair programming tutor evaluating a developer\'s answer.',
        'Be honest — partial credit for partially right answers.',
        professorMode
            ? 'PROFESSOR MODE: Never reveal the correct answer. If wrong, ask a follow-up question instead.'
            : 'If wrong or partial, give a clear explanation of what they missed.',
        'Always respond with valid JSON only. No preamble, no markdown fences.',
    ].join('\n');
    const prompt = `Code:\n\`\`\`${question.language}\n${question.codeSnippet}\n\`\`\`\n\nQuestion: "${question.question}"\n\nDeveloper's answer: "${answer}"\n\nRespond with this exact JSON:\n{\n  "correct": true or false,\n  "explanation": "1-2 sentences of direct feedback",\n  "followUp": ${professorMode ? '"follow-up question if wrong, null if correct"' : 'null'}\n}`;
    try {
        const response = await callGemini(apiKey, prompt, system);
        return safeParseJson(response);
    }
    catch {
        return null;
    }
}
// ─── Generate a hint ──────────────────────────────────────────────────────────
async function generateHint(apiKey, question) {
    const system = 'Give a one-sentence hint that nudges toward the answer without revealing it.';
    const prompt = `Question: "${question.question}"\nCode: \`\`\`${question.language}\n${question.codeSnippet}\n\`\`\`\nOne sentence hint only.`;
    try {
        const response = await callGemini(apiKey, prompt, system);
        return response.trim().replace(/^["']|["']$/g, '');
    }
    catch {
        return 'Think about what happens when the inputs are at their extreme values.';
    }
}
//# sourceMappingURL=claude.js.map
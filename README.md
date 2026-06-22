# 🧠 Code Quiz — Do You Actually Understand This?

A VS Code extension that watches your code in real time and quizzes you on it — instead of explaining, autocompleting, or fixing it for you.

Built in response to a simple observation: AI coding tools are great at giving answers, but nothing checks whether the developer actually understood what just got written. This does that.

**Not autocomplete. Not Copilot. Not "explain this code." Questions only.**

---

## Demo

You paste or finish writing code → the sidebar opens with a Socratic question about a specific part of it → you answer → it tells you if you're right → it asks the next one. A typical session is a 5-question batch covering different functions, edge cases, and bug risks across the file.

Toggle **Professor Mode** and it stops giving you the answer entirely, even when you ask for a hint — it just asks another question instead.

---

## How it works

| Trigger | What happens |
|---|---|
| Paste a block of code (120+ characters) | Assumes you copied it without reading it closely — generates a multi-question batch about it |
| Finish writing a function | Waits a few seconds of inactivity, then asks about what you just wrote |
| Right-click → "Quiz Me On This File Now" | Generates 5 questions covering the **entire file**, not just the last thing typed |

Each trigger generates a batch of 2–5 questions (scaled to code size), shown one at a time with a progress indicator ("1 of 5"), a verdict after each answer, and a score summary at the end.

---

## Setup

### 1. Install

```bash
git clone https://github.com/your-username/code-quiz-extension.git
cd code-quiz-extension
npm install
npm run compile

# Package it
npm install -g @vscode/vsce
vsce package --allow-missing-repository

# Install the .vsix into VS Code
code --install-extension code-quiz-0.1.0.vsix
```

Or press **F5** inside the project in VS Code to launch an Extension Development Host immediately, no packaging required.

### 2. Add a free Gemini API key

1. Get one at [aistudio.google.com](https://aistudio.google.com) — free tier, no credit card
2. In VS Code: `Cmd+,` (or `Ctrl+,`) → search **Code Quiz** → paste it into **Gemini Api Key**

Without a key, the extension still runs — it falls back to a small set of built-in offline questions per language.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `codeQuiz.geminiApiKey` | `""` | Google Gemini API key for AI-generated questions |
| `codeQuiz.triggerOnPaste` | `true` | Generate questions when a large code block is pasted |
| `codeQuiz.triggerOnFunctionComplete` | `true` | Generate questions when a function is finished |
| `codeQuiz.debounceSeconds` | `6` | Idle time after typing before a function-complete trigger fires |
| `codeQuiz.professorMode` | `false` | Never reveal answers or give real hints — only ask more questions |
| `codeQuiz.difficulty` | `"standard"` | `gentle` / `standard` / `rigorous` |

---

## Professor Mode 🎓

With Professor Mode on, every "give me the answer" path — hints, follow-up requests — gets intercepted and replaced with another probing question instead. The goal is to make the *aha* moment of finding your own bug or gap in understanding the only way out, not a button click away.

---

## Why questions instead of explanations

There's a well-documented effect in learning research called the **testing effect**: being asked to retrieve information produces dramatically better retention than being told the same information, even when the explanation is perfect. Reading an explanation feels like learning. Being forced to produce an answer is what actually builds it.

Asking an AI to "explain this code" is still passive consumption. This flips it — the model holds the answer, you have to produce it first.

---

## File structure

```
code-quiz-extension/
├── src/
│   ├── extension.ts   ← entry point, command registration, question queue logic
│   ├── watcher.ts      ← detects paste / function-complete events from the editor
│   ├── claude.ts       ← Gemini API calls (question generation, answer verification, hints)
│   ├── panel.ts         ← sidebar webview UI (questions, verdicts, progress, summary)
│   ├── session.ts       ← tracks answer history, streaks, stats for the session
│   └── types.ts          ← shared TypeScript interfaces
├── media/
│   └── icon.svg
├── package.json
├── tsconfig.json
└── LICENSE
```

---

## Question categories

Each generated question is tagged with one of:

- **Intent** — what does this code actually do?
- **Edge case** — what happens with empty/null/zero/extreme input?
- **Complexity** — what's the time/space cost?
- **Bug risk** — what could silently break here?
- **Alternative** — why this approach instead of another?
- **Side effect** — what else does this touch or mutate?

---

## Known limitations

- Trigger detection (paste size, function-end regex) is heuristic and language-specific — it won't catch everything in every language equally well
- Requires a Gemini API key for real AI-generated questions; the offline fallback set is intentionally small
- No persistence between VS Code sessions yet — stats and history reset on reload

---

## Roadmap

- [ ] Persist session history across reloads
- [ ] Spaced repetition — resurface categories you've gotten wrong before
- [ ] Per-language question packs tuned for that language's common pitfalls
- [ ] Configurable question count for "Quiz Me On This File" (currently fixed at 5)
- [ ] Export a session as a markdown learning log

---

## License

MIT — see [LICENSE](./LICENSE)


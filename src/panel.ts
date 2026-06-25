import * as vscode from 'vscode';
import { ExtensionMessage, WebviewMessage } from './types';

export class QuizPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codeQuiz.sidebarView';
  private _view?: vscode.WebviewView;
  private _messageCallback?: (msg: WebviewMessage) => void;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = this._getHtml();
    if (this._messageCallback) {
      webviewView.webview.onDidReceiveMessage(this._messageCallback);
    }
  }

  public onMessage(callback: (msg: WebviewMessage) => void) {
    this._messageCallback = callback;
    if (this._view) {
      this._view.webview.onDidReceiveMessage(callback);
    }
  }

  public send(msg: ExtensionMessage) {
    if (!this._view) return;
    if (!this._view.visible) {
      this._view.show(true);
    }
    this._view.webview.postMessage(msg);
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code Quiz</title>
<style>
  :root {
    --bg: var(--vscode-sideBar-background, #1e1e2e);
    --surface: var(--vscode-editorWidget-background, #252535);
    --surface2: var(--vscode-input-background, #1a1a2a);
    --border: var(--vscode-widget-border, #3a3a5a);
    --text: var(--vscode-foreground, #cdd6f4);
    --muted: var(--vscode-descriptionForeground, #7f849c);
    --accent: #7c6af7;
    --accent-dim: rgba(124,106,247,0.15);
    --success: #a6e3a1;
    --success-dim: rgba(166,227,161,0.12);
    --warn: #f9e2af;
    --warn-dim: rgba(249,226,175,0.12);
    --danger: #f38ba8;
    --danger-dim: rgba(243,139,168,0.12);
    --professor: #fab387;
    --r: 8px;
    --mono: var(--vscode-editor-font-family, monospace);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: 12px; line-height: 1.6; }
  .wrap { padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 100vh; }
  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .header-left { display: flex; align-items: center; gap: 7px; }
  .logo { font-size: 16px; }
  .title { font-size: 13px; font-weight: 700; }
  .subtitle { font-size: 10px; color: var(--muted); }
  .toggle-btn { background: none; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); cursor: pointer; padding: 3px 8px; font-size: 10px; font-family: inherit; }
  .toggle-btn.active { border-color: var(--accent); color: var(--accent); }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .stat { background: var(--surface); border-radius: var(--r); padding: 6px 8px; text-align: center; }
  .stat-n { font-size: 16px; font-weight: 700; }
  .stat-l { font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1px; }
  .stat-n.green { color: var(--success); }
  .stat-n.yellow { color: var(--warn); }
  .stat-n.red { color: var(--danger); }
  .stat-n.purple { color: var(--accent); }
  .idle-state { text-align: center; padding: 24px 12px; color: var(--muted); }
  .idle-icon { font-size: 28px; margin-bottom: 8px; }
  .idle-title { font-size: 12px; color: var(--text); font-weight: 600; margin-bottom: 4px; }
  .idle-sub { font-size: 11px; color: var(--muted); }
  .loading { display: flex; align-items: center; gap: 8px; padding: 14px; background: var(--surface); border-radius: var(--r); color: var(--muted); font-size: 11px; }
  .spinner { width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .q-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; animation: slideIn 0.2s ease; }
  @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .q-meta { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--surface2); flex-wrap: wrap; }
  .q-badge { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 10px; }
  .badge-intent { background: var(--accent-dim); color: var(--accent); }
  .badge-edge_case { background: var(--warn-dim); color: var(--warn); }
  .badge-complexity { background: var(--success-dim); color: var(--success); }
  .badge-bug_risk { background: var(--danger-dim); color: var(--danger); }
  .badge-alternative { background: rgba(137,180,250,0.15); color: #89b4fa; }
  .badge-side_effect { background: rgba(203,166,247,0.15); color: #cba6f7; }
  .q-trigger { font-size: 9px; color: var(--muted); margin-left: auto; }
  .q-filename { font-size: 9px; color: var(--muted); font-family: var(--mono); }
  .q-code { margin: 0; padding: 10px 12px; background: rgba(0,0,0,0.25); font-family: var(--mono); font-size: 11px; color: #cdd6f4; white-space: pre-wrap; word-break: break-word; border-bottom: 1px solid var(--border); }
  .q-body { padding: 12px; }
  .q-question { font-size: 13px; font-weight: 600; line-height: 1.5; color: var(--text); margin-bottom: 12px; }
  textarea { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-family: inherit; font-size: 12px; line-height: 1.5; padding: 9px 11px; resize: vertical; min-height: 72px; outline: none; transition: border-color 0.15s; }
  textarea:focus { border-color: var(--accent); }
  textarea::placeholder { color: var(--muted); opacity: 0.6; }
  .q-actions { display: flex; gap: 7px; margin-top: 9px; align-items: center; }
  .btn { border: none; border-radius: 5px; cursor: pointer; font-family: inherit; font-size: 11px; font-weight: 600; padding: 7px 13px; transition: all 0.12s; }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { filter: brightness(1.15); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--muted); }
  .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }
  .btn-hint { background: transparent; border: 1px solid var(--border); color: var(--muted); font-size: 10px; margin-left: auto; }
  .btn-hint:hover { border-color: var(--warn); color: var(--warn); }
  .inline-loading { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: var(--muted); font-size: 11px; }
  .hint-box { background: var(--warn-dim); border: 1px solid rgba(249,226,175,0.25); border-radius: 6px; padding: 8px 11px; font-size: 11px; color: var(--warn); margin-top: 8px; display: none; }
  .hint-box.show { display: block; }
  .verdict { border-radius: var(--r); padding: 10px 12px; margin-top: 9px; animation: slideIn 0.2s ease; }
  .verdict.correct { background: var(--success-dim); border: 1px solid rgba(166,227,161,0.25); }
  .verdict.partial { background: var(--warn-dim); border: 1px solid rgba(249,226,175,0.25); }
  .verdict.incorrect { background: var(--danger-dim); border: 1px solid rgba(243,139,168,0.25); }
  .verdict-head { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
  .verdict.correct .verdict-head { color: var(--success); }
  .verdict.partial .verdict-head { color: var(--warn); }
  .verdict.incorrect .verdict-head { color: var(--danger); }
  .verdict-body { font-size: 11px; color: var(--text); line-height: 1.5; }
  .verdict-followup { font-size: 11px; font-style: italic; color: var(--accent); margin-top: 6px; }
  .section-head { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.07em; padding: 4px 0; }
  .hist-item { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
  .hist-q { font-size: 11px; color: var(--text); margin-bottom: 3px; }
  .hist-a { font-size: 10px; color: var(--muted); font-style: italic; }
  .hist-badge { font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 8px; margin-left: 4px; }
  .hist-badge.correct { background: var(--success-dim); color: var(--success); }
  .hist-badge.incorrect { background: var(--danger-dim); color: var(--danger); }
  .hist-badge.skipped { background: rgba(127,132,156,0.15); color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="header-left">
      <span class="logo">🧠</span>
      <div>
        <div class="title">Code Quiz</div>
        <div class="subtitle">Do you actually understand this?</div>
      </div>
    </div>
    <button class="toggle-btn active" id="toggleBtn" onclick="toggle()">Watching</button>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-n green" id="s-correct">0</div><div class="stat-l">Correct</div></div>
    <div class="stat"><div class="stat-n yellow" id="s-partial">0</div><div class="stat-l">Partial</div></div>
    <div class="stat"><div class="stat-n red" id="s-missed">0</div><div class="stat-l">Missed</div></div>
    <div class="stat"><div class="stat-n purple" id="s-streak">0</div><div class="stat-l">Streak</div></div>
  </div>

  <div id="main">
    <div class="idle-state">
      <div class="idle-icon">👀</div>
      <div class="idle-title">Watching your code</div>
      <div class="idle-sub">Paste or write code and a question will appear. Or right-click → "Quiz Me On This File Now".</div>
    </div>
  </div>

  <div id="historySection" style="display:none">
    <div class="section-head">This session</div>
    <div id="historyList"></div>
  </div>

  <div id="weakSpotsSection" style="margin-top:4px">
    <div class="section-head" style="margin-bottom:6px">Your learning profile</div>
    <div style="font-size:11px;color:var(--muted);padding:4px 0">Answer questions to build your profile.</div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let currentQuestionId = null;
let isActive = true;

function toggle() {
  isActive = !isActive;
  const btn = document.getElementById('toggleBtn');
  btn.textContent = isActive ? 'Watching' : 'Paused';
  btn.classList.toggle('active', isActive);
  vscode.postMessage({ type: 'toggleActive', payload: isActive });
}

function submitAnswer() {
  const ta = document.getElementById('answerInput');
  const answer = ta ? ta.value.trim() : '';
  if (!answer) return;
  const btn = document.getElementById('submitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }
  if (ta) ta.disabled = true;
  // Show inline loading
  const qBody = document.querySelector('.q-body');
  if (qBody && !document.getElementById('inlineLoading')) {
    const el = document.createElement('div');
    el.id = 'inlineLoading';
    el.className = 'inline-loading';
    el.innerHTML = '<div class="spinner"></div><span>Checking your answer...</span>';
    qBody.appendChild(el);
  }
  vscode.postMessage({ type: 'submitAnswer', payload: { id: currentQuestionId, answer } });
}

function skipQuestion() {
  vscode.postMessage({ type: 'skipQuestion', payload: { id: currentQuestionId } });
  showIdle();
}

function requestHint() {
  vscode.postMessage({ type: 'requestHint', payload: { id: currentQuestionId } });
}

function showIdle() {
  currentQuestionId = null;
  document.getElementById('main').innerHTML = \`
    <div class="idle-state">
      <div class="idle-icon">👀</div>
      <div class="idle-title">Watching your code</div>
      <div class="idle-sub">Paste or write code and a question will appear.</div>
    </div>\`;
}

function categoryLabel(cat) {
  const map = { intent:'Intent', edge_case:'Edge case', complexity:'Complexity', bug_risk:'Bug risk', alternative:'Alternative', side_effect:'Side effect' };
  return map[cat] || cat;
}

function triggerLabel(t) {
  const map = { paste:'📋 Paste', function_complete:'⚡ New fn', manual:'📖 Whole File', idle:'💤 Idle' };
  return map[t] || t;
}

function renderQuestion(q) {
  currentQuestionId = q.id;
  const shortFile = (q.fileName || '').split('/').pop() || 'file';
  const escapedCode = (q.codeSnippet || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const progressHtml = q.queueProgress ? \`<span style="font-size:10px;color:var(--accent);font-weight:600;margin-left:auto">\${q.queueProgress}</span>\` : '';
  document.getElementById('main').innerHTML = \`
    <div class="q-card">
      <div class="q-meta">
        <span class="q-badge badge-\${q.category}">\${categoryLabel(q.category)}</span>
        <span class="q-filename">\${shortFile}</span>
        <span class="q-trigger">\${triggerLabel(q.triggerReason)}</span>
        \${progressHtml}
      </div>
      <pre class="q-code">\${escapedCode}</pre>
      <div class="q-body">
        <div class="q-question">\${q.question}</div>
        <textarea id="answerInput" placeholder="Type your answer..." rows="4"></textarea>
        <div class="hint-box" id="hintBox"></div>
        <div class="q-actions">
          <button class="btn btn-primary" id="submitBtn" onclick="submitAnswer()">Submit</button>
          <button class="btn btn-ghost" onclick="skipQuestion()">Skip</button>
          <button class="btn btn-hint" onclick="requestHint()">Hint</button>
        </div>
      </div>
    </div>\`;
  setTimeout(() => document.getElementById('answerInput') && document.getElementById('answerInput').focus(), 50);
}

function renderVerdict(data) {
  // Remove inline loading
  const il = document.getElementById('inlineLoading');
  if (il) il.remove();
  // Re-enable submit
  const btn = document.getElementById('submitBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }

  const cls = data.correct ? 'correct' : (data.partial ? 'partial' : 'incorrect');
  const icon = data.correct ? '✓ Correct' : (data.partial ? '◑ Partially right' : '✗ Not quite');
  const followUpHtml = data.followUp ? \`<div class="verdict-followup">↳ \${data.followUp}</div>\` : '';

  const nextBtnHtml = data.hasNext
    ? \`<button class="btn btn-primary" style="margin-top:10px;width:100%" onclick="vscode.postMessage({type:'nextQuestion'})">Next Question →</button>\`
    : \`<button class="btn btn-ghost" style="margin-top:10px;width:100%" onclick="vscode.postMessage({type:'nextQuestion'})">Finish Quiz</button>\`;

  // Try to append to existing card
  const qBody = document.querySelector('.q-body');
  if (qBody) {
    const el = document.createElement('div');
    el.className = \`verdict \${cls}\`;
    el.innerHTML = \`<div class="verdict-head">\${icon}</div><div class="verdict-body">\${data.explanation}</div>\${followUpHtml}\${nextBtnHtml}\`;
    qBody.appendChild(el);
    // Disable submit and hide action buttons
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.style.display = 'none';
  } else {
    document.getElementById('main').innerHTML = \`
      <div class="verdict \${cls}" style="border-radius:8px;padding:14px">
        <div class="verdict-head">\${icon}</div>
        <div class="verdict-body">\${data.explanation}</div>
        \${followUpHtml}
        \${nextBtnHtml}
      </div>\`;
  }

  // Add to history
  if (data.historyItem) addToHistory(data.historyItem);
}

function addToHistory(q) {
  const section = document.getElementById('historySection');
  section.style.display = 'block';
  const list = document.getElementById('historyList');
  const shortFile = (q.fileName || '').split('/').pop() || '';
  const badge = q.result !== 'pending' ? \`<span class="hist-badge \${q.result}">\${q.result}</span>\` : '';
  const item = document.createElement('div');
  item.className = 'hist-item';
  item.innerHTML = \`
    <div class="hist-q">\${(q.question||'').slice(0,100)}\${(q.question||'').length>100?'…':''}\${badge}</div>
    <div class="hist-a">\${q.answer ? '"'+(q.answer||'').slice(0,80)+((q.answer||'').length>80?'…':'')+'"' : '(skipped)'}</div>\`;
  list.insertBefore(item, list.firstChild);
}

function updateStats(stats) {
  document.getElementById('s-correct').textContent = stats.correct;
  document.getElementById('s-partial').textContent = stats.partial;
  document.getElementById('s-missed').textContent = (stats.incorrect || 0) + (stats.skipped || 0);
  document.getElementById('s-streak').textContent = stats.streak;
}

window.addEventListener('message', e => {
  const { type, payload } = e.data;
  console.log('[CodeQuiz webview] received:', type, payload);
  switch(type) {
    case 'newQuestion':
      renderQuestion(payload);
      break;
    case 'loading':
      document.getElementById('main').innerHTML = \`<div class="loading"><div class="spinner"></div><span>\${(payload && payload.message) || 'Loading...'}</span></div>\`;
      break;
    case 'idle':
      showIdle();
      break;
    case 'verdictResult':
      renderVerdict(payload);
      break;
    case 'stats':
      updateStats(payload);
      break;
    case 'activeState':
      isActive = payload.active;
      const btn = document.getElementById('toggleBtn');
      if (btn) { btn.textContent = isActive ? 'Watching' : 'Paused'; btn.classList.toggle('active', isActive); }
      break;
    case 'hint':
      const hintBox = document.getElementById('hintBox');
      if (hintBox) { hintBox.textContent = payload.hint; hintBox.classList.add('show'); }
      break;
    case 'professorRefusal':
      alert(payload.message);
      break;
    case 'quizComplete':
      showSummary(payload);
      break;
    case 'weakSpots':
      renderWeakSpots(payload);
      break;
  }
});

function showSummary(stats) {
  const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚';

  let weakHtml = '';
  if (stats.weakSpots && stats.weakSpots.length > 0) {
    weakHtml = \`<div style="margin-top:16px;text-align:left">
      <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">Your weak spots</div>
      \${stats.weakSpots.map(w => \`
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:6px 10px;margin-bottom:6px">
          <span style="font-size:11px;color:var(--text)">\${w.category.replace('_',' ')}</span>
          <span style="font-size:11px;color:\${w.accuracy < 0.5 ? 'var(--danger)' : w.accuracy < 0.75 ? 'var(--warn)' : 'var(--success)'};font-weight:600">\${Math.round(w.accuracy*100)}%</span>
        </div>
      \`).join('')}
    </div>\`;
  }

  document.getElementById('main').innerHTML = \`
    <div style="padding:20px 12px">
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:28px;margin-bottom:8px">\${emoji}</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">Session complete</div>
        <div style="font-size:12px;color:var(--muted)">\${stats.correct} correct · \${stats.partial || 0} partial · \${(stats.incorrect||0) + (stats.skipped||0)} missed</div>
        <div style="font-size:28px;font-weight:700;color:var(--accent);margin:10px 0">\${pct}%</div>
      </div>
      \${weakHtml}
      <button class="btn btn-primary" style="width:100%;margin-top:14px" onclick="vscode.postMessage({type:'ready'})">Done</button>
    </div>\`;
}

function renderWeakSpots(data) {
  const section = document.getElementById('weakSpotsSection');
  if (!section) return;

  if (!data || data.totalAnswered === 0) {
    section.innerHTML = \`<div style="font-size:11px;color:var(--muted);padding:8px 0">Answer questions to build your profile.</div>\`;
    return;
  }

  const spots = data.weakSpots || [];
  const total = data.totalAnswered;
  const best = data.bestStreak;

  let html = \`<div style="display:flex;gap:8px;margin-bottom:10px">
    <div style="flex:1;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;text-align:center">
      <div style="font-size:16px;font-weight:700;color:var(--accent)">\${total}</div>
      <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">All time</div>
    </div>
    <div style="flex:1;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;text-align:center">
      <div style="font-size:16px;font-weight:700;color:var(--success)">\${best}</div>
      <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">Best streak</div>
    </div>
  </div>\`;

  if (spots.length > 0) {
    html += \`<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px">Weak spots</div>\`;
    html += spots.map(w => {
      const pct = Math.round(w.accuracy * 100);
      const color = pct < 50 ? 'var(--danger)' : pct < 75 ? 'var(--warn)' : 'var(--success)';
      const barW = Math.max(4, pct);
      return \`<div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px">
          <span style="font-size:11px;color:var(--text)">\${w.category.replace('_',' ')} <span style="color:var(--muted);font-size:10px">(\${w.language})</span></span>
          <span style="font-size:11px;font-weight:600;color:\${color}">\${pct}%</span>
        </div>
        <div style="background:var(--border);border-radius:3px;height:3px">
          <div style="background:\${color};width:\${barW}%;height:100%;border-radius:3px;transition:width 0.4s"></div>
        </div>
      </div>\`;
    }).join('');
  } else {
    html += \`<div style="font-size:11px;color:var(--muted)">No weak spots yet — keep answering!</div>\`;
  }

  section.innerHTML = html;
}

vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}

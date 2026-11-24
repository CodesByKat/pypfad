export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const KW = new Set(('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield ' +
  'SELECT FROM WHERE JOIN LEFT INNER ON GROUP BY ORDER HAVING LIMIT AS AND OR NOT INSERT INTO VALUES CREATE TABLE COUNT SUM AVG MIN MAX DESC ASC DISTINCT').split(' '));

/** Sehr einfaches Syntax-Highlighting fuer Python (und ein bisschen SQL). */
export function highlight(code) {
  const re = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|[rfb]?"(?:\\.|[^"\\\n])*"|[rfb]?'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?(?:e-?\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    if (m[1]) out += `<span class="tok-com">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="tok-str">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="tok-num">${esc(m[3])}</span>`;
    else if (m[4]) {
      if (KW.has(m[4])) out += `<span class="tok-kw">${esc(m[4])}</span>` + esc(m[5] || '');
      else if (m[5]) out += `<span class="tok-fn">${esc(m[4])}</span>${esc(m[5])}`;
      else out += esc(m[4]);
    }
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}

export function codeBlock(code) {
  return `<pre class="code"><code>${highlight(code.replace(/\n$/, ''))}</code></pre>`;
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
}

/** Mini-Markdown: Absaetze, Listen, `code`, **fett**, ```Codebloecke```. */
export function md(text) {
  if (!text) return '';
  const parts = String(text).split(/```(?:python|py|sql)?\n?([\s\S]*?)```/g);
  let html = '';
  parts.forEach((part, i) => {
    if (i % 2 === 1) { html += codeBlock(part); return; }
    for (const block of part.split(/\n\s*\n/)) {
      const b = block.trim();
      if (!b) continue;
      const lines = b.split('\n');
      if (lines.every((l) => /^\s*[-*] /.test(l))) {
        html += '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`).join('') + '</ul>';
      } else {
        html += `<p>${lines.map(inline).join('<br>')}</p>`;
      }
    }
  });
  return `<div class="prose">${html}</div>`;
}

export function normalizeOutput(s) {
  return String(s ?? '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

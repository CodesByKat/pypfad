// Einfacher Code-Editor (Textarea) mit Tab, Auto-Einrueckung und Sonderzeichen-Leiste fuers Handy.
import { esc, h } from './util.js';
import { errorHint } from './python.js';

const KEYS = ['⇥', '(', ')', '[', ']', '{', '}', ':', '=', '"', "'", '.', ',', '_', '#', '+', '-', '*', '/', '<', '>', '!', '%'];

export function createEditor(initial = '', { minHeight } = {}) {
  const wrap = h(`<div class="editor">
    <textarea class="code" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
    <div class="keys">${KEYS.map((k) => `<button type="button" tabindex="-1" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>
  </div>`);
  const ta = wrap.querySelector('textarea');
  ta.value = initial;
  if (minHeight) ta.style.minHeight = minHeight;

  function insert(text) {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    ta.value = value.slice(0, s) + text + value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + text.length;
    ta.dispatchEvent(new Event('input'));
  }

  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const { selectionStart: s, value } = ta;
      if (ev.shiftKey) {
        const lineStart = value.lastIndexOf('\n', s - 1) + 1;
        const m = value.slice(lineStart).match(/^ {1,4}/);
        if (m) {
          ta.value = value.slice(0, lineStart) + value.slice(lineStart + m[0].length);
          ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - m[0].length);
        }
      } else insert('    ');
    } else if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      const { selectionStart: s, value } = ta;
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const line = value.slice(lineStart, s);
      let indent = line.match(/^ */)[0];
      if (/:\s*$/.test(line)) indent += '    ';
      insert('\n' + indent);
    }
  });

  wrap.querySelector('.keys').addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    ev.preventDefault(); // Fokus im Textfeld behalten
    const k = b.dataset.k;
    insert(k === '⇥' ? '    ' : k);
    ta.focus();
  });

  return { el: wrap, textarea: ta, get value() { return ta.value; }, set value(v) { ta.value = v; } };
}

/** Zeigt Ergebnis eines Python-Laufs in einem .output-Element an. */
export function renderOutput(outEl, res, { showTest = true } = {}) {
  let html = '';
  if (res.fatal) {
    html = `<span class="err">${esc(res.fatal)}</span>`;
  } else {
    if (res.stdout) html += esc(res.stdout);
    if (res.error) {
      const e = res.error;
      const where = e.line ? ` (Zeile ${e.line})` : '';
      html += `${html ? '\n' : ''}<span class="err">${esc(e.type)}${where}: ${esc(e.msg)}</span>`;
      const hint = errorHint(e.type);
      if (hint) html += `\n<span class="muted">💡 ${esc(hint)}</span>`;
    }
    if (showTest && res.test) {
      html += `${html ? '\n' : ''}${res.test.ok ? '<span class="ok">✔ Alle Tests bestanden</span>' : `<span class="err">✘ ${esc(res.test.msg)}</span>`}`;
    }
    if (!html && !(res.figures && res.figures.length)) html = '<span class="muted">(keine Ausgabe)</span>';
  }
  outEl.innerHTML = html;
  (res.figures || []).forEach((b64) => {
    const img = document.createElement('img');
    img.className = 'figure';
    img.alt = 'Grafik';
    img.src = 'data:image/png;base64,' + b64;
    outEl.appendChild(img);
  });
}

// Darstellung und Auswertung der Aufgabentypen.
import { esc, h, md, codeBlock, highlight, shuffle, normalizeOutput } from './util.js';
import { createEditor, renderOutput } from './editor.js';
import * as py from './python.js';

export const TYPE_LABEL = {
  info: '📖 Erklärung',
  mc: '🔘 Multiple Choice',
  cloze: '🧩 Lückentext',
  parsons: '🧱 Code-Puzzle',
  predict: '🔮 Was kommt raus?',
  code: '⌨️ Code schreiben',
  vocab: '🃏 Vokabel',
  free: '✍️ Freitext',
};

function shell(ex, inner) {
  return h(`<div class="exercise">
    <div class="ex-type">${TYPE_LABEL[ex.type] || ''}</div>
    ${ex.question ? `<div class="question">${md(ex.question)}</div>` : ''}
    ${inner}
  </div>`);
}

function inlineMd(s) {
  return md(s).replace(/^<div class="prose"><p>|<\/p><\/div>$/g, '');
}

/* ---------- info ---------- */
function info(ex) {
  const el = shell(ex, `${md(ex.text)}${ex.code ? codeBlock(ex.code) : ''}
    ${ex.code && ex.run ? '<button class="btn sm try">▶ Ausprobieren</button><div class="output"></div>' : ''}`);
  const tryBtn = el.querySelector('.try');
  if (tryBtn) {
    tryBtn.onclick = async () => {
      const out = el.querySelector('.output');
      out.innerHTML = '<span class="muted">läuft …</span>';
      renderOutput(out, await py.run(ex.code, { setup: ex.setup || '' }));
    };
  }
  return { el, passive: true };
}

/* ---------- multiple choice ---------- */
function mc(ex, ctx) {
  const multi = Array.isArray(ex.answer);
  const order = shuffle(ex.options.map((_, i) => i));
  const el = shell(ex, `${ex.code ? codeBlock(ex.code) : ''}
    ${multi ? '<p class="muted small">Mehrere Antworten können richtig sein.</p>' : ''}
    <div class="options">${order.map((i) => `<button class="option" data-i="${i}">${inlineMd(ex.options[i])}</button>`).join('')}</div>`);
  const chosen = new Set();
  el.querySelectorAll('.option').forEach((b) => {
    b.onclick = () => {
      if (ctx.locked()) return;
      const i = +b.dataset.i;
      if (multi) { chosen.has(i) ? chosen.delete(i) : chosen.add(i); }
      else { chosen.clear(); chosen.add(i); }
      el.querySelectorAll('.option').forEach((o) => o.classList.toggle('selected', chosen.has(+o.dataset.i)));
      ctx.setReady(chosen.size > 0);
    };
  });
  return {
    el,
    snapshot: () => [...chosen].map((i) => ex.options[i]).join(' | '),
    check() {
      const right = new Set(multi ? ex.answer : [ex.answer]);
      el.querySelectorAll('.option').forEach((o) => {
        const i = +o.dataset.i;
        if (right.has(i)) o.classList.add('right');
        else if (chosen.has(i)) o.classList.add('wrong');
      });
      const ok = right.size === chosen.size && [...chosen].every((i) => right.has(i));
      return { correct: ok };
    },
  };
}

/* ---------- Lueckentext ---------- */
function cloze(ex, ctx) {
  const parts = ex.code.split('___');
  const n = parts.length - 1;
  const answers = ex.answers.map((a) => (Array.isArray(a) ? a : [a]));
  const tokens = shuffle([...answers.map((a) => a[0]), ...(ex.distractors || [])]);
  let html = '';
  parts.forEach((p, i) => {
    html += highlight(p);
    if (i < n) html += `<span class="blank" data-b="${i}">&nbsp;</span>`;
  });
  const el = shell(ex, `<pre class="code cloze-code"><code>${html}</code></pre>
    <div class="chips">${tokens.map((t, i) => `<button class="chip" data-t="${i}">${esc(t)}</button>`).join('')}</div>`);
  const fill = new Array(n).fill(null); // index in tokens
  let active = 0;
  const blanks = [...el.querySelectorAll('.blank')];
  const chips = [...el.querySelectorAll('.chip')];

  function paint() {
    blanks.forEach((b, i) => {
      b.textContent = fill[i] == null ? '   ' : tokens[fill[i]];
      b.classList.toggle('filled', fill[i] != null);
      b.classList.toggle('active', i === active && !ctx.locked());
    });
    chips.forEach((c, i) => c.classList.toggle('used', fill.includes(i)));
    ctx.setReady(fill.every((f) => f != null));
  }
  function nextEmpty(from) {
    for (let k = 0; k < n; k++) { const i = (from + k) % n; if (fill[i] == null) return i; }
    return from;
  }
  chips.forEach((c, i) => (c.onclick = () => {
    if (ctx.locked() || fill.includes(i)) return;
    fill[active] = i;
    active = nextEmpty(active + 1);
    paint();
  }));
  blanks.forEach((b, i) => (b.onclick = () => {
    if (ctx.locked()) return;
    fill[i] = null;
    active = i;
    paint();
  }));
  paint();
  return {
    el,
    snapshot: () => fill.map((f) => (f == null ? '___' : tokens[f])).join(' | '),
    check() {
      let ok = true;
      blanks.forEach((b, i) => {
        const r = answers[i].includes(tokens[fill[i]]);
        b.classList.add(r ? 'right' : 'wrong');
        b.classList.remove('active');
        ok = ok && r;
      });
      return {
        correct: ok,
        solution: ok ? null : codeBlock(parts.map((p, i) => p + (i < n ? answers[i][0] : '')).join('')),
      };
    },
  };
}

/* ---------- Code-Puzzle (Parsons) ---------- */
function parseLines(code) {
  return code.replace(/\n+$/, '').split('\n').filter((l) => l.trim()).map((l) => {
    const sp = l.match(/^ */)[0].length;
    return { text: l.trim(), indent: Math.round(sp / 4) };
  });
}
function parsons(ex, ctx) {
  const target = parseLines(ex.code);
  const pool = shuffle([...target.map((t) => t.text), ...(ex.distractors || [])]);
  const el = shell(ex, `
    <div class="zone-label">Dein Code (⇤ ⇥ zum Einrücken, ✕ zum Entfernen)</div>
    <div class="parsons-zone solution"></div>
    <div class="zone-label">Bausteine (antippen zum Einfügen)</div>
    <div class="parsons-zone pool"></div>`);
  const solEl = el.querySelector('.solution');
  const poolEl = el.querySelector('.pool');
  const sol = []; // {p: poolIndex, indent}

  function paint() {
    solEl.innerHTML = '';
    sol.forEach((s, k) => {
      const row = h(`<div class="pline"><span class="txt">${'    '.repeat(s.indent)}${highlight(pool[s.p])}</span>
        <button class="pbtn" data-a="out" aria-label="ausrücken">⇤</button><button class="pbtn" data-a="in" aria-label="einrücken">⇥</button><button class="pbtn" data-a="rm" aria-label="entfernen">✕</button></div>`);
      row.querySelectorAll('.pbtn').forEach((b) => (b.onclick = () => {
        if (ctx.locked()) return;
        if (b.dataset.a === 'in') s.indent = Math.min(s.indent + 1, 6);
        if (b.dataset.a === 'out') s.indent = Math.max(s.indent - 1, 0);
        if (b.dataset.a === 'rm') sol.splice(k, 1);
        paint();
      }));
      solEl.appendChild(row);
    });
    if (!sol.length) solEl.innerHTML = '<div class="muted small" style="color:#8a9a91;padding:8px">Tippe unten auf die Zeilen in der richtigen Reihenfolge.</div>';
    poolEl.innerHTML = '';
    pool.forEach((t, p) => {
      if (sol.some((s) => s.p === p)) return;
      const b = h(`<div class="pline" role="button" tabindex="0"><span class="txt">${highlight(t)}</span></div>`);
      b.onclick = () => {
        if (ctx.locked()) return;
        const prev = sol[sol.length - 1];
        let indent = 0;
        if (prev) indent = prev.indent + (/:\s*$/.test(pool[prev.p]) ? 1 : 0);
        sol.push({ p, indent });
        paint();
      };
      poolEl.appendChild(b);
    });
    if (!poolEl.children.length) poolEl.innerHTML = '<div class="muted small">Alle Bausteine verwendet.</div>';
    ctx.setReady(sol.length > 0);
  }
  paint();
  return {
    el,
    snapshot: () => sol.map((s) => '    '.repeat(s.indent) + pool[s.p]).join('\n'),
    check() {
      const rows = [...solEl.querySelectorAll('.pline')];
      let ok = sol.length === target.length;
      sol.forEach((s, k) => {
        const r = target[k] && target[k].text === pool[s.p] && target[k].indent === s.indent;
        rows[k].classList.add(r ? 'right' : 'wrong');
        ok = ok && r;
      });
      return { correct: ok, solution: ok ? null : codeBlock(ex.code) };
    },
  };
}

/* ---------- Ausgabe vorhersagen ---------- */
function predict(ex, ctx) {
  if (ex.options) {
    const r = mc({ ...ex, question: ex.question || 'Was gibt dieser Code aus?' }, ctx);
    r.el.querySelector('.ex-type').textContent = TYPE_LABEL.predict;
    return r;
  }
  const el = shell({ ...ex, question: ex.question || 'Was gibt dieser Code aus?' }, `${codeBlock(ex.code)}
    <textarea rows="3" class="code-answer" placeholder="Ausgabe hier eintippen …" spellcheck="false" autocapitalize="off" style="font-family:var(--mono)"></textarea>`);
  const ta = el.querySelector('textarea');
  ta.oninput = () => ctx.setReady(ta.value.trim().length > 0);
  return {
    el,
    snapshot: () => ta.value,
    check() {
      const given = normalizeOutput(ta.value);
      const want = normalizeOutput(ex.answer);
      const loose = (x) => x.replace(/[\s'"]/g, '');
      const ok = given === want || loose(given) === loose(want);
      ta.disabled = true;
      return { correct: ok, solution: ok ? null : `<p>Richtige Ausgabe:</p><pre class="output">${esc(want)}</pre>` };
    },
  };
}

/* ---------- Code schreiben ---------- */
function code(ex, ctx) {
  const el = shell(ex, `<div class="ed"></div>
    <div class="row" style="margin-top:4px">
      <button class="btn sm run">▶ Ausführen</button>
      ${ex.hint ? '<button class="btn sm ghost hintb">💡 Tipp</button>' : ''}
      <span class="spacer"></span>
      <button class="btn sm ghost giveup" hidden>Lösung zeigen</button>
    </div>
    <div class="tip" hidden></div>
    <div class="output"></div>`);
  const ed = createEditor(ex.starter || '');
  el.querySelector('.ed').appendChild(ed.el);
  const out = el.querySelector('.output');
  ctx.setReady(true);
  ed.textarea.addEventListener('input', () => ctx.setReady(true));
  el.querySelector('.run').onclick = async () => {
    out.innerHTML = '<span class="muted">läuft …</span>';
    renderOutput(out, await py.run(ed.value, { setup: ex.setup || '', onStatus: (t) => (out.innerHTML = `<span class="muted">${esc(t)}</span>`) }), { showTest: false });
  };
  const hb = el.querySelector('.hintb');
  if (hb) hb.onclick = () => { const t = el.querySelector('.tip'); t.hidden = false; t.innerHTML = md('💡 ' + ex.hint); };
  const gu = el.querySelector('.giveup');
  gu.onclick = () => ctx.giveUp({ solution: codeBlock(ex.solution) });
  let fails = 0;
  return {
    el,
    snapshot: () => ed.value + (out.textContent ? '\n\n# Ausgabe:\n' + out.textContent : ''),
    async check() {
      out.innerHTML = '<span class="muted">Python prüft deinen Code …</span>';
      const res = await py.run(ed.value, { tests: ex.tests || '', setup: ex.setup || '', onStatus: (t) => (out.innerHTML = `<span class="muted">${esc(t)}</span>`) });
      renderOutput(out, res);
      if (res.fatal && /nicht geladen|Internet/.test(res.fatal)) return { retry: true };
      const ok = !res.fatal && !res.error && (!ex.tests || (res.test && res.test.ok));
      if (ok) return { correct: true, firstTry: fails === 0 };
      fails++;
      gu.hidden = false;
      return { retry: true };
    },
  };
}

/* ---------- Vokabel ---------- */
function vocab(ex, ctx) {
  const all = ctx.vocab;
  const card = all.find((v) => v.id === ex.id);
  if (!card) return info({ type: 'info', text: `Vokabel „${ex.id}“ fehlt.` });
  const others = shuffle(all.filter((v) => v.id !== card.id)).slice(0, 3);
  const reverse = ex.reverse ?? Math.random() < 0.5;
  const options = [card, ...others];
  const q = reverse ? `Welcher Befehl passt? **${card.meaning}**` : `Was bedeutet \`${card.term}\`?`;
  const r = mc({
    type: 'mc', question: q,
    options: options.map((o) => (reverse ? '`' + o.term + '`' : o.meaning)),
    answer: 0,
  }, ctx);
  r.el.querySelector('.ex-type').textContent = TYPE_LABEL.vocab;
  const check = r.check;
  r.check = () => ({ ...check(), extra: card.example ? codeBlock(card.example) : '' });
  return r;
}

/* ---------- Freitext ---------- */
function free(ex, ctx) {
  const el = shell(ex, `<textarea rows="5" placeholder="Deine Antwort in eigenen Worten …"></textarea>`);
  const ta = el.querySelector('textarea');
  ta.oninput = () => ctx.setReady(ta.value.trim().length > 3);
  return {
    el,
    snapshot: () => ta.value,
    check() {
      ta.disabled = true;
      return { selfAssess: true, solution: `<p><b>Musterantwort:</b></p>${md(ex.solution)}` };
    },
  };
}

const RENDER = { info, mc, cloze, parsons, predict, code, vocab, free };
export function renderExercise(ex, ctx) {
  const fn = RENDER[ex.type];
  if (!fn) return info({ type: 'info', text: `Unbekannter Aufgabentyp: ${ex.type}` }, ctx);
  return fn(ex, ctx);
}

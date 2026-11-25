// Fehler melden: Meldungen werden lokal gespeichert (funktioniert offline)
// und koennen spaeter geteilt, kopiert, als Datei gespeichert oder als GitHub-Issue geoeffnet werden.
import { esc, h, toast } from './util.js';

const KEY = 'pypfad-reports-v1';
export const REPO = 'CodesByKat/pypfad';
const REASONS = ['Antwort ist falsch', 'Mein Code wurde fälschlich abgelehnt', 'Frage ist unklar', 'Erklärung fehlt/ist falsch', 'Tippfehler', 'Technischer Fehler', 'Sonstiges'];

export function list() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
}
function store(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) {}
}
export function clear() { store([]); }
export function remove(id) { store(list().filter((r) => r.id !== id)); }

export function toText(r) {
  const lines = [
    `PyPfad-Meldung (${r.date})`,
    `Ort: ${r.where}`,
    `Grund: ${r.reason}`,
  ];
  if (r.comment) lines.push(`Kommentar: ${r.comment}`);
  if (r.question) lines.push('', 'Frage:', r.question);
  if (r.answer) lines.push('', 'Meine Antwort:', r.answer);
  if (r.result) lines.push('', `Ergebnis: ${r.result}`);
  lines.push('', `Inhalte v${r.version} · ${r.ua}`);
  return lines.join('\n');
}

export function allText(items = list()) {
  return items.map(toText).join('\n\n----------\n\n');
}

export function issueUrl(r) {
  const title = `Meldung: ${r.where.split(' · ')[0]} – ${r.reason}`;
  const fence = (s) => '```\n' + String(s).slice(0, 2500) + '\n```';
  const body = [
    `**Ort:** ${r.where}`,
    `**Grund:** ${r.reason}`,
    r.comment ? `**Kommentar:** ${r.comment}` : '',
    r.question ? `\n**Frage:**\n${fence(r.question)}` : '',
    r.answer ? `\n**Meine Antwort:**\n${fence(r.answer)}` : '',
    r.result ? `\n**Ergebnis:** ${r.result}` : '',
    `\n_Inhalte v${r.version} · ${r.date}_`,
  ].filter(Boolean).join('\n');
  return `https://github.com/${REPO}/issues/new?labels=meldung&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export async function share(text) {
  if (navigator.share) {
    try { await navigator.share({ title: 'PyPfad-Meldung', text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  await copy(text);
}
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('In die Zwischenablage kopiert'); }
  catch (_) { toast('Kopieren nicht möglich'); }
}
export function download(items = list()) {
  const blob = new Blob([allText(items)], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pypfad-meldungen-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/**
 * Oeffnet das Melde-Fenster.
 * ctx: { where, question, answer, result, version }
 */
export function openSheet(ctx) {
  const overlay = h(`<div class="overlay" role="dialog" aria-modal="true" aria-label="Fehler melden">
    <div class="sheet">
      <div class="row"><h2 style="margin:0">🚩 Fehler melden</h2><span class="spacer"></span><button class="icon-btn close" aria-label="Schließen">✕</button></div>
      <p class="muted small">${esc(ctx.where)}</p>
      <div class="chips reasons">${REASONS.map((r) => `<button class="chip reason" type="button">${esc(r)}</button>`).join('')}</div>
      <textarea rows="3" placeholder="Was stimmt nicht? (optional)" style="margin-top:12px"></textarea>
      <details style="margin-top:10px"><summary class="small muted">Wird mitgeschickt: Frage, deine Antwort, Ergebnis</summary>
        <pre class="output" style="display:block">${esc(toText({ ...ctx, reason: '…', date: '', ua: '' }))}</pre></details>
      <button class="btn primary block save" disabled style="margin-top:12px">Meldung speichern</button>
      <p class="small muted" style="margin:8px 0 0">Wird auf dem Gerät gespeichert, auch offline. Senden kannst du später unter Profil → Meldungen.</p>
    </div></div>`);
  let reason = null;
  const save = overlay.querySelector('.save');
  overlay.querySelectorAll('.reason').forEach((b) => (b.onclick = () => {
    reason = b.textContent;
    overlay.querySelectorAll('.reason').forEach((x) => x.classList.toggle('selected', x === b));
    save.disabled = false;
  }));
  const close = () => overlay.remove();
  overlay.querySelector('.close').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  save.onclick = () => {
    const r = {
      id: Date.now().toString(36),
      date: new Date().toLocaleString('de-DE'),
      reason,
      comment: overlay.querySelector('textarea').value.trim(),
      ua: navigator.onLine ? 'online' : 'offline',
      ...ctx,
    };
    store([...list(), r]);
    const sheet = overlay.querySelector('.sheet');
    sheet.innerHTML = `<h2>Danke! Gespeichert ✅</h2>
      <p class="muted">Du kannst sie jetzt senden oder später gesammelt unter <b>Profil → Meldungen</b>.</p>
      <div class="options">
        ${navigator.onLine ? `<a class="btn primary block" target="_blank" rel="noopener" href="${esc(issueUrl(r))}">Auf GitHub melden</a>` : ''}
        <button class="btn block share">Teilen / kopieren</button>
        <button class="btn ghost block close2">Weiterlernen</button>
      </div>`;
    sheet.querySelector('.share').onclick = () => share(toText(r));
    sheet.querySelector('.close2').onclick = close;
  };
  document.body.appendChild(overlay);
}

// Verbindung zur Python-Laufzeit im Worker.
export const PYODIDE_VERSION = '0.29.5';
const params = new URLSearchParams(location.search);
export const INDEX_URL = params.get('pyodide') === 'local'
  ? new URL('pyodide-local/', location.href).href
  : `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const RUN_TIMEOUT_MS = 20000;
let worker = null;
let readyPromise = null;
let state = { status: 'idle', text: 'Python noch nicht gestartet', version: null };
const listeners = new Set();
const pending = new Map();
let nextId = 1;

function setState(s) {
  state = { ...state, ...s };
  listeners.forEach((fn) => fn(state));
}
export function onStatus(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export function status() { return state; }

function startWorker() {
  worker = new Worker('js/py-worker.js');
  readyPromise = new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') { setState({ status: 'ready', text: 'Python bereit', version: m.version }); resolve(); return; }
      if (m.type === 'init-error') {
        setState({ status: 'error', text: 'Python konnte nicht geladen werden. Beim ersten Start brauchst du Internet.' });
        reject(new Error(m.error));
        return;
      }
      const p = m.id != null ? pending.get(m.id) : null;
      if (m.type === 'status') {
        if (p && p.onStatus) p.onStatus(m.text);
        else if (state.status !== 'ready') setState({ text: m.text });
        return;
      }
      if (!p) return;
      if (m.type === 'executing') { p.armTimer(); return; }
      if (m.type === 'result') { pending.delete(m.id); p.done(m); }
    };
  });
  setState({ status: 'loading', text: 'Python wird geladen …' });
  worker.postMessage({ type: 'init', indexURL: INDEX_URL });
  readyPromise.catch(() => {});
}

export function ensure() {
  if (!worker) startWorker();
  return readyPromise;
}

function restart() {
  try { worker.terminate(); } catch (_) {}
  worker = null;
  for (const p of pending.values()) p.done({ error: 'abgebrochen' });
  pending.clear();
  setState({ status: 'idle', version: null });
  startWorker();
}

function call(msg, { onStatus, timeout } = {}) {
  const id = nextId++;
  return new Promise((resolve) => {
    let timer = null;
    pending.set(id, {
      onStatus,
      armTimer() {
        if (!timeout) return;
        timer = setTimeout(() => {
          pending.delete(id);
          resolve({ timeout: true });
          restart();
        }, timeout);
      },
      done(m) { clearTimeout(timer); resolve(m); },
    });
    worker.postMessage({ ...msg, id });
  });
}

/** Fuehrt Code aus. Liefert {stdout, error, test, figures} oder {fatal}. */
export async function run(code, { tests = '', setup = '', onStatus } = {}) {
  try { await ensure(); } catch (e) { return { fatal: state.text }; }
  const m = await call({ type: 'run', code, tests, setup }, { onStatus, timeout: RUN_TIMEOUT_MS });
  if (m.timeout) return { fatal: `Abgebrochen nach ${RUN_TIMEOUT_MS / 1000} Sekunden. Läuft vielleicht eine Endlosschleife?` };
  if (m.error) return { fatal: m.error };
  return m.data;
}

/** Laedt Pakete vorab (damit sie offline im Cache liegen). */
export async function preload(packages, onStatus) {
  await ensure();
  const m = await call({ type: 'load', packages }, { onStatus });
  if (m.error) throw new Error(m.error);
  return m;
}

const HINTS = {
  NameError: 'Ein Name ist nicht definiert. Tippfehler? Oder wurde die Variable/Funktion noch nicht angelegt bzw. importiert?',
  SyntaxError: 'Python versteht die Zeile nicht. Prüfe Klammern, Doppelpunkte am Zeilenende und Anführungszeichen.',
  IndentationError: 'Die Einrückung passt nicht. Nach einem Doppelpunkt (for, if, def …) muss eingerückt werden, sonst nicht.',
  TypeError: 'Ein Wert hat den falschen Typ, oder eine Funktion bekommt zu viele/zu wenige Argumente.',
  KeyError: 'Diesen Schlüssel gibt es im Dictionary (oder diese Spalte im DataFrame) nicht.',
  IndexError: 'Der Index ist zu groß. Denk daran: Python zählt ab 0.',
  AttributeError: 'Dieses Objekt hat die Methode/Eigenschaft nicht. Tippfehler oder falscher Objekttyp?',
  ValueError: 'Der Typ stimmt, aber der Wert passt nicht (z. B. falsche Form/Shape eines Arrays).',
  ModuleNotFoundError: 'Dieses Modul gibt es hier nicht. Tippfehler im import?',
  ZeroDivisionError: 'Division durch 0.',
  NotFittedError: 'Das Modell bzw. der Transformer wurde noch nicht mit .fit() trainiert.',
};
export function errorHint(type) { return HINTS[type] || ''; }

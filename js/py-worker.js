// Web Worker: laedt Pyodide (Python im Browser) und fuehrt Code aus,
// ohne dass die Oberflaeche einfriert.
let pyodide = null;
let runFn = null;

function post(msg) { self.postMessage(msg); }

async function init(indexURL) {
  try {
    post({ type: 'status', text: 'Python wird geladen …' });
    importScripts(indexURL + 'pyodide.js');
    pyodide = await loadPyodide({ indexURL });
    const runnerSrc = await (await fetch('runner.py')).text();
    pyodide.runPython(runnerSrc);
    runFn = pyodide.globals.get('_pp_run');
    post({ type: 'ready', version: pyodide.version });
  } catch (err) {
    post({ type: 'init-error', error: String(err && err.message || err) });
  }
}

const quiet = { messageCallback: () => {}, errorCallback: () => {} };

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') return init(m.indexURL);
  if (!pyodide) return post({ type: 'result', id: m.id, error: 'Python ist noch nicht bereit.' });

  if (m.type === 'load') {
    try {
      const msgs = [];
      await pyodide.loadPackage(m.packages, { messageCallback: (t) => post({ type: 'status', text: t }), errorCallback: (t) => msgs.push(t) });
      post({ type: 'result', id: m.id, ok: true, warnings: msgs });
    } catch (err) {
      post({ type: 'result', id: m.id, error: String(err && err.message || err) });
    }
    return;
  }

  if (m.type === 'run') {
    try {
      const all = [m.setup || '', m.code || '', m.tests || ''].join('\n');
      post({ type: 'status', id: m.id, text: 'Pakete werden geladen …' });
      await pyodide.loadPackagesFromImports(all, quiet);
      post({ type: 'executing', id: m.id });
      const json = runFn(m.code || '', m.tests || '', m.setup || '');
      post({ type: 'result', id: m.id, data: JSON.parse(json) });
    } catch (err) {
      post({ type: 'result', id: m.id, error: String(err && err.message || err) });
    }
  }
};

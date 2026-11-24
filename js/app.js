import { esc, h, md, codeBlock, shuffle, toast } from './util.js';
import * as P from './progress.js';
import * as py from './python.js';
import { renderExercise } from './exercises.js';
import { createEditor, renderOutput } from './editor.js';

const view = document.getElementById('view');
let course = null;
let lessonIndex = new Map(); // id -> {world, lesson, wi, li}

/* ---------------- Start ---------------- */
async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  try {
    course = await (await fetch('data/course.json')).json();
  } catch (e) {
    view.innerHTML = '<div class="card">Die Lerninhalte konnten nicht geladen werden.</div>';
    return;
  }
  course.worlds.forEach((w, wi) => w.lessons.forEach((l, li) => lessonIndex.set(l.id, { world: w, lesson: l, wi, li })));
  window.addEventListener('hashchange', route);
  route();
  // Python im Hintergrund vorwaermen, damit Code-Aufgaben schnell starten
  setTimeout(() => py.ensure().catch(() => {}), 1500);
}

function renderStats() {
  const s = document.getElementById('stats');
  const lv = P.levelInfo();
  s.innerHTML = `<span title="Tage in Folge">🔥 ${P.streakNow()}</span><span title="Erfahrungspunkte">⭐ ${P.get().xp}</span><span title="Level">🏅 ${lv.level}</span>`;
}

function setTab(tab) {
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}

let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  document.body.classList.remove('in-lesson');
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, arg] = hash.split('/');
  view.innerHTML = '';
  window.scrollTo(0, 0);
  renderStats();
  if (page === 'lektion' && lessonIndex.has(arg)) return runLesson(lessonIndex.get(arg));
  if (page === 'vokabeln') { setTab('vocab'); return arg === 'training' ? vocabSession() : vocabPage(); }
  if (page === 'spielwiese') { setTab('play'); return playground(); }
  if (page === 'profil') { setTab('profile'); return profile(); }
  setTab('path');
  home();
}

function nextLesson() {
  for (const w of course.worlds) for (const l of w.lessons) if (!P.lessonState(l.id)) return l;
  return null;
}

/* ---------------- Lernpfad ---------------- */
function home() {
  const lv = P.levelInfo();
  const daily = P.dailyXp();
  const due = P.dueCards().length;
  const nxt = nextLesson();
  const hero = h(`<section class="card hero">
    <div>
      <div class="row"><b>Level ${lv.level}</b><span class="spacer"></span><span class="muted small">${P.get().xp} / ${lv.to} XP</span></div>
      <div class="bar"><i style="width:${Math.round(lv.pct * 100)}%"></i></div>
    </div>
    <div class="goal"><span>🎯 Tagesziel</span><div class="bar gold"><i style="width:${Math.min(100, Math.round((daily / P.DAILY_GOAL) * 100))}%"></i></div><span class="small muted">${daily}/${P.DAILY_GOAL}</span></div>
    <div class="row">
      ${nxt ? `<a class="btn primary" href="#/lektion/${nxt.id}">▶ Weiter: ${esc(nxt.title)}</a>` : '<span>🎉 Alle Lektionen geschafft!</span>'}
      ${due ? `<a class="btn" href="#/vokabeln/training">🃏 ${due} Vokabeln fällig</a>` : ''}
    </div>
  </section>`);
  view.appendChild(hero);

  course.worlds.forEach((w) => {
    const done = w.lessons.filter((l) => P.lessonState(l.id)).length;
    const sec = h(`<section class="world">
      <div class="world-head"><div class="emoji">${w.emoji || '📘'}</div>
        <div><h2>${esc(w.title)}</h2><p class="muted small">${esc(w.description || '')} · ${done}/${w.lessons.length} geschafft</p></div></div>
      <div class="lessons"></div></section>`);
    const list = sec.querySelector('.lessons');
    w.lessons.forEach((l, i) => {
      const st = P.lessonState(l.id);
      const cls = st ? 'done' : nxt && nxt.id === l.id ? 'next' : '';
      const graded = l.exercises.filter((e) => e.type !== 'info').length;
      const item = h(`<a class="lesson-item ${cls}" href="#/lektion/${l.id}" style="text-decoration:none;color:inherit">
        <span class="num">${st ? '✓' : i + 1}</span>
        <span class="meta"><b>${esc(l.title)}</b><span class="muted small">${graded} Aufgaben${l.project ? ' · Projekt' : ''}</span></span>
        ${st ? `<span class="stars">${'★'.repeat(st.stars)}${'☆'.repeat(3 - st.stars)}</span>` : ''}
      </a>`);
      list.appendChild(item);
    });
    view.appendChild(sec);
  });
  if (course.comingSoon && course.comingSoon.length) {
    view.appendChild(h(`<section class="world"><h2>Demnächst</h2><p class="muted">${course.comingSoon.map(esc).join(' · ')}</p></section>`));
  }
}

/* ---------------- Lektion ---------------- */
function runLesson({ world, lesson }) {
  document.body.classList.add('in-lesson');
  const queue = lesson.exercises.map((ex) => ({ ex, retry: false }));
  const graded = lesson.exercises.filter((e) => e.type !== 'info').length;
  let pos = 0;
  let firstTryRight = 0;
  let earned = 0;
  const started = Date.now();

  view.innerHTML = '';
  const top = h(`<div class="lesson-top"><button class="icon-btn" aria-label="Lektion verlassen">✕</button><div class="bar"><i style="width:0%"></i></div></div>`);
  const body = h('<div class="lesson-body"></div>');
  const footer = h('<div class="footer"><div class="footer-inner"></div></div>');
  view.append(top, body);
  document.body.appendChild(footer);
  cleanup = () => footer.remove();
  top.querySelector('button').onclick = () => { location.hash = '#/'; };
  const fi = footer.querySelector('.footer-inner');

  function progress() {
    top.querySelector('.bar i').style.width = `${Math.round((pos / queue.length) * 100)}%`;
  }

  function intro() {
    progress();
    body.innerHTML = '';
    body.appendChild(h(`<div><div class="ex-type">${esc(world.title)}</div><h1>${esc(lesson.title)}</h1>${md(lesson.intro || '')}</div>`));
    footer.className = 'footer';
    fi.innerHTML = '';
    const b = h('<button class="btn primary block">Los geht\'s</button>');
    b.onclick = show;
    fi.appendChild(b);
  }

  function show() {
    progress();
    if (pos >= queue.length) return finish();
    const item = queue[pos];
    let locked = false;
    let checkBtn;
    const ctx = {
      vocab: course.vocab,
      locked: () => locked,
      setReady: (ok) => { if (checkBtn) checkBtn.disabled = !ok; },
      giveUp: ({ solution }) => { locked = true; feedback(false, { solution }, item, 0); },
    };
    footer.className = 'footer';
    fi.innerHTML = '';
    checkBtn = h(`<button class="btn primary block" ${item.ex.type === 'info' ? '' : 'disabled'}>${item.ex.type === 'info' ? 'Weiter' : 'Prüfen'}</button>`);
    fi.appendChild(checkBtn);
    const r = renderExercise(item.ex, ctx);
    body.innerHTML = '';
    if (item.retry) body.appendChild(h('<p class="muted small">🔁 Nochmal zur Wiederholung</p>'));
    body.appendChild(r.el);
    window.scrollTo(0, 0);

    if (r.passive) {
      checkBtn.disabled = false;
      checkBtn.onclick = () => { pos++; show(); };
      return;
    }
    checkBtn.onclick = async () => {
      if (locked) return;
      checkBtn.disabled = true;
      const res = await r.check();
      if (res.retry) { checkBtn.disabled = false; checkBtn.textContent = 'Nochmal prüfen'; return; }
      locked = true;
      if (res.selfAssess) return selfAssess(res, item);
      const first = res.firstTry ?? true;
      const xp = res.correct ? (item.retry || !first ? 5 : 10) : 0;
      feedback(res.correct, res, item, xp, first);
    };
  }

  function award(correct, item, xp, first = true) {
    if (correct && !item.retry && first) firstTryRight++;
    if (xp) { earned += xp; P.addXp(xp); }
    if (!correct && !item.retry && item.ex.type !== 'code') queue.push({ ex: item.ex, retry: true });
  }

  function feedback(correct, res, item, xp, first) {
    award(correct, item, xp, first);
    const ex = item.ex;
    footer.className = 'footer ' + (correct ? 'good' : 'bad');
    fi.innerHTML = '';
    const praise = ['Richtig!', 'Super!', 'Genau!', 'Stark!', 'Perfekt!'];
    fi.appendChild(h(`<div class="explain">
      <div class="verdict">${correct ? '✔ ' + praise[Math.floor(Math.random() * praise.length)] : '✘ Noch nicht ganz'}${xp ? ` <span class="small">+${xp} XP</span>` : ''}</div>
      ${res.solution || ''}${ex.explain ? md(ex.explain) : ''}${res.extra || ''}
    </div>`));
    const b = h('<button class="btn primary block">Weiter</button>');
    b.onclick = () => { pos++; show(); };
    fi.appendChild(b);
    b.focus({ preventScroll: true });
  }

  function selfAssess(res, item) {
    footer.className = 'footer';
    fi.innerHTML = '';
    fi.appendChild(h(`<div class="explain">${res.solution}${item.ex.explain ? md(item.ex.explain) : ''}<p class="muted small">Vergleiche ehrlich mit deiner Antwort:</p></div>`));
    const row = h('<div class="row"><button class="btn" style="flex:1">Noch nicht ganz</button><button class="btn primary" style="flex:1">Hatte ich drauf</button></div>');
    const [no, yes] = row.querySelectorAll('button');
    no.onclick = () => { award(false, { ...item, retry: true }, 0); pos++; show(); };
    yes.onclick = () => { award(true, item, 10); pos++; show(); };
    fi.appendChild(row);
  }

  function finish() {
    const accuracy = graded ? firstTryRight / graded : 1;
    const bonus = 20 + (accuracy >= 0.95 ? 10 : 0);
    P.addXp(bonus);
    earned += bonus;
    const stars = P.finishLesson(lesson.id, accuracy);
    const newCards = P.addCards(lesson.vocab || []);
    const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
    footer.className = 'footer';
    body.innerHTML = '';
    body.appendChild(h(`<div class="result">
      <div class="big">${stars === 3 ? '🏆' : stars === 2 ? '🎉' : '👍'}</div>
      <h1>Lektion geschafft!</h1>
      <div class="stars" style="font-size:2rem;color:var(--accent)">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <div class="result-stats">
        <div><b>+${earned}</b><span class="small muted">XP</span></div>
        <div><b>${Math.round(accuracy * 100)}%</b><span class="small muted">beim 1. Versuch</span></div>
        <div><b>${mins}</b><span class="small muted">Min.</span></div>
      </div>
      <p>🔥 Streak: <b>${P.streakNow()} ${P.streakNow() === 1 ? 'Tag' : 'Tage'}</b></p>
      ${newCards ? `<p>🃏 ${newCards} neue Vokabeln im Trainer</p>` : ''}
    </div>`));
    fi.innerHTML = '';
    const nxt = nextLesson();
    const row = h(`<div class="row"><a class="btn" style="flex:1" href="#/">Zum Lernpfad</a>${nxt ? `<a class="btn primary" style="flex:1" href="#/lektion/${nxt.id}">Nächste Lektion</a>` : ''}</div>`);
    fi.appendChild(row);
    progress();
    top.querySelector('.bar i').style.width = '100%';
  }

  intro();
}

/* ---------------- Vokabeln ---------------- */
function vocabById(id) { return course.vocab.find((v) => v.id === id); }

function vocabPage() {
  const due = P.dueCards().length;
  const counts = P.boxCounts();
  const owned = Object.keys(P.get().cards).length;
  view.appendChild(h(`<section class="card">
    <h1>Vokabeltrainer</h1>
    <p class="muted">Funktionen, Befehle und Parameter, damit du nicht jede Zeile nachschlagen musst. Karten kommen nach jeder Lektion dazu und werden nach einer Lernkurve wiederholt.</p>
    <div class="boxes">${counts.map((c, i) => `<div><b>${c}</b>${['neu', '1 Tag', '3 Tage', '1 Woche', 'sitzt'][i]}</div>`).join('')}</div>
    <div class="row" style="margin-top:14px">
      <a class="btn primary" href="#/vokabeln/training" ${due ? '' : 'aria-disabled="true"'}>${due ? `▶ ${due} fällige Karten üben` : 'Heute nichts fällig 🎉'}</a>
      <button class="btn addall">Alle ${course.vocab.length} Karten freischalten</button>
    </div>
    <p class="small muted">${owned} von ${course.vocab.length} Karten im Trainer.</p>
  </section>`));
  view.querySelector('.addall').onclick = () => {
    const n = P.addCards(course.vocab.map((v) => v.id));
    toast(n ? `${n} Karten hinzugefügt` : 'Alle Karten sind schon im Trainer');
    route();
  };
  const gl = h(`<section class="card"><h2>Nachschlagen</h2>
    <input type="text" placeholder="Suchen, z. B. split, groupby, enumerate …" aria-label="Vokabeln durchsuchen">
    <div class="glossary" style="margin-top:12px"></div></section>`);
  const list = gl.querySelector('.glossary');
  const input = gl.querySelector('input');
  function paint() {
    const q = input.value.trim().toLowerCase();
    const items = course.vocab.filter((v) => !q || (v.term + ' ' + v.meaning).toLowerCase().includes(q));
    list.innerHTML = items.map((v) => `<details style="border-bottom:1px solid var(--border);padding:10px 0">
      <summary><code>${esc(v.term)}</code> <span class="muted">· ${esc(v.meaning)}</span></summary>
      ${v.example ? `<div style="margin-top:8px">${codeBlock(v.example)}</div>` : ''}</details>`).join('') || '<p class="muted">Nichts gefunden.</p>';
  }
  input.oninput = paint;
  paint();
  view.appendChild(gl);
}

function vocabSession() {
  const queue = shuffle(P.dueCards());
  let known = 0;
  if (!queue.length) { location.hash = '#/vokabeln'; return; }
  const total = queue.length;
  function next() {
    view.innerHTML = '';
    if (!queue.length) {
      view.appendChild(h(`<div class="result"><div class="big">🧠</div><h1>Fertig für heute!</h1><p>${known} von ${total} gewusst · +${known * 2} XP</p><a class="btn primary" href="#/">Zum Lernpfad</a></div>`));
      renderStats();
      return;
    }
    const id = queue.shift();
    const v = vocabById(id);
    if (!v) return next();
    const el = h(`<div>
      <p class="muted small">Noch ${queue.length + 1} Karten · Tippe auf die Karte zum Umdrehen</p>
      <div class="flash"><div><div class="term">${esc(v.term)}</div><div class="back" hidden><div class="meaning">${esc(v.meaning)}</div>${v.example ? codeBlock(v.example) : ''}</div></div></div>
      <div class="row" style="margin-top:16px"><button class="btn block reveal">Umdrehen</button></div>
      <div class="row rate" style="margin-top:16px" hidden><button class="btn" style="flex:1">🔁 Nochmal</button><button class="btn primary" style="flex:1">✔ Gewusst</button></div>
    </div>`);
    const reveal = () => { el.querySelector('.back').hidden = false; el.querySelector('.reveal').parentElement.hidden = true; el.querySelector('.rate').hidden = false; };
    el.querySelector('.flash').onclick = reveal;
    el.querySelector('.reveal').onclick = reveal;
    const [again, ok] = el.querySelectorAll('.rate button');
    again.onclick = () => { P.rateCard(id, false); queue.push(id); next(); };
    ok.onclick = () => { P.rateCard(id, true); known++; P.addXp(2); renderStats(); next(); };
    view.appendChild(el);
  }
  next();
}

/* ---------------- Spielwiese ---------------- */
const PLAY_KEY = 'pypfad-playground';
function playground() {
  const examples = course.playground || [];
  let saved = '';
  try { saved = localStorage.getItem(PLAY_KEY) || ''; } catch (_) {}
  const el = h(`<section>
    <h1>Spielwiese</h1>
    <p class="muted">Freies Python mit numpy, pandas, scikit-learn, matplotlib und sqlite3. Am Laptop tippt es sich am besten.</p>
    <div class="row" style="margin-bottom:10px">
      <select class="btn sm ex-select" aria-label="Beispiel laden"><option value="">Beispiel laden …</option>${examples.map((e, i) => `<option value="${i}">${esc(e.title)}</option>`).join('')}</select>
      <span class="spacer"></span>
      <button class="btn sm primary run">▶ Ausführen</button>
    </div>
    <div class="ed"></div>
    <div class="output"></div>
    <p class="small muted">Tipp: Strg/Cmd + Enter führt den Code aus.</p>
  </section>`);
  const ed = createEditor(saved || (examples[0] && examples[0].code) || 'print("Hallo PyPfad!")', { minHeight: '300px' });
  el.querySelector('.ed').appendChild(ed.el);
  const out = el.querySelector('.output');
  const run = async () => {
    out.innerHTML = '<span class="muted">läuft …</span>';
    renderOutput(out, await py.run(ed.value, { onStatus: (t) => (out.innerHTML = `<span class="muted">${esc(t)}</span>`) }), { showTest: false });
  };
  el.querySelector('.run').onclick = run;
  ed.textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });
  ed.textarea.addEventListener('input', () => { try { localStorage.setItem(PLAY_KEY, ed.value); } catch (_) {} });
  el.querySelector('.ex-select').onchange = (e) => {
    const ex = examples[e.target.value];
    if (ex) { ed.value = ex.code; ed.textarea.dispatchEvent(new Event('input')); out.innerHTML = ''; }
    e.target.value = '';
  };
  view.appendChild(el);
}

/* ---------------- Profil ---------------- */
const OFFLINE_KEY = 'pypfad-offline-packages';
const PACKAGES = ['numpy', 'pandas', 'scikit-learn', 'matplotlib', 'sqlite3'];
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

function profile() {
  const d = P.get();
  const lv = P.levelInfo();
  const lessonsDone = Object.keys(d.lessons).length;
  const lessonsTotal = lessonIndex.size;
  let offline = [];
  try { offline = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); } catch (_) {}

  const stats = h(`<section class="card"><h1>Profil</h1>
    <div class="result-stats">
      <div><b>${lv.level}</b><span class="small muted">Level</span></div>
      <div><b>${d.xp}</b><span class="small muted">XP</span></div>
      <div><b>${d.streak.best || 0}</b><span class="small muted">beste Streak</span></div>
    </div>
    <p>${lessonsDone} von ${lessonsTotal} Lektionen geschafft · ${Object.keys(d.cards).length} Vokabeln im Trainer</p>
  </section>`);

  const off = h(`<section class="card"><h2>Offline-Python</h2>
    <p class="pystatus"><span class="status-dot"></span><span class="t"></span></p>
    <p class="muted small">Beim ersten Mal lädt die App Python und die Bibliotheken aus dem Internet (einmalig ca. 60 MB, am besten im WLAN). Danach ist alles auf dem Gerät gespeichert und funktioniert ohne Netz.</p>
    <div class="pkg-list">${PACKAGES.map((p) => `<label>${offline.includes(p) ? '✅' : '⬜'} ${p}</label>`).join('')}</div>
    <button class="btn primary dl">⬇ Alles für offline laden</button>
    <div class="output dlout"></div>
  </section>`);
  const dot = off.querySelector('.status-dot');
  const stText = off.querySelector('.t');
  const unsub = py.onStatus((s) => {
    dot.className = 'status-dot ' + (s.status === 'ready' ? 'ok' : s.status === 'error' ? 'err' : 'busy');
    stText.textContent = s.text + (s.version ? ` (Pyodide ${s.version})` : '');
  });
  cleanup = unsub;
  off.querySelector('.dl').onclick = async (ev) => {
    const btn = ev.currentTarget;
    const out = off.querySelector('.dlout');
    btn.disabled = true;
    out.textContent = 'Starte …';
    try {
      await py.preload(PACKAGES, (t) => (out.textContent = t));
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(PACKAGES));
      out.textContent = 'Fertig! Python und alle Bibliotheken sind jetzt offline verfügbar.';
      toast('Offline bereit ✅');
      setTimeout(route, 1200);
    } catch (e) {
      out.textContent = 'Fehler: ' + e.message + '\nBist du online?';
      btn.disabled = false;
    }
  };

  const install = h(`<section class="card"><h2>Als App installieren</h2>
    <p><b>Android (Chrome):</b> Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</p>
    <p><b>iPhone (Safari):</b> Teilen-Symbol → „Zum Home-Bildschirm“.</p>
    <p><b>Laptop (Chrome/Edge):</b> Installieren-Symbol rechts in der Adressleiste.</p>
    <button class="btn inst" ${installPrompt ? '' : 'hidden'}>📲 Jetzt installieren</button>
  </section>`);
  install.querySelector('.inst').onclick = async () => { if (installPrompt) { installPrompt.prompt(); installPrompt = null; } };

  const backup = h(`<section class="card"><h2>Sicherung</h2>
    <p class="muted small">Dein Fortschritt liegt nur auf diesem Gerät. Mit einer Sicherungsdatei kannst du ihn aufs andere Gerät (Handy ↔ Laptop) übertragen.</p>
    <div class="row">
      <button class="btn exp">⬇ Sicherung speichern</button>
      <label class="btn">⬆ Sicherung laden<input type="file" accept=".json,application/json" hidden></label>
    </div>
    <div class="row" style="margin-top:16px"><button class="btn ghost reset" style="color:var(--bad)">Fortschritt zurücksetzen</button></div>
  </section>`);
  backup.querySelector('.exp').onclick = () => {
    const blob = new Blob([P.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pypfad-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  backup.querySelector('input[type=file]').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { P.importJson(await f.text()); toast('Sicherung geladen ✅'); route(); } catch (err) { toast(err.message); }
  };
  const rb = backup.querySelector('.reset');
  rb.onclick = () => {
    if (rb.dataset.armed) { P.reset(); toast('Fortschritt gelöscht'); route(); return; }
    rb.dataset.armed = '1';
    rb.textContent = 'Wirklich alles löschen? Nochmal tippen';
    setTimeout(() => { delete rb.dataset.armed; rb.textContent = 'Fortschritt zurücksetzen'; }, 4000);
  };

  const about = h(`<section class="card small muted">PyPfad · Inhalte v${esc(course.version || '?')} · Kostenlos, ohne Abo, ohne Leben, ohne Werbung.</section>`);
  view.append(stats, off, install, backup, about);
}

boot();

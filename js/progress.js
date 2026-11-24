// Fortschritt: XP, Level, Streak, Lektionen, Vokabelkarten. Alles lokal im Browser.
const KEY = 'pypfad-progress-v1';
export const DAILY_GOAL = 50;
// Leitner-Boxen: Tage bis zur naechsten Wiederholung
export const BOX_DAYS = [0, 1, 3, 7, 16];

function today(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return today(d);
}
function fresh() {
  return { xp: 0, streak: { count: 0, last: null, best: 0 }, daily: { date: null, xp: 0 }, lessons: {}, cards: {}, history: {} };
}

let data = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch (_) {}
  return fresh();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
}

export function get() { return data; }

export function levelInfo(xp = data.xp) {
  // Level n braucht 25*n*(n+1) XP insgesamt (50, 150, 300, 500 …)
  let level = 1;
  while (xp >= 25 * level * (level + 1)) level++;
  const from = 25 * (level - 1) * level;
  const to = 25 * level * (level + 1);
  return { level, from, to, pct: (xp - from) / (to - from) };
}

export function streakNow() {
  const s = data.streak;
  if (!s.last) return 0;
  const t = today();
  if (s.last === t || s.last === addDays(t, -1)) return s.count;
  return 0;
}

export function dailyXp() { return data.daily.date === today() ? data.daily.xp : 0; }

export function addXp(n) {
  const t = today();
  data.xp += n;
  if (data.daily.date !== t) data.daily = { date: t, xp: 0 };
  data.daily.xp += n;
  data.history[t] = (data.history[t] || 0) + n;
  // Streak: zaehlt, sobald an einem Tag etwas gelernt wurde
  const s = data.streak;
  if (s.last !== t) {
    s.count = s.last === addDays(t, -1) ? s.count + 1 : 1;
    s.last = t;
    s.best = Math.max(s.best || 0, s.count);
  }
  save();
}

export function lessonState(id) { return data.lessons[id] || null; }

export function finishLesson(id, accuracy) {
  const stars = accuracy >= 0.95 ? 3 : accuracy >= 0.75 ? 2 : 1;
  const prev = data.lessons[id];
  data.lessons[id] = {
    done: true,
    stars: Math.max(stars, prev ? prev.stars : 0),
    runs: (prev ? prev.runs : 0) + 1,
    last: today(),
  };
  save();
  return stars;
}

// ---- Vokabeln (Spaced Repetition) ----
export function addCards(ids) {
  let added = 0;
  for (const id of ids) {
    if (!data.cards[id]) { data.cards[id] = { box: 0, due: today() }; added++; }
  }
  save();
  return added;
}
export function dueCards() {
  const t = today();
  return Object.entries(data.cards).filter(([, c]) => c.due <= t).map(([id]) => id);
}
export function rateCard(id, knew) {
  const c = data.cards[id] || { box: 0 };
  c.box = knew ? Math.min(c.box + 1, BOX_DAYS.length - 1) : 0;
  c.due = addDays(today(), knew ? BOX_DAYS[c.box] : 0);
  data.cards[id] = c;
  save();
}
export function boxCounts() {
  const counts = BOX_DAYS.map(() => 0);
  Object.values(data.cards).forEach((c) => counts[c.box]++);
  return counts;
}

// ---- Backup ----
export function exportJson() { return JSON.stringify({ app: 'pypfad', exported: new Date().toISOString(), data }, null, 2); }
export function importJson(text) {
  const parsed = JSON.parse(text);
  const d = parsed && parsed.data;
  if (!d || typeof d.xp !== 'number') throw new Error('Das ist keine PyPfad-Sicherung.');
  data = { ...fresh(), ...d };
  save();
}
export function reset() { data = fresh(); save(); }

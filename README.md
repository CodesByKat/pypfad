# PyPfad 🐍

Eine kostenlose Lern-App für **Python, Daten und Machine Learning**, die nach dem ersten Laden **komplett offline** läuft, auf dem Handy und auf dem Laptop.
Ohne Abo, ohne Leben, ohne Wartezeiten, ohne Werbung.

## Was drin ist

- **Lernpfad** mit Welten und Lektionen, XP, Levels, Tagesziel und Streak
- **Aufgabentypen:** Multiple Choice, Lückentext (antippen statt tippen), Code-Puzzle (Zeilen ordnen und einrücken), Output vorhersagen, Vokabeln, Code schreiben mit automatischen Tests, Freitext mit Musterlösung
- **Vokabeltrainer** mit Wiederholung nach Lernkurve (Leitner-System) und Nachschlage-Liste
- **Spielwiese:** freies Python mit numpy, pandas, scikit-learn, matplotlib und sqlite3
- **Echtes Python im Browser** über [Pyodide](https://pyodide.org)

## Wie es technisch funktioniert

| Teil | Datei |
|---|---|
| Oberfläche | `index.html`, `css/style.css`, `js/app.js` |
| Aufgabentypen | `js/exercises.js`, `js/editor.js` |
| Python im Hintergrund (Web Worker) | `js/python.js`, `js/py-worker.js`, `js/runner.py` |
| Fortschritt (lokal im Browser) | `js/progress.js` |
| Offline-Fähigkeit | `sw.js` (Service Worker), `manifest.webmanifest` |
| Lerninhalte | `content/*.yaml` → `data/course.json` |

## Neue Lektionen schreiben

1. Eine YAML-Datei in `content/` bearbeiten oder neu anlegen (neue Welten in `content/course.yaml` eintragen).
2. Inhalte bauen und prüfen:
   ```bash
   pip install pyyaml numpy pandas scikit-learn matplotlib
   python tools/build_content.py
   ```
   Das Skript führt alle Musterlösungen aus, prüft sie gegen die Tests und berechnet die Antworten für „Was kommt raus?“-Aufgaben automatisch.
3. In `sw.js` die `VERSION` hochzählen, damit Geräte die neuen Inhalte laden.

## Lokal starten

```bash
python -m http.server 8000
# dann http://localhost:8000 öffnen
```

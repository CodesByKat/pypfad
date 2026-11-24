#!/usr/bin/env python3
"""Baut data/course.json aus den YAML-Dateien in content/ und prueft alle Aufgaben.

Aufruf:  python tools/build_content.py           (mit Ausfuehren der Code-Loesungen)
         python tools/build_content.py --no-run  (nur Struktur pruefen)

Braucht: pyyaml, und zum Ausfuehren numpy, pandas, scikit-learn, matplotlib.
"""
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = ROOT / "data" / "course.json"
TYPES = {"info", "mc", "cloze", "parsons", "predict", "code", "vocab", "free"}

errors = []
warnings = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def warn(where, msg):
    warnings.append(f"{where}: {msg}")


def load(name):
    with open(CONTENT / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def runner():
    ns = {}
    exec((ROOT / "js" / "runner.py").read_text(encoding="utf-8"), ns)
    return ns["_pp_run"]


def norm(s):
    return "\n".join(l.rstrip() for l in str(s).replace("\r", "").split("\n")).strip()


def check_exercise(ex, where, vocab_ids, run):
    t = ex.get("type")
    if t not in TYPES:
        return err(where, f"unbekannter Typ {t!r}")
    if t == "mc" or (t == "predict" and "options" in ex):
        opts = ex.get("options") or []
        ans = ex.get("answer")
        idx = ans if isinstance(ans, list) else [ans]
        if len(opts) < 2:
            err(where, "mindestens 2 Optionen noetig")
        if not all(isinstance(i, int) and 0 <= i < len(opts) for i in idx):
            err(where, f"answer {ans!r} passt nicht zu {len(opts)} Optionen")
    if t == "cloze":
        n = ex["code"].count("___")
        if n != len(ex.get("answers", [])):
            err(where, f"{n} Luecken, aber {len(ex.get('answers', []))} Antworten")
        ex["answers"] = [str(a) if not isinstance(a, list) else [str(x) for x in a] for a in ex["answers"]]
        ex["distractors"] = [str(d) for d in ex.get("distractors", [])]
    if t == "parsons":
        for line in ex["code"].splitlines():
            sp = len(line) - len(line.lstrip(" "))
            if line.strip() and sp % 4:
                err(where, f"Einrueckung kein Vielfaches von 4: {line!r}")
    if t == "vocab" and ex.get("id") not in vocab_ids:
        err(where, f"Vokabel {ex.get('id')!r} existiert nicht")
    if t == "code":
        for k in ("starter", "solution", "tests"):
            if k not in ex:
                err(where, f"Feld {k!r} fehlt")
    if not run:
        return
    if t == "predict" and "options" not in ex:
        res = json.loads(run(ex["code"], "", ex.get("setup", "")))
        if res["error"]:
            return err(where, f"Code wirft Fehler: {res['error']}")
        if "answer" in ex:
            if norm(ex["answer"]) != norm(res["stdout"]):
                err(where, f"answer {ex['answer']!r} != Ausgabe {res['stdout']!r}")
        else:
            ex["answer"] = norm(res["stdout"])
    if t == "info" and ex.get("run"):
        res = json.loads(run(ex["code"], "", ex.get("setup", "")))
        if res["error"]:
            err(where, f"Beispielcode wirft Fehler: {res['error']}")
    if t == "code":
        res = json.loads(run(ex["solution"], ex["tests"], ex.get("setup", "")))
        if res["error"] or not (res["test"] and res["test"]["ok"]):
            err(where, f"Musterloesung besteht die Tests nicht: {res['error'] or res['test']}")
        res = json.loads(run(ex["starter"], ex["tests"], ex.get("setup", "")))
        if res["test"] and res["test"]["ok"]:
            warn(where, "Startcode besteht die Tests schon")


def main():
    do_run = "--no-run" not in sys.argv
    run = runner() if do_run else None
    meta = load("course.yaml")
    vocab = load("vocab.yaml")
    vocab_ids = set()
    for v in vocab:
        if v["id"] in vocab_ids:
            err("vocab", f"doppelte id {v['id']}")
        vocab_ids.add(v["id"])
        v["example"] = (v.get("example") or "").rstrip("\n")

    worlds = []
    lesson_ids = set()
    for fname in meta["worlds"]:
        w = load(fname)
        for lesson in w["lessons"]:
            lid = lesson["id"]
            if lid in lesson_ids:
                err(lid, "doppelte Lektions-id")
            lesson_ids.add(lid)
            for v in lesson.get("vocab", []):
                if v not in vocab_ids:
                    err(lid, f"Vokabel {v!r} existiert nicht")
            for i, ex in enumerate(lesson["exercises"]):
                check_exercise(ex, f"{lid}#{i + 1} ({ex.get('type')})", vocab_ids, run)
                print(".", end="", flush=True)
        worlds.append(w)
    print()

    playground = load("playground.yaml")
    if do_run:
        for p in playground:
            res = json.loads(run(p["code"]))
            if res["error"]:
                err(f"Spielwiese {p['title']}", str(res["error"]))

    for w in warnings:
        print("WARNUNG", w)
    if errors:
        for e in errors:
            print("FEHLER ", e)
        sys.exit(1)

    course = {"version": str(meta.get("version", "1")), "worlds": worlds, "vocab": vocab,
              "playground": playground, "comingSoon": meta.get("comingSoon", [])}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(course, ensure_ascii=False, indent=1), encoding="utf-8")
    n_ex = sum(len(l["exercises"]) for w in worlds for l in w["lessons"])
    print(f"OK: {len(worlds)} Welten, {len(lesson_ids)} Lektionen, {n_ex} Aufgaben, {len(vocab)} Vokabeln -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

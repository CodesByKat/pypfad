# Fuehrt Lern-Code aus, sammelt Ausgabe, Grafiken und Testergebnisse.
# Wird im Browser (Pyodide) und vom Build-Skript (normales Python) benutzt.
import base64
import io
import json
import os
import sys
import traceback

os.environ.setdefault("MPLBACKEND", "AGG")


def _pp_err(e):
    if isinstance(e, SyntaxError):
        return {"type": type(e).__name__, "msg": e.msg, "line": e.lineno}
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "<dein_code>"]
    line = frames[-1].lineno if frames else None
    return {"type": type(e).__name__, "msg": str(e), "line": line}


def _pp_figures():
    figs = []
    if "matplotlib.pyplot" not in sys.modules:
        return figs
    import matplotlib.pyplot as plt
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=90, bbox_inches="tight")
        figs.append(base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return figs


def _pp_run(code, tests="", setup=""):
    ns = {"__name__": "__main__"}
    buf = io.StringIO()
    old = (sys.stdout, sys.stderr)
    sys.stdout = sys.stderr = buf
    res = {"error": None, "test": None, "figures": []}
    try:
        if setup:
            exec(compile(setup, "<setup>", "exec"), ns)
        try:
            exec(compile(code, "<dein_code>", "exec"), ns)
        except BaseException as e:  # auch SystemExit
            res["error"] = _pp_err(e)
    finally:
        sys.stdout, sys.stderr = old
    res["stdout"] = buf.getvalue()
    try:
        res["figures"] = _pp_figures()
    except Exception:
        pass
    if tests and res["error"] is None:
        ns["_ausgabe"] = res["stdout"]
        tbuf = io.StringIO()
        sys.stdout = tbuf
        try:
            exec(compile(tests, "<tests>", "exec"), ns)
            res["test"] = {"ok": True}
        except AssertionError as e:
            res["test"] = {"ok": False, "msg": str(e) or "Ein Test ist fehlgeschlagen."}
        except Exception as e:
            res["test"] = {"ok": False, "msg": f"{type(e).__name__}: {e}"}
        finally:
            sys.stdout = old[0]
    return json.dumps(res)

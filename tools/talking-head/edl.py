import json, os
FPS = 25
_env = {}
def _db(voice):
    if voice not in _env:
        import vad; _env[voice] = vad.envelope(voice)
    return _env[voice]
def snap(t, voice=None):
    """Snap to the 25p frame grid; with a voice track pick the quieter neighbour frame."""
    lo, hi = int(t * FPS) / FPS, (int(t * FPS) + 1) / FPS
    if abs(t * FPS - round(t * FPS)) < 1e-6: return round(round(t * FPS) / FPS, 4)
    if voice is None: return round(round(t * FPS) / FPS, 4)
    db, hop = _db(voice)
    lvl = lambda x: db[min(int(x / hop), len(db) - 1)]
    return round(lo if lvl(lo) <= lvl(hi) else hi, 4)
def load(path, root):
    e = json.load(open(path)); e["src"] = os.path.join(root, e["src"]); e["voice"] = os.path.join(root, e["voice"])
    e["music"] = os.path.join(root, e["music"])
    e["segments"] = [[snap(a, e["voice"]), snap(b, e["voice"])] for a, b in e["segments"]]
    rec = 0.0; e["rec"] = []
    for a, b in e["segments"]: e["rec"].append([round(rec, 4), round(rec + b - a, 4)]); rec += b - a
    e["duration"] = round(rec, 4); return e
def src_to_rec(e, t):
    for (a, b), (r0, r1) in zip(e["segments"], e["rec"]):
        if a - 1e-6 <= t <= b + 1e-6: return round(r0 + t - a, 4)
    return None

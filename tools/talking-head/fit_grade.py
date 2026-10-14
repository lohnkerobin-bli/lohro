"""Fit the per-clip Gawx correction on top of the brand LUT.
usage: fit_grade.py SRC.MP4 BRAND_LUT.cube KEY TARGET_MEAN TARGET_SAT W H t1 t2 ... [--params grade_params.json]
Grabs the frames (S-Log3, video range), fits pre-LUT exposure + black/white/tints/saturation towards the
Gawx centre values (black 8, white ~188, given mean, shadows B-R +5, highlights B-R -25/-26, given sat)
and stores the parameters under KEY in grade_params.json."""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, grade as G
args = [a for a in sys.argv[1:] if not a.startswith("--")]
out = sys.argv[sys.argv.index("--params") + 1] if "--params" in sys.argv else "grade_params.json"
src, lutp, key, tmean, tsat, w, h = args[:7]; ts = [float(t) for t in args[7:] if t != out]
lut = G.read_cube(lutp)
raw = np.stack([G.grab(src, t, int(w), int(h)) for t in ts])
init = {"knee": 0.5, "contrast": 0.85} if float(tmean) > 60 else {}
p, m = G.fit(raw[:, ::3, ::3], lut, float(tmean), iters=20, p=init, target_sat=float(tsat))
full = G.metrics(G.full_grade(raw, lut, p))
print(key, {k: round(float(v), 3) for k, v in p.items()}); print(full, G.check(full))
d = json.load(open(out)) if os.path.exists(out) else {}
d[key] = {k: float(v) for k, v in p.items()}; json.dump(d, open(out, "w"), indent=1)

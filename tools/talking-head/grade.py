"""Lohro grading helpers: LUT apply/bake, parametric correction, Gawx metrics.
All images: float32 RGB in 0..1, display-referred Rec.709 (after LUT)."""
import numpy as np, subprocess, json

def read_cube(path):
    n = None; rows = []
    for line in open(path, encoding="utf-8", errors="ignore"):
        t = line.strip()
        if t.startswith("LUT_3D_SIZE"): n = int(t.split()[1]); continue
        if not t or t[0].isalpha() or t[0] == "#": continue
        rows.append([float(v) for v in t.split()[:3]])
    a = np.asarray(rows, np.float32)
    return a.reshape(n, n, n, 3)  # index [b][g][r] because r varies fastest

def apply_lut(img, lut):
    n = lut.shape[0]; x = np.clip(img, 0, 1) * (n - 1)
    i0 = np.floor(x).astype(np.int32); i0 = np.clip(i0, 0, n - 2); f = x - i0
    r0, g0, b0 = i0[..., 0], i0[..., 1], i0[..., 2]; fr, fg, fb = f[..., 0:1], f[..., 1:2], f[..., 2:3]
    def L(db, dg, dr): return lut[b0 + db, g0 + dg, r0 + dr]
    c00 = L(0,0,0)*(1-fr) + L(0,0,1)*fr; c01 = L(0,1,0)*(1-fr) + L(0,1,1)*fr
    c10 = L(1,0,0)*(1-fr) + L(1,0,1)*fr; c11 = L(1,1,0)*(1-fr) + L(1,1,1)*fr
    c0 = c00*(1-fg) + c01*fg; c1 = c10*(1-fg) + c11*fg
    return c0*(1-fb) + c1*fb

def luma(img): return img[..., 0]*0.2126 + img[..., 1]*0.7152 + img[..., 2]*0.0722

def correct(img, p):
    """p: exposure (stops), black (0..1 floor), white (0..1 ceiling), knee (0..1),
    contrast (pivot 0.4), sh_tint (B-R push in shadows), hi_tint (R-B push in highlights), sat."""
    x = np.clip(img, 0, 1)
    lin = x ** 2.4 * (2.0 ** p.get("exposure", 0.0)); x = lin ** (1/2.4)
    c = p.get("contrast", 1.0); x = np.clip(0.4 + (x - 0.4) * c, 0, None)
    t = p.get("toe", 0.0); x = np.maximum(x - t, 0) / (1 - t)
    # soft highlight roll-off: values above knee compress smoothly towards 1.0
    k = p.get("knee", 0.7)
    over = np.maximum(x - k, 0); x = np.where(x > k, k + (1 - k) * (1 - np.exp(-over / (1 - k))), x)
    # tints (weighted by luma masks)
    y = luma(x)[..., None]
    sh = np.clip(1 - y / 0.35, 0, 1) ** 1.5; hi = np.clip((y - 0.45) / 0.55, 0, 1) ** 1.2
    st, ht = p.get("sh_tint", 0.0), p.get("hi_tint", 0.0)
    x = x + sh * np.array([-st, 0, st], np.float32) + hi * np.array([ht, ht*0.35, -ht], np.float32)
    # saturation around luma
    s = p.get("sat", 1.0); y = luma(x)[..., None]; x = y + (x - y) * s
    # output range: black floor + white ceiling (levels)
    b, w = p.get("black", 0.03), p.get("white", 0.78)
    x = b + np.clip(x, 0, 1) * (w - b)
    return np.clip(x, 0, 1).astype(np.float32)

def metrics(img):
    v = np.clip(img, 0, 1) * 255.0; y = luma(v)
    p_lo, p_hi = np.percentile(y, 0.5), np.percentile(y, 99.5)
    sh = y <= np.percentile(y, 15); hi = (y >= np.percentile(y, 90)) & (y < 250)
    mx, mn = v.max(-1), v.min(-1); valid = mx > 15
    sat = ((mx - mn) / np.maximum(mx, 1e-6))[valid].mean() * 100
    return {"black": round(float(p_lo), 1), "white": round(float(p_hi), 1), "mean": round(float(y.mean()), 1),
            "shadow_BminusR": round(float(v[..., 2][sh].mean() - v[..., 0][sh].mean()), 1),
            "high_BminusR": round(float(v[..., 2][hi].mean() - v[..., 0][hi].mean()), 1),
            "sat_pct": round(float(sat), 1)}

TARGET = {"black": (5, 12), "white": (120, 200), "mean": (35, 85), "shadow_BminusR": (2, 99),
          "high_BminusR": (-999, -20), "sat_pct": (15, 45)}

def check(m):
    return {k: ("OK" if TARGET[k][0] <= m[k] <= TARGET[k][1] else "AUS") for k in TARGET}

def grab(src, t, w, h, rotate_auto=True):
    """Return float RGB frame from S-Log3 source (video range, bt709 matrix) at time t."""
    cmd = ["ffmpeg", "-v", "error", "-ss", str(t), "-i", src, "-frames:v", "1",
           "-vf", f"scale={w}:{h}:in_range=tv:in_color_matrix=bt709:flags=area,format=rgb48le",
           "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return (np.frombuffer(raw, np.uint16).reshape(h, w, 3).astype(np.float32) / 65535.0)

def bake(lut, p, path, n=33, title="LOHRO grade"):
    g = np.linspace(0, 1, n, dtype=np.float32)
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")
    grid = np.stack([r, gg, b], -1)
    out = correct(apply_lut(grid, lut), p) if lut is not None else correct(grid, p)
    with open(path, "w") as f:
        f.write(f'TITLE "{title}"\nLUT_3D_SIZE {n}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
        for row in out.reshape(-1, 3): f.write(f"{row[0]:.6f} {row[1]:.6f} {row[2]:.6f}\n")

SLOG3_STOP = 261.5 * np.log10(2) / 876.0   # one stop in S-Log3, video-range-normalised code

def full_grade(raw, lut, p):
    x = np.clip(raw + p.get("pre_ev", 0.0) * SLOG3_STOP, 0, 1)
    return correct(apply_lut(x, lut), p)

def fit(raw, lut, target_mean, iters=14, p=None, target_sat=30):
    """Heuristic per-clip fit of the correction towards the Gawx centre values."""
    p = dict(p or {}); p.setdefault("pre_ev", 0.0); p.setdefault("exposure", 0.0)
    p.setdefault("contrast", 0.9); p.setdefault("knee", 0.62); p.setdefault("sh_tint", 0.03)
    p.setdefault("hi_tint", 0.02); p.setdefault("sat", 0.8); p.setdefault("black", 8/255); p.setdefault("white", 0.8)
    for _ in range(iters):
        m = metrics(full_grade(raw, lut, p))
        p["pre_ev"] += np.clip(np.log2(target_mean / max(m["mean"], 1)) * 0.8, -1, 1)
        p.setdefault("toe", 0.0)
        if p["black"] <= 0.001 and m["black"] > 9: p["toe"] = float(np.clip(p["toe"] + (m["black"] - 8) / 255 * 0.8, 0, 0.2))
        else: p["black"] = float(np.clip(p["black"] + (8 - m["black"]) / 255 * 0.8, 0, 0.08))
        p["white"] = float(np.clip(p["white"] * (1 + (188 - m["white"]) / 255 * 0.9), 0.3, 1))
        p["sh_tint"] = float(np.clip(p["sh_tint"] + (5 - m["shadow_BminusR"]) / 255 * 1.2, -0.1, 0.25))
        p["hi_tint"] = float(np.clip(p["hi_tint"] + (m["high_BminusR"] + 26) / 255 * 0.6, -0.1, 0.2))
        p["sat"] = float(np.clip(p["sat"] * (target_sat / max(m["sat_pct"], 1)) ** 0.7, 0.2, 1.5))
    return p, metrics(full_grade(raw, lut, p))

def _raw(cmd, w, h):
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint16).reshape(h, w, 3).astype(np.float32) / 65535.0

def grab_crop(src, t, cw, ch, x0, y0, w, h):
    return _raw(["ffmpeg", "-v", "error", "-ss", str(t), "-i", src, "-frames:v", "1", "-vf",
                 f"crop={cw}:{ch}:{x0}:{y0},scale={w}:{h}:in_range=tv:in_color_matrix=bt709:flags=lanczos,format=rgb48le",
                 "-f", "rawvideo", "-"], w, h)

def grab_plain(src, t, w, h):
    return _raw(["ffmpeg", "-v", "error", "-ss", str(t), "-i", src, "-frames:v", "1", "-vf",
                 f"scale={w}:{h}:in_range=tv:in_color_matrix=bt709:flags=area,format=rgb48le", "-f", "rawvideo", "-"], w, h)

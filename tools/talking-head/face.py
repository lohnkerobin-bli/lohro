"""Median face centre per EDL segment (normalised to the displayed frame)."""
import cv2, subprocess, numpy as np, sys, json
sys.path.insert(0, sys.path[0]); import edl
fr = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
pr = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
def grab(src, t, w):
    out = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", src, "-frames:v", "1", "-vf", f"scale={w}:-2",
                          "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True).stdout
    return cv2.imdecode(np.frombuffer(out, np.uint8), cv2.IMREAD_COLOR)
e = edl.load(sys.argv[1], sys.argv[2]); res = []
for a, b in e["segments"]:
    pts = []
    for t in np.linspace(a + 0.05, b - 0.05, 4 if b - a > 1 else 2):
        im = grab(e["src"], t, 960); g = cv2.equalizeHist(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)); H, W = g.shape
        faces = list(fr.detectMultiScale(g, 1.1, 5, minSize=(40, 40)))
        if not faces: faces = list(pr.detectMultiScale(g, 1.1, 4, minSize=(40, 40))) + [(W - x - w, y, w, h) for x, y, w, h in pr.detectMultiScale(cv2.flip(g, 1), 1.1, 4, minSize=(40, 40))]
        if faces:
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3]); pts.append(((x + w / 2) / W, (y + h / 2) / H, h / H))
    if pts:
        m = np.median(np.array(pts), 0); res.append({"seg": [a, b], "cx": round(float(m[0]), 3), "cy": round(float(m[1]), 3), "fh": round(float(m[2]), 3), "n": len(pts)})
    else: res.append({"seg": [a, b], "cx": None, "cy": None, "fh": None, "n": 0})
    print(res[-1], flush=True)
json.dump(res, open(sys.argv[3], "w"), indent=1)

"""Energy-based speech activity on a mono 48k wav; returns list of (start,end) seconds."""
import wave, numpy as np
def envelope(path, hop=0.01, win=0.03):
    w = wave.open(path); sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    # crude high-pass (voice band) via first difference blend to ignore rumble
    a = a - np.convolve(a, np.ones(64) / 64, mode="same")
    H, W = int(hop * sr), int(win * sr)
    n = max(1, (len(a) - W) // H)
    rms = np.array([np.sqrt((a[i*H:i*H+W] ** 2).mean() + 1e-12) for i in range(n)])
    return 20 * np.log10(rms), hop
def speech(path, above_floor_db=14, min_sil=0.12, min_sp=0.06):
    db, hop = envelope(path)
    floor = np.percentile(db, 10); thr = floor + above_floor_db
    act = db > thr
    segs = []; i = 0
    while i < len(act):
        if act[i]:
            j = i
            while j < len(act) and act[j]: j += 1
            segs.append([i * hop, j * hop]); i = j
        else: i += 1
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < min_sil: merged[-1][1] = s[1]
        else: merged.append(s)
    return [(round(s, 2), round(e, 2)) for s, e in merged if e - s >= min_sp], floor, thr

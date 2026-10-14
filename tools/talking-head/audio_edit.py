"""Cut the voice channel by the EDL with 8 ms fades; writes 48k mono wav."""
import sys, wave, numpy as np, json
sys.path.insert(0, sys.path[0]); import edl
e = edl.load(sys.argv[1], sys.argv[2]); out = sys.argv[3]
w = wave.open(e["voice"]); sr = w.getframerate()
a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
parts = []; fade = int(0.008 * sr)
for s, t in e["segments"]:
    seg = a[int(round(s * sr)):int(round(t * sr))].copy()
    ramp = np.linspace(0, 1, fade); seg[:fade] *= ramp; seg[-fade:] *= ramp[::-1]
    parts.append(seg)
y = np.concatenate(parts).astype(np.int16)
o = wave.open(out, "w"); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(y.tobytes()); o.close()
print(out, "dur", round(len(y) / sr, 3), "edl dur", e["duration"])
